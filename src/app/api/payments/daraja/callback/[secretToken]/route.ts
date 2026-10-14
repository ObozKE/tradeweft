import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { getDarajaConfig } from '@/features/payments/daraja/config';
import { darajaCallbackSchema } from '@/features/payments/schemas/payment.schema';
import {
  settlePayment,
  failPayment,
} from '@/features/payments/services/payment-settlement.service';
import { queryDarajaStkStatus } from '@/features/payments/daraja/adapter';

/**
 * Safaricom IP subnets allowlist check (defense in depth in production).
 * Subnets: 196.201.212.0/22 (covers 212.*, 213.*, 214.*, 215.*)
 */
function isSafaricomGatewayIp(ip: string): boolean {
  if (!ip) return false;
  // Strip IPv6 prefix if present (e.g. ::ffff:196.201.214.200)
  const cleanIp = ip.replace(/^::ffff:/, '');

  // Match 196.201.212.* through 196.201.215.*
  const match = cleanIp.match(/^196\.201\.(21[2-5])\.\d+$/);
  return Boolean(match);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secretToken: string }> }
) {
  const { secretToken } = await params;
  const config = getDarajaConfig();

  // 1. Verify unguessable callback token
  if (!secretToken || secretToken !== config.callbackSecret) {
    logger.warn({ event: 'daraja.callback_unauthorized_token' }, 'Unauthorized callback token');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. IP Filtering in production
  if (process.env.NODE_ENV === 'production') {
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '';

    if (!isSafaricomGatewayIp(clientIp)) {
      logger.warn(
        { clientIp, event: 'daraja.callback_untrusted_ip' },
        'Rejected callback from non-Safaricom IP address'
      );
      return NextResponse.json({ error: 'Untrusted origin' }, { status: 403 });
    }
  }

  // 3. Body Size Cap (max 32 KB)
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 32_768) {
    logger.warn({ contentLength, event: 'daraja.callback_payload_too_large' });
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    logger.warn({ event: 'daraja.callback_invalid_json' });
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  // 4. Validate Callback Schema
  const parseResult = darajaCallbackSchema.safeParse(rawJson);
  if (!parseResult.success) {
    logger.warn(
      { errors: parseResult.error.flatten(), event: 'daraja.callback_schema_mismatch' },
      'Received malformed callback payload from Daraja'
    );
    // Still return 200 so Safaricom doesn't endlessly retry malformed payloads
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  const { stkCallback } = parseResult.data.Body;
  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;

  const supabase = createAdminClient();

  // 5. Ingest Raw Event into payment_events_raw (Restricted Audit Store)
  try {
    await supabase.from('payment_events_raw').insert({
      provider: 'mpesa_daraja',
      event_type: 'stk_callback',
      checkout_request_id: checkoutRequestId,
      payload: rawJson as any,
    });
  } catch (err: any) {
    logger.error({ error: err.message, event: 'daraja.raw_event_insert_failed' });
  }

  // 6. Asynchronous Double Verification & Settlement
  // Callbacks are untrusted hints. We query the provider's status API to confirm before settling.
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('checkout_request_id', checkoutRequestId)
      .single();

    if (!payment) {
      logger.warn(
        { checkoutRequestId, event: 'daraja.callback_unknown_payment' },
        'Callback received for unknown checkout_request_id'
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (payment.status === 'succeeded') {
      logger.info(
        { paymentId: payment.id, event: 'daraja.callback_already_settled' },
        'Payment already settled'
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (resultCode === 0) {
      // Confirm outcome by querying the provider's query API
      const providerCheck = await queryDarajaStkStatus(checkoutRequestId);

      if (providerCheck.isSuccess && providerCheck.receiptNumber) {
        await settlePayment({
          paymentId: payment.id,
          checkoutRequestId,
          receiptNumber: providerCheck.receiptNumber,
          verifiedAmountMinor: payment.amount_minor,
          note: `Callback confirmed via Daraja Query (${providerCheck.receiptNumber})`,
        });
      } else {
        logger.warn(
          { paymentId: payment.id, providerCheck, event: 'daraja.callback_provider_query_unverified' },
          'Callback reported success but provider query was not final/success'
        );
      }
    } else {
      // Payment failed or was cancelled by user
      const isCancelled = resultCode === 1032;
      await failPayment({
        paymentId: payment.id,
        failureCode: String(resultCode),
        failureReason: stkCallback.ResultDesc,
        terminalStatus: isCancelled ? 'cancelled' : 'failed',
      });
    }
  } catch (error: any) {
    logger.error(
      { checkoutRequestId, error: error?.message, event: 'daraja.callback_settlement_error' },
      'Error during callback settlement'
    );
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

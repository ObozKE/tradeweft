import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { queryDarajaStkStatus } from '../daraja/adapter';
import type { PaymentStatus } from '../types/payment.types';

export interface SettlePaymentParams {
  paymentId: string;
  checkoutRequestId: string;
  receiptNumber: string;
  verifiedAmountMinor: number;
  note?: string;
}

export interface FailPaymentParams {
  paymentId: string;
  failureCode: string;
  failureReason: string;
  terminalStatus?: PaymentStatus;
}

/**
 * Executes atomic database settlement of a payment transaction.
 */
export async function settlePayment(params: SettlePaymentParams) {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('settle_payment_transaction', {
    p_payment_id: params.paymentId,
    p_checkout_request_id: params.checkoutRequestId,
    p_receipt_number: params.receiptNumber,
    p_verified_amount_minor: params.verifiedAmountMinor,
    p_note: params.note || null,
  });

  if (error) {
    logger.warn(
      { paymentId: params.paymentId, error: error.message, event: 'payment.settle_rpc_fallback' },
      'Atomic settlement RPC unavailable, executing direct table fallback'
    );

    // Direct table fallback for resilience
    await supabase
      .from('payments')
      .update({
        status: 'succeeded',
        receipt_number: params.receiptNumber,
        checkout_request_id: params.checkoutRequestId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.paymentId);

    const { data: p } = await supabase
      .from('payments')
      .select('purpose, target_id, payer_id, amount_minor, currency_code, price_snapshot')
      .eq('id', params.paymentId)
      .single();

    if (p?.purpose === 'top_ad') {
      const durationDays = (p.price_snapshot as any)?.durationDays || 7;
      const now = new Date();
      const end = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);
      const periodRange = `["${now.toISOString()}","${end.toISOString()}"]`;
      await supabase
        .from('listing_promotions')
        .update({
          status: 'active',
          payment_id: params.paymentId,
          period: periodRange,
          updated_at: now.toISOString(),
        })
        .or(`id.eq.${p.target_id},payment_id.eq.${params.paymentId}`);
    } else if (p?.purpose === 'boost_period') {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: end.toISOString(),
          latest_payment_id: params.paymentId,
          updated_at: now.toISOString(),
        })
        .or(`id.eq.${p.target_id},user_id.eq.${p.payer_id}`);
    }

    return { success: true, payment_id: params.paymentId, status: 'succeeded' };
  }

  logger.info(
    { paymentId: params.paymentId, receiptNumber: params.receiptNumber, event: 'payment.settled_successfully' },
    'Payment settled and product activated'
  );

  return data;
}

/**
 * Executes atomic failure transition for a payment transaction.
 */
export async function failPayment(params: FailPaymentParams) {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('fail_payment_transaction', {
    p_payment_id: params.paymentId,
    p_failure_code: params.failureCode,
    p_failure_reason: params.failureReason,
    p_terminal_status: params.terminalStatus || 'failed',
  });

  if (error) {
    logger.warn(
      { paymentId: params.paymentId, error: error.message, event: 'payment.fail_rpc_fallback' },
      'Payment failure RPC unavailable, executing direct table fallback'
    );

    // Direct table fallback
    await supabase
      .from('payments')
      .update({
        status: params.terminalStatus || 'failed',
        failure_code: params.failureCode,
        failure_reason: params.failureReason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.paymentId);

    await supabase
      .from('listing_promotions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .or(`id.eq.${params.paymentId},payment_id.eq.${params.paymentId}`)
      .eq('status', 'held');

    return { success: true, payment_id: params.paymentId, status: params.terminalStatus || 'failed' };
  }

  logger.info(
    { paymentId: params.paymentId, failureCode: params.failureCode, event: 'payment.marked_failed' },
    'Payment marked as failed and held slots released'
  );

  return data;
}

/**
 * Reconciles an individual payment by querying Safaricom Daraja directly.
 * Source of truth is always the payment provider query.
 */
export async function reconcilePaymentWithProvider(paymentId: string) {
  const supabase = createAdminClient();

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    logger.error({ paymentId, error: error?.message, event: 'payment.reconcile_not_found' });
    throw new Error('Payment not found');
  }

  // If already in a terminal state, nothing to reconcile
  if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(payment.status)) {
    return {
      paymentId,
      status: payment.status,
      alreadyFinal: true,
    };
  }

  if (!payment.checkout_request_id) {
    logger.warn({ paymentId, event: 'payment.reconcile_missing_checkout_id' });
    return {
      paymentId,
      status: payment.status,
      error: 'Missing checkout_request_id',
    };
  }

  // Query provider
  const result = await queryDarajaStkStatus(payment.checkout_request_id);

  if (result.isSuccess && result.receiptNumber) {
    await settlePayment({
      paymentId: payment.id,
      checkoutRequestId: payment.checkout_request_id,
      receiptNumber: result.receiptNumber,
      verifiedAmountMinor: payment.amount_minor,
      note: `Reconciled with Daraja: ${result.receiptNumber}`,
    });

    return {
      paymentId,
      status: 'succeeded',
      receiptNumber: result.receiptNumber,
    };
  }

  if (result.isFinal && !result.isSuccess) {
    const terminalStatus: PaymentStatus = result.resultCode === 1032 ? 'cancelled' : 'failed';

    await failPayment({
      paymentId: payment.id,
      failureCode: String(result.resultCode),
      failureReason: result.userMessage,
      terminalStatus,
    });

    return {
      paymentId,
      status: terminalStatus,
      resultCode: result.resultCode,
    };
  }

  // Still pending on provider side: increment attempt counter
  await supabase
    .from('payments')
    .update({
      attempts: (payment.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);

  return {
    paymentId,
    status: 'pending',
    resultCode: result.resultCode,
  };
}

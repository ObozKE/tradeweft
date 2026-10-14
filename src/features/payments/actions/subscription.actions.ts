'use server';

import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/errors';
import {
  paymentInitiateLimiter,
  paymentPhoneLimiter,
} from '@/lib/rate-limit';
import {
  initiateBoostSchema,
  type InitiateBoostInput,
} from '../schemas/payment.schema';
import { calculateTaxBreakdown } from '../utils/money';
import { initiateDarajaStkPush } from '../daraja/adapter';
import { failPayment } from '../services/payment-settlement.service';

export interface InitiateBoostResult {
  paymentId: string;
  checkoutRequestId: string;
  amountMinor: number;
  currencyCode: string;
  customerMessage: string;
}

/**
 * Initiates Boost Plan subscription purchase via Safaricom M-Pesa STK Push.
 */
export async function initiateBoostSubscriptionAction(
  input: InitiateBoostInput
): Promise<Result<InitiateBoostResult>> {
  const { user, supabase } = await requireOnboardedUser();

  // 1. Validate Input
  const parsed = initiateBoostSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      'VALIDATION_FAILED',
      parsed.error.errors[0]?.message || 'Invalid subscription inputs'
    );
  }

  const { planId, phoneNumber, idempotencyKey } = parsed.data;

  // 2. Rate Limiting
  const userRate = await paymentInitiateLimiter.check(user.id);
  if (!userRate.success) {
    return err('RATE_LIMITED', 'Too many payment requests. Please wait a few minutes.');
  }

  const phoneRate = await paymentPhoneLimiter.check(phoneNumber);
  if (!phoneRate.success) {
    return err('RATE_LIMITED', 'Too many payment requests for this phone number.');
  }

  const adminSupabase = createAdminClient();

  // 3. Prevent duplicate active prompts (within last 2 minutes)
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recentPending } = await adminSupabase
    .from('payments')
    .select('id, checkout_request_id, amount_minor, currency_code')
    .eq('payer_id', user.id)
    .eq('purpose', 'boost_period')
    .eq('status', 'pending')
    .gt('created_at', twoMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentPending && recentPending.checkout_request_id) {
    return ok({
      paymentId: recentPending.id,
      checkoutRequestId: recentPending.checkout_request_id,
      amountMinor: Number(recentPending.amount_minor),
      currencyCode: recentPending.currency_code,
      customerMessage: 'A payment prompt is already pending on your phone. Please enter your M-Pesa PIN.',
    });
  }

  // 4. Resolve User Country
  const { data: profile } = await supabase
    .from('profiles')
    .select('country_code')
    .eq('id', user.id)
    .single();

  const countryCode = profile?.country_code || 'KE';

  // 5. Look up Plan and Price Book Entry
  const { data: planRecord, error: planErr } = await adminSupabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (planErr || !planRecord) {
    return err('NOT_FOUND', 'Selected Boost plan is not active or available');
  }

  const nowIso = new Date().toISOString();
  const { data: priceBookEntry, error: priceErr } = await adminSupabase
    .from('price_book')
    .select('*')
    .eq('product_id', planId)
    .eq('country_code', countryCode)
    .eq('currency_code', 'KES')
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (priceErr || !priceBookEntry) {
    return err('NOT_FOUND', 'Pricing not configured for this plan in your country');
  }

  const amountMinor = Number(priceBookEntry.amount_minor);
  const vatRate = (Number(priceBookEntry.tax_rate_bps) || 1600) / 10000;
  const taxBreakdown = calculateTaxBreakdown(amountMinor, vatRate);

  // 6. Find or Create Subscriptions row in 'pending' status
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const graceEnd = new Date(now.getTime() + 33 * 24 * 3600 * 1000);

  // Check if existing pending or grace subscription can be updated, or if an active one exists
  const { data: existingSub } = await adminSupabase
    .from('subscriptions')
    .select('id, status, plan_id, current_period_end')
    .eq('user_id', user.id)
    .in('status', ['active', 'grace', 'pending'])
    .maybeSingle();

  let subscriptionId: string;

  if (existingSub) {
    if (existingSub.status === 'active' && existingSub.plan_id === planId) {
      // User is renewing early or upgrading
      const diffDays = Math.ceil(
        (new Date(existingSub.current_period_end).getTime() - Date.now()) / (24 * 3600 * 1000)
      );
      if (diffDays > 7) {
        return err(
          'VALIDATION_FAILED',
          `You already have an active ${planRecord.name} plan that expires in ${diffDays} days. Early renewals open 7 days before expiry.`
        );
      }
    }

    // Reuse/update existing subscription
    const { data: updatedSub, error: updateSubErr } = await adminSupabase
      .from('subscriptions')
      .update({
        plan_id: planId,
        status: existingSub.status === 'active' ? 'active' : 'pending',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_end: graceEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      })
      .eq('id', existingSub.id)
      .select('id')
      .single();

    if (updateSubErr || !updatedSub) {
      logger.error({ error: updateSubErr?.message, event: 'boost.subscription_update_failed' });
      return err('INTERNAL_ERROR', 'Failed to update subscription record');
    }
    subscriptionId = updatedSub.id;
  } else {
    // Insert new subscription
    const { data: newSub, error: subInsertErr } = await adminSupabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: planId,
        status: 'pending',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_end: graceEnd.toISOString(),
        billing_mode: 'prepaid_stk',
      })
      .select('id')
      .single();

    if (subInsertErr || !newSub) {
      logger.error({ error: subInsertErr?.message, event: 'boost.subscription_create_failed' });
      return err('INTERNAL_ERROR', 'Failed to initialize subscription record');
    }
    subscriptionId = newSub.id;
  }

  // 7. Insert Subscription Invoice in 'pending' status
  const { data: invoiceRecord, error: invoiceErr } = await adminSupabase
    .from('subscription_invoices')
    .insert({
      subscription_id: subscriptionId,
      user_id: user.id,
      plan_id: planId,
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      amount_minor: amountMinor,
      currency_code: priceBookEntry.currency_code,
      status: 'pending',
      due_at: now.toISOString(),
    })
    .select('id')
    .single();

  if (invoiceErr) {
    logger.warn({ error: invoiceErr.message, event: 'boost.invoice_create_warn' });
  }

  // 8. Create Payment Record
  const { data: paymentRecord, error: payInsertErr } = await adminSupabase
    .from('payments')
    .insert({
      payer_id: user.id,
      provider: 'mpesa_daraja',
      purpose: 'boost_period',
      target_id: subscriptionId,
      amount_minor: amountMinor,
      currency_code: priceBookEntry.currency_code,
      status: 'created',
      idempotency_key: idempotencyKey,
      msisdn: phoneNumber,
      price_book_id: priceBookEntry.id,
      tax_amount_minor: taxBreakdown.taxAmountMinor,
      price_snapshot: {
        plan_id: planId,
        plan_name: planRecord.name,
        country_code: countryCode,
        invoice_id: invoiceRecord?.id,
        base_amount_minor: taxBreakdown.netAmountMinor,
        tax_amount_minor: taxBreakdown.taxAmountMinor,
        gross_amount_minor: taxBreakdown.grossAmountMinor,
      },
    })
    .select('*')
    .single();

  if (payInsertErr || !paymentRecord) {
    logger.error({ error: payInsertErr?.message, event: 'boost.payment_record_failed' });
    return err('INTERNAL_ERROR', 'Failed to generate payment order');
  }

  // 9. Dispatch Daraja STK Push Prompt
  try {
    const stkResponse = await initiateDarajaStkPush({
      amountMinor,
      phoneNumber,
      accountReference: `SUB-${user.id.slice(0, 8).toUpperCase()}`,
      transactionDesc: `Trade Weft Boost ${planRecord.name}`,
    });

    // Update payment record to 'pending' with checkout_request_id
    await adminSupabase
      .from('payments')
      .update({
        status: 'pending',
        checkout_request_id: stkResponse.CheckoutRequestID,
        merchant_request_id: stkResponse.MerchantRequestID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRecord.id);

    // Link latest_payment_id on subscription
    await adminSupabase
      .from('subscriptions')
      .update({ latest_payment_id: paymentRecord.id })
      .eq('id', subscriptionId);

    logger.info(
      {
        userId: user.id,
        paymentId: paymentRecord.id,
        checkoutRequestId: stkResponse.CheckoutRequestID,
        event: 'boost.stk_push_dispatched',
      },
      'Boost STK Push dispatched to customer'
    );

    return ok({
      paymentId: paymentRecord.id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      amountMinor,
      currencyCode: priceBookEntry.currency_code,
      customerMessage: stkResponse.CustomerMessage || 'Please check your phone for the M-Pesa PIN prompt',
    });
  } catch (error: any) {
    logger.error(
      { paymentId: paymentRecord.id, error: error?.message, event: 'boost.stk_dispatch_failed' },
      'Boost STK Push dispatch failed'
    );

    await failPayment({
      paymentId: paymentRecord.id,
      failureCode: 'DISPATCH_FAILED',
      failureReason: error?.message || 'Failed to dispatch M-Pesa prompt to phone',
    });

    return err('PAYMENT_FAILED', error?.message || 'Could not send M-Pesa prompt to your phone');
  }
}

/**
 * Toggles cancel_at_period_end on an active subscription.
 */
export async function toggleSubscriptionCancellationAction(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
): Promise<Result<{ cancelAtPeriodEnd: boolean }>> {
  const { user } = await requireOnboardedUser();
  const adminSupabase = createAdminClient();

  const { data: sub, error } = await adminSupabase
    .from('subscriptions')
    .select('id, user_id, status')
    .eq('id', subscriptionId)
    .single();

  if (error || !sub) {
    return err('NOT_FOUND', 'Subscription not found');
  }

  if (sub.user_id !== user.id) {
    return err('FORBIDDEN', 'You do not own this subscription');
  }

  if (!['active', 'grace'].includes(sub.status)) {
    return err('INVALID_TRANSITION', 'Only active subscriptions can be cancelled or resumed');
  }

  const { error: updateErr } = await adminSupabase
    .from('subscriptions')
    .update({
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);

  if (updateErr) {
    logger.error({ error: updateErr.message, event: 'subscription.toggle_cancel_failed' });
    return err('INTERNAL_ERROR', 'Failed to update subscription auto-renew preference');
  }

  return ok({ cancelAtPeriodEnd });
}

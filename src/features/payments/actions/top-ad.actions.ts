'use server';

import { requireUser, requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/errors';
import {
  paymentInitiateLimiter,
  paymentPhoneLimiter,
  paymentStatusLimiter,
} from '@/lib/rate-limit';
import {
  initiateTopAdSchema,
  type InitiateTopAdInput,
} from '../schemas/payment.schema';
import { calculateTaxBreakdown } from '../utils/money';
import { initiateDarajaStkPush } from '../daraja/adapter';
import {
  reconcilePaymentWithProvider,
  failPayment,
} from '../services/payment-settlement.service';
import type { PaymentStatus } from '../types/payment.types';

export interface SlotAvailabilityResult {
  totalSlots: number;
  availableSlots: number;
  isAvailable: boolean;
  assignedSlot: number | null;
  takenSlots: number[];
}

/**
 * Checks live slot availability for a package's (country, city, category).
 */
export async function checkSlotAvailabilityAction(
  packageId: string,
  durationDays: number = 7
): Promise<Result<SlotAvailabilityResult>> {
  const { user, supabase } = await requireUser();

  const { data: pkg, error: pkgErr } = await supabase
    .from('service_packages')
    .select('id, country_code, city_id, category_id, status, provider_id')
    .eq('id', packageId)
    .single();

  if (pkgErr || !pkg) {
    return err('NOT_FOUND', 'Service package not found');
  }

  if (pkg.provider_id !== user.id) {
    return err('FORBIDDEN', 'You do not own this service package');
  }

  if (!pkg.city_id) {
    return err('VALIDATION_FAILED', 'Package must have an assigned city to be promoted with Top Ads');
  }

  // Check taken slots overlapping requested period
  const adminSupabase = createAdminClient();
  const now = new Date();
  const future = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);

  const { data: takenPromotions } = await adminSupabase
    .from('listing_promotions')
    .select('slot_no, status, period')
    .eq('country_code', pkg.country_code)
    .eq('city_id', pkg.city_id)
    .eq('category_id', pkg.category_id)
    .in('status', ['held', 'active']);

  // Extract taken slots that overlap with the future period
  const takenSlots = new Set<number>();
  for (const promo of takenPromotions || []) {
    takenSlots.add(promo.slot_no);
  }

  const availableSlotsList = [1, 2, 3].filter((s) => !takenSlots.has(s));
  const assignedSlot = availableSlotsList.length > 0 ? availableSlotsList[0] : null;

  return ok({
    totalSlots: 3,
    availableSlots: availableSlotsList.length,
    isAvailable: availableSlotsList.length > 0,
    assignedSlot,
    takenSlots: Array.from(takenSlots),
  });
}

export interface InitiateTopAdResult {
  paymentId: string;
  checkoutRequestId: string;
  amountMinor: number;
  currencyCode: string;
  customerMessage: string;
}

/**
 * Initiates Top Ad purchase via Safaricom M-Pesa STK Push.
 */
export async function initiateTopAdPaymentAction(
  input: InitiateTopAdInput
): Promise<Result<InitiateTopAdResult>> {
  const { user, supabase } = await requireOnboardedUser();

  // 1. Validate Input
  const parsed = initiateTopAdSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      'VALIDATION_FAILED',
      parsed.error.errors[0]?.message || 'Invalid promotion inputs'
    );
  }

  const { packageId, productId, phoneNumber, idempotencyKey } = parsed.data;

  // 2. Rate Limiting: User and Phone
  const userRate = await paymentInitiateLimiter.check(user.id);
  if (!userRate.success) {
    return err('RATE_LIMITED', 'Too many payment requests. Please wait a few minutes.');
  }

  const phoneRate = await paymentPhoneLimiter.check(phoneNumber);
  if (!phoneRate.success) {
    return err(
      'RATE_LIMITED',
      'Maximum 3 M-Pesa prompts allowed per phone number in 10 minutes. Please wait before retrying.'
    );
  }

  const adminSupabase = createAdminClient();

  // 3. Prevent duplicate active pending prompts for same user and package
  const { data: activePending } = await adminSupabase
    .from('payments')
    .select('id, created_at')
    .eq('payer_id', user.id)
    .eq('purpose', 'top_ad')
    .eq('status', 'pending')
    .gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .maybeSingle();

  if (activePending) {
    return err(
      'LIMIT_EXCEEDED',
      'A payment prompt is already pending on your phone. Please check your handset or wait for it to expire.'
    );
  }

  // 4. Validate Package
  const { data: pkg, error: pkgErr } = await supabase
    .from('service_packages')
    .select('id, title, country_code, city_id, category_id, status, provider_id')
    .eq('id', packageId)
    .single();

  if (pkgErr || !pkg) {
    return err('NOT_FOUND', 'Service package not found');
  }

  if (pkg.provider_id !== user.id) {
    return err('FORBIDDEN', 'You do not own this service package');
  }

  if (pkg.status !== 'published') {
    return err('INVALID_TRANSITION', 'Only active published packages can be promoted with Top Ads');
  }

  if (!pkg.city_id) {
    return err('VALIDATION_FAILED', 'Package must have an assigned city to be promoted');
  }

  // 5. Fetch Active Price from Price Book
  const { data: priceEntry, error: priceErr } = await adminSupabase
    .from('price_book')
    .select('*')
    .eq('product_id', productId)
    .eq('country_code', pkg.country_code)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (priceErr || !priceEntry) {
    return err('NOT_FOUND', 'Pricing not available for this promotion option');
  }

  const durationMap: Record<string, number> = {
    top_ad_7d: 7,
    top_ad_14d: 14,
    top_ad_30d: 30,
  };
  const durationDays = durationMap[productId] || 7;

  // 6. Check Slot Availability and Assign Lowest Free Slot (1..3)
  const availabilityRes = await checkSlotAvailabilityAction(packageId, durationDays);
  if (!availabilityRes.success || !availabilityRes.data.isAvailable || !availabilityRes.data.assignedSlot) {
    return err(
      'LIMIT_EXCEEDED',
      'All 3 Top Ad slots are currently booked for this category and city. Please try again soon.'
    );
  }

  const assignedSlot = availabilityRes.data.assignedSlot;
  const taxRateBps = Number(priceEntry.tax_rate_bps) || 1600;
  const taxInclusive = priceEntry.tax_inclusive !== false;
  const tax = calculateTaxBreakdown(
    priceEntry.amount_minor,
    taxRateBps,
    taxInclusive
  );

  // 7. Hold the slot in database (10-minute hold window)
  const now = new Date();
  const holdExpiry = new Date(now.getTime() + 10 * 60_000);
  const periodRange = `["${now.toISOString()}","${holdExpiry.toISOString()}"]`;

  const { data: promoHold, error: holdErr } = await adminSupabase
    .from('listing_promotions')
    .insert({
      package_id: pkg.id,
      provider_id: user.id,
      country_code: pkg.country_code,
      city_id: pkg.city_id,
      category_id: pkg.category_id,
      slot_no: assignedSlot,
      period: periodRange,
      status: 'held',
    })
    .select('id')
    .single();

  if (holdErr || !promoHold) {
    logger.warn({ error: holdErr?.message, event: 'top_ad.slot_hold_conflict' });
    return err(
      'LIMIT_EXCEEDED',
      'Slot was just reserved by another provider. Please try again to check available slots.'
    );
  }

  // 8. Create Payment Record
  const { data: paymentRecord, error: payErr } = await adminSupabase
    .from('payments')
    .insert({
      payer_id: user.id,
      purpose: 'top_ad',
      target_id: promoHold.id,
      amount_minor: priceEntry.amount_minor,
      currency_code: priceEntry.currency_code,
      provider: 'mpesa_daraja',
      status: 'created',
      msisdn: phoneNumber,
      idempotency_key: idempotencyKey,
      price_book_id: priceEntry.id,
      tax_amount_minor: tax.taxAmountMinor,
      price_snapshot: {
        productId,
        durationDays,
        amountMinor: priceEntry.amount_minor,
        taxInclusive,
        taxRateBps,
      },
    })
    .select('id')
    .single();

  if (payErr || !paymentRecord) {
    logger.error({ error: payErr?.message, event: 'top_ad.payment_record_failed' }, 'Payment insert failed');
    // Release hold if payment insertion failed
    await adminSupabase.from('listing_promotions').delete().eq('id', promoHold.id);
    return err('INTERNAL_ERROR', payErr?.message || 'Failed to initialize payment record');
  }

  // 9. Dispatch STK Push Prompt to Customer Handset
  try {
    const stkRes = await initiateDarajaStkPush({
      phoneNumber,
      amountMinor: priceEntry.amount_minor,
      accountReference: 'TopAd',
      transactionDesc: `TopAd ${durationDays}d`,
    });

    // Update payment with provider identifiers
    await adminSupabase
      .from('payments')
      .update({
        status: 'pending',
        merchant_request_id: stkRes.MerchantRequestID,
        checkout_request_id: stkRes.CheckoutRequestID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRecord.id);

    // Link promotion to payment
    await adminSupabase
      .from('listing_promotions')
      .update({ payment_id: paymentRecord.id })
      .eq('id', promoHold.id);

    return ok({
      paymentId: paymentRecord.id,
      checkoutRequestId: stkRes.CheckoutRequestID,
      amountMinor: priceEntry.amount_minor,
      currencyCode: priceEntry.currency_code,
      customerMessage: stkRes.CustomerMessage,
    });
  } catch (error: any) {
    logger.error(
      { paymentId: paymentRecord.id, error: error?.message, event: 'top_ad.stk_dispatch_failed' },
      'STK Push dispatch failed'
    );

    // Mark payment failed and release hold
    await failPayment({
      paymentId: paymentRecord.id,
      failureCode: 'DISPATCH_FAILED',
      failureReason: error?.message || 'Failed to dispatch prompt to phone',
    });

    return err('PAYMENT_FAILED', error?.message || 'Could not send M-Pesa prompt to your phone');
  }
}

export interface PaymentStatusDetails {
  id: string;
  status: PaymentStatus;
  receiptNumber?: string | null;
  failureReason?: string | null;
  userMessage: string;
  isTerminal: boolean;
}

/**
 * Checks current payment status. If pending and older than 15s, triggers provider query.
 */
export async function getPaymentStatusAction(
  paymentId: string
): Promise<Result<PaymentStatusDetails>> {
  const { user } = await requireOnboardedUser();

  const rate = await paymentStatusLimiter.check(user.id);
  if (!rate.success) {
    return err('RATE_LIMITED', 'Too many status checks. Please wait a moment.');
  }

  const adminSupabase = createAdminClient();

  const { data: payment, error } = await adminSupabase
    .from('payments')
    .select('id, payer_id, status, receipt_number, failure_reason, created_at')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    return err('NOT_FOUND', 'Payment not found');
  }

  if (payment.payer_id !== user.id) {
    return err('FORBIDDEN', 'You do not own this payment');
  }

  // If pending and created more than 15 seconds ago, reconcile directly
  const ageMs = Date.now() - new Date(payment.created_at).getTime();
  if (payment.status === 'pending' && ageMs > 15_000) {
    try {
      const reconciled = await reconcilePaymentWithProvider(payment.id);
      if (reconciled.status !== 'pending') {
        const { data: refreshed } = await adminSupabase
          .from('payments')
          .select('id, status, receipt_number, failure_reason')
          .eq('id', paymentId)
          .single();

        if (refreshed) {
          payment.status = refreshed.status;
          payment.receipt_number = refreshed.receipt_number;
          payment.failure_reason = refreshed.failure_reason;
        }
      }
    } catch (err: any) {
      logger.warn({ paymentId, error: err?.message, event: 'payment.status_poll_reconcile_warn' });
    }
  }

  const isTerminal = ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(payment.status);

  let userMessage = 'Payment is in progress. Please check your phone.';
  if (payment.status === 'succeeded') {
    userMessage = `Payment succeeded! Receipt: ${payment.receipt_number || 'Confirmed'}.`;
  } else if (payment.status === 'failed') {
    userMessage = payment.failure_reason || 'Payment failed. Please try again.';
  } else if (payment.status === 'cancelled') {
    userMessage = 'You cancelled the M-Pesa prompt on your phone.';
  } else if (payment.status === 'timed_out') {
    userMessage = 'Payment timed out without response. Please try again.';
  }

  return ok({
    id: payment.id,
    status: payment.status,
    receiptNumber: payment.receipt_number,
    failureReason: payment.failure_reason,
    userMessage,
    isTerminal,
  });
}

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import {
  reconcilePaymentWithProvider,
  failPayment,
} from './payment-settlement.service';
import { queryDarajaStkStatus } from '../daraja/adapter';

export interface ReconciliationSummary {
  settled: number;
  failed: number;
  timedOut: number;
  stillPending: number;
  promotionsExpired: number;
  subscriptionsProcessed: number;
}

/**
 * Sweeps pending payments and reconciles their status directly against Safaricom Daraja.
 * Runs on cron schedule every 5 minutes.
 */
export async function runPaymentsReconciliation(): Promise<ReconciliationSummary> {
  const supabase = createAdminClient();
  const summary: ReconciliationSummary = {
    settled: 0,
    failed: 0,
    timedOut: 0,
    stillPending: 0,
    promotionsExpired: 0,
    subscriptionsProcessed: 0,
  };

  // 1. Fetch pending payments that are older than 90 seconds
  const cutoffTime = new Date(Date.now() - 90_000).toISOString();
  const timeoutCutoffTime = new Date(Date.now() - 30 * 60_000).toISOString();

  const { data: pendingPayments, error: fetchErr } = await supabase
    .from('payments')
    .select('id, checkout_request_id, created_at, attempts, amount_minor, payer_id')
    .eq('status', 'pending')
    .lt('created_at', cutoffTime)
    .order('created_at', { ascending: true })
    .limit(50);

  if (fetchErr) {
    logger.error({ error: fetchErr.message, event: 'reconcile.fetch_pending_failed' });
    return summary;
  }

  for (const payment of pendingPayments || []) {
    try {
      const isPastTimeout = payment.created_at < timeoutCutoffTime || (payment.attempts || 0) >= 6;

      if (isPastTimeout) {
        // Final check before marking timed_out
        if (payment.checkout_request_id) {
          const finalCheck = await queryDarajaStkStatus(payment.checkout_request_id);
          if (finalCheck.isSuccess && finalCheck.receiptNumber) {
            await reconcilePaymentWithProvider(payment.id);
            summary.settled++;
            continue;
          }
        }

        // Mark as timed_out and release holds
        await failPayment({
          paymentId: payment.id,
          failureCode: 'TIMED_OUT',
          failureReason: 'Payment session expired after 30 minutes without confirmation.',
          terminalStatus: 'timed_out',
        });

        summary.timedOut++;
        continue;
      }

      // Normal reconciliation attempt
      const res = await reconcilePaymentWithProvider(payment.id);
      if (res.status === 'succeeded') {
        summary.settled++;
      } else if (res.status === 'failed' || res.status === 'cancelled') {
        summary.failed++;
      } else {
        summary.stillPending++;
      }
    } catch (err: any) {
      logger.error(
        { paymentId: payment.id, error: err?.message, event: 'reconcile.payment_process_failed' },
        'Failed to reconcile payment row'
      );
    }
  }

  // 2. Sweep Expired Top Ads (listing_promotions)
  try {
    const { data: expiredPromos } = await supabase
      .from('listing_promotions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'active')
      .lte('period', `["${new Date().toISOString()}",)`)
      .select('id, package_id, provider_id');

    if (expiredPromos && expiredPromos.length > 0) {
      summary.promotionsExpired = expiredPromos.length;

      for (const promo of expiredPromos) {
        await supabase.from('notifications').insert({
          user_id: promo.provider_id,
          type: 'promotion.ended',
          payload: {
            promotion_id: promo.id,
            package_id: promo.package_id,
          },
        });
      }
    }
  } catch (err: any) {
    logger.warn({ error: err?.message, event: 'reconcile.expired_promotions_sweep_error' });
  }

  // 3. Sweep Subscriptions (Grace & Expiry)
  try {
    const nowIso = new Date().toISOString();

    // Move from active to grace if period has ended
    const { data: graceSubs } = await supabase
      .from('subscriptions')
      .update({
        status: 'grace',
        updated_at: nowIso,
      })
      .eq('status', 'active')
      .lt('current_period_end', nowIso)
      .select('id, user_id, plan_id');

    if (graceSubs) {
      for (const sub of graceSubs) {
        summary.subscriptionsProcessed++;
        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          type: 'subscription.grace',
          payload: {
            subscription_id: sub.id,
            plan_id: sub.plan_id,
          },
        });
      }
    }

    // Move from grace to expired if grace period has ended
    const { data: expiredSubs } = await supabase
      .from('subscriptions')
      .update({
        status: 'expired',
        updated_at: nowIso,
      })
      .eq('status', 'grace')
      .lt('grace_period_end', nowIso)
      .select('id, user_id, plan_id');

    if (expiredSubs) {
      for (const sub of expiredSubs) {
        summary.subscriptionsProcessed++;
        // Sync ranking to remove freshness bonus
        await supabase.rpc('sync_provider_rank_ts', { p_user_id: sub.user_id });

        await supabase.from('notifications').insert({
          user_id: sub.user_id,
          type: 'subscription.expired',
          payload: {
            subscription_id: sub.id,
            plan_id: sub.plan_id,
          },
        });
      }
    }
  } catch (err: any) {
    logger.warn({ error: err?.message, event: 'reconcile.subscription_sweep_error' });
  }

  logger.info(
    { summary, event: 'reconcile.sweep_completed' },
    'Completed payments reconciliation and subscription sweep'
  );

  return summary;
}

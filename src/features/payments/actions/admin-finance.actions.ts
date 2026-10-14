'use server';

import { requireFinanceOrAdmin } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { ok, err, type Result } from '@/lib/errors';
import { financeActionLimiter } from '@/lib/rate-limit';
import { reconcilePaymentWithProvider } from '../services/payment-settlement.service';
import { revalidatePath } from 'next/cache';

export async function adminReconcileAction(
  paymentId: string
): Promise<Result<{ status: string; receiptNumber?: string }>> {
  const { user } = await requireFinanceOrAdmin();

  const rate = await financeActionLimiter.check(user.id);
  if (!rate.success) {
    return err('RATE_LIMITED', 'Too many finance actions. Please wait a moment.');
  }

  try {
    const res = await reconcilePaymentWithProvider(paymentId);
    revalidatePath('/admin/payments');
    return ok({
      status: res.status,
      receiptNumber: res.receiptNumber,
    });
  } catch (error: any) {
    logger.error(
      { paymentId, error: error?.message, event: 'admin.reconcile_failed' },
      'Admin manual reconciliation failed'
    );
    return err('INTERNAL_ERROR', error?.message || 'Reconciliation failed');
  }
}

export async function adminRefundAction(
  paymentId: string,
  reason: string
): Promise<Result<{ success: boolean; status: string }>> {
  const { user } = await requireFinanceOrAdmin();

  if (!reason || reason.trim().length < 5) {
    return err('VALIDATION_FAILED', 'A detailed refund justification is required (min 5 characters)');
  }

  const rate = await financeActionLimiter.check(user.id);
  if (!rate.success) {
    return err('RATE_LIMITED', 'Too many finance actions. Please wait a moment.');
  }

  const adminSupabase = createAdminClient();

  try {
    const { data, error } = await adminSupabase.rpc('admin_record_refund', {
      p_payment_id: paymentId,
      p_actor_id: user.id,
      p_reason: reason.trim(),
    });

    if (error) {
      logger.error(
        { paymentId, error: error.message, event: 'admin.refund_rpc_failed' },
        'Admin refund RPC failed'
      );
      return err('INTERNAL_ERROR', error.message);
    }

    revalidatePath('/admin/payments');
    revalidatePath('/admin/promotions');
    revalidatePath('/admin/revenue');

    return ok({
      success: true,
      status: 'refunded',
    });
  } catch (error: any) {
    logger.error(
      { paymentId, error: error?.message, event: 'admin.refund_exception' },
      'Admin refund encountered an error'
    );
    return err('INTERNAL_ERROR', error?.message || 'Refund processing failed');
  }
}

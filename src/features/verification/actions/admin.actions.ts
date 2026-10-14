'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireVerifierOrAdmin } from '@/server/dal';
import { logger } from '@/lib/logger';
import { adminReviewLimiter } from '@/lib/rate-limit';
import {
  adminReviewLinkSchema,
  adminRevokeLinkSchema,
} from '../schemas/link.schema';

export interface AdminActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  linkId?: string;
}

/**
 * Reviews a pending portfolio link (approves or rejects with audit log entry).
 */
export async function adminReviewLinkAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const { user, supabase } = await requireVerifierOrAdmin();

  const limit = await adminReviewLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Rate limit exceeded. Please slow down review actions.' };
  }

  const rawData = {
    linkId: formData.get('linkId') as string,
    action: formData.get('action') as string,
    rejectReason: (formData.get('rejectReason') as string) || undefined,
    rejectNote: (formData.get('rejectNote') as string) || undefined,
  };

  const validation = adminReviewLinkSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: 'Please check your input.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { linkId, action, rejectReason, rejectNote } = validation.data;
  const idempotencyKey = crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_review_link', {
    p_link_id: linkId,
    p_action: action,
    p_reject_reason: rejectReason ?? null,
    p_reject_note: rejectNote ?? null,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({
      adminId: user.id,
      linkId,
      error: rpcError.message,
      event: 'admin.review_link_failed',
    });
    return { error: `Failed to review link: ${rpcError.message}` };
  }

  logger.info({
    adminId: user.id,
    linkId,
    action,
    event: 'admin.reviewed_link',
  });

  revalidatePath('/admin/verification');
  revalidatePath('/dashboard/verification');

  return {
    success: true,
    linkId,
  };
}

/**
 * Revokes a previously verified portfolio link.
 */
export async function adminRevokeLinkAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const { user, supabase } = await requireVerifierOrAdmin();

  const limit = await adminReviewLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Rate limit exceeded. Please wait a moment.' };
  }

  const rawData = {
    linkId: formData.get('linkId') as string,
    reason: formData.get('reason') as string,
  };

  const validation = adminRevokeLinkSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: 'Please specify a valid revocation reason.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { linkId, reason } = validation.data;
  const idempotencyKey = crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_revoke_link', {
    p_link_id: linkId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({
      adminId: user.id,
      linkId,
      error: rpcError.message,
      event: 'admin.revoke_link_failed',
    });
    return { error: `Failed to revoke link: ${rpcError.message}` };
  }

  logger.info({
    adminId: user.id,
    linkId,
    reason,
    event: 'admin.revoked_link',
  });

  revalidatePath('/admin/verification');
  revalidatePath('/dashboard/verification');

  return {
    success: true,
    linkId,
  };
}

/**
 * Moderates a reported review (hide or restore) using Phase 4 moderate_review RPC.
 */
export async function adminModerateReviewAction(
  formData: FormData
): Promise<AdminActionResult> {
  const { user, supabase } = await requireVerifierOrAdmin();

  const limit = await adminReviewLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Rate limit exceeded. Please wait a moment.' };
  }

  const reviewId = formData.get('reviewId') as string;
  const action = formData.get('action') as string;
  const reason = formData.get('reason') as string;

  if (!reviewId || (action !== 'hide' && action !== 'restore') || !reason) {
    return { error: 'Invalid moderation parameters.' };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('moderate_review', {
    p_review_id: reviewId,
    p_action: action,
    p_reason: reason,
  });

  if (rpcError) {
    logger.error({
      adminId: user.id,
      reviewId,
      error: rpcError.message,
      event: 'admin.moderate_review_failed',
    });
    return { error: `Failed to moderate review: ${rpcError.message}` };
  }

  logger.info({
    adminId: user.id,
    reviewId,
    action,
    event: 'admin.moderated_review',
  });

  revalidatePath('/admin/moderation');
  revalidatePath('/dashboard/reviews');

  return { success: true };
}


'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  reviewSubmitLimiter,
  reviewActionLimiter,
  reviewReportLimiter,
} from '@/lib/rate-limit';
import {
  submitReviewSchema,
  editReviewSchema,
  withdrawReviewSchema,
  replyReviewSchema,
  reportReviewSchema,
} from '../schemas/review.schema';

export interface ReviewActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  reviewId?: string;
  isRevealed?: boolean;
}

/**
 * Submits a new post-trade review via atomic RPC.
 */
export async function submitReviewAction(
  prevState: ReviewActionResult | null,
  formData: FormData
): Promise<ReviewActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Rate Limiting (10 per 5m)
  const limit = await reviewSubmitLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'review.submit' });
    return {
      error: 'You have submitted several reviews recently. Please wait a few moments before trying again.',
    };
  }

  const rawData = {
    agreementId: formData.get('agreementId') as string,
    overallRating: Number(formData.get('overallRating')),
    qualityRating: Number(formData.get('qualityRating')),
    communicationRating: Number(formData.get('communicationRating')),
    timelinessRating: Number(formData.get('timelinessRating')),
    wouldTradeAgain: formData.get('wouldTradeAgain') === 'true',
    reviewText: (formData.get('reviewText') as string) || undefined,
  };

  const validation = submitReviewSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please correct the validation errors and try again.',
    };
  }

  const data = validation.data;
  const idempotencyKey = (formData.get('idempotencyKey') as string) || crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_review', {
    p_agreement_id: data.agreementId,
    p_overall_rating: data.overallRating,
    p_quality_rating: data.qualityRating,
    p_communication_rating: data.communicationRating,
    p_timeliness_rating: data.timelinessRating,
    p_would_trade_again: data.wouldTradeAgain,
    p_review_text: data.reviewText || null,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'review.submit_failed' });

    if (rpcError.message.includes('AGREEMENT_NOT_FOUND')) {
      return { error: 'Trade agreement not found.' };
    }
    if (rpcError.message.includes('FORBIDDEN_NOT_PARTY')) {
      return { error: 'You are not a participant in this agreement.' };
    }
    if (rpcError.message.includes('AGREEMENT_NOT_COMPLETED')) {
      return { error: 'Reviews can only be submitted after both parties have confirmed delivery.' };
    }
    if (rpcError.message.includes('REVIEW_WINDOW_EXPIRED')) {
      return { error: 'The 14-day review window for this trade has closed.' };
    }
    if (rpcError.message.includes('ALREADY_SUBMITTED')) {
      return { error: 'You have already submitted a review for this agreement.' };
    }
    return { error: 'Failed to submit review. Please try again.' };
  }

  const res = rpcData as { review_id?: string; revealed?: boolean; status?: string };
  logger.info({
    userId: user.id,
    agreementId: data.agreementId,
    reviewId: res?.review_id,
    revealed: res?.revealed,
    event: 'review.submitted',
  });

  revalidatePath('/dashboard/reviews');
  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${data.agreementId}`);

  return {
    success: true,
    reviewId: res?.review_id,
    isRevealed: res?.revealed ?? false,
  };
}

/**
 * Edits a pending review within the 1-hour grace period before reveal.
 */
export async function editReviewAction(
  prevState: ReviewActionResult | null,
  formData: FormData
): Promise<ReviewActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await reviewActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  const rawData = {
    reviewId: formData.get('reviewId') as string,
    overallRating: Number(formData.get('overallRating')),
    qualityRating: Number(formData.get('qualityRating')),
    communicationRating: Number(formData.get('communicationRating')),
    timelinessRating: Number(formData.get('timelinessRating')),
    wouldTradeAgain: formData.get('wouldTradeAgain') === 'true',
    reviewText: (formData.get('reviewText') as string) || undefined,
  };

  const validation = editReviewSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please correct the validation errors and try again.',
    };
  }

  const data = validation.data;
  const idempotencyKey = (formData.get('idempotencyKey') as string) || crypto.randomUUID();

  const { data: rpcData, error: rpcError } = await supabase.rpc('edit_review', {
    p_review_id: data.reviewId,
    p_overall_rating: data.overallRating,
    p_quality_rating: data.qualityRating,
    p_communication_rating: data.communicationRating,
    p_timeliness_rating: data.timelinessRating,
    p_would_trade_again: data.wouldTradeAgain,
    p_review_text: data.reviewText || null,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'review.edit_failed' });
    if (rpcError.message.includes('CANNOT_EDIT_REVEALED')) {
      return { error: 'This review has already been revealed and can no longer be edited.' };
    }
    if (rpcError.message.includes('EDIT_WINDOW_EXPIRED')) {
      return { error: 'The 1-hour edit grace period has expired.' };
    }
    return { error: 'Unable to update review. Please try again.' };
  }

  revalidatePath('/dashboard/reviews');
  return { success: true, reviewId: data.reviewId };
}

/**
 * Withdraws a pending review within the 1-hour grace period before reveal.
 */
export async function withdrawReviewAction(
  prevState: ReviewActionResult | null,
  formData: FormData
): Promise<ReviewActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await reviewActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  const rawData = {
    reviewId: formData.get('reviewId') as string,
  };

  const validation = withdrawReviewSchema.safeParse(rawData);
  if (!validation.success) {
    return { error: 'Invalid review identifier.' };
  }

  const data = validation.data;
  const idempotencyKey = (formData.get('idempotencyKey') as string) || crypto.randomUUID();

  const { error: rpcError } = await supabase.rpc('withdraw_review', {
    p_review_id: data.reviewId,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'review.withdraw_failed' });
    if (rpcError.message.includes('CANNOT_WITHDRAW_REVEALED')) {
      return { error: 'This review has already been revealed and can no longer be withdrawn.' };
    }
    if (rpcError.message.includes('WITHDRAW_WINDOW_EXPIRED')) {
      return { error: 'The 1-hour withdrawal grace period has expired.' };
    }
    return { error: 'Unable to withdraw review. Please try again.' };
  }

  revalidatePath('/dashboard/reviews');
  return { success: true };
}

/**
 * Posts a public response to a revealed review (one reply per review).
 */
export async function replyReviewAction(
  prevState: ReviewActionResult | null,
  formData: FormData
): Promise<ReviewActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await reviewActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  const rawData = {
    reviewId: formData.get('reviewId') as string,
    replyText: formData.get('replyText') as string,
  };

  const validation = replyReviewSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please enter a valid reply of up to 500 characters.',
    };
  }

  const data = validation.data;
  const idempotencyKey = (formData.get('idempotencyKey') as string) || crypto.randomUUID();

  const { error: rpcError } = await supabase.rpc('reply_to_review', {
    p_review_id: data.reviewId,
    p_reply_text: data.replyText,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'review.reply_failed' });
    if (rpcError.message.includes('FORBIDDEN_NOT_REVIEWEE')) {
      return { error: 'Only the reviewed provider may reply to this review.' };
    }
    if (rpcError.message.includes('REVIEW_NOT_REVEALED')) {
      return { error: 'Replies can only be posted after the review has been revealed.' };
    }
    if (rpcError.message.includes('ALREADY_REPLIED')) {
      return { error: 'You have already posted a reply to this review.' };
    }
    return { error: 'Unable to post reply. Please try again.' };
  }

  revalidatePath('/dashboard/reviews');
  return { success: true };
}

/**
 * Reports a review for moderator review.
 */
export async function reportReviewAction(
  prevState: ReviewActionResult | null,
  formData: FormData
): Promise<ReviewActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await reviewReportLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'You have submitted multiple reports recently. Please wait a few moments.' };
  }

  const rawData = {
    reviewId: formData.get('reviewId') as string,
    reason: formData.get('reason') as any,
    details: (formData.get('details') as string) || undefined,
  };

  const validation = reportReviewSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please choose a valid reason for your report.',
    };
  }

  const data = validation.data;
  const idempotencyKey = (formData.get('idempotencyKey') as string) || crypto.randomUUID();

  const { error: rpcError } = await supabase.rpc('report_review', {
    p_review_id: data.reviewId,
    p_reason: data.reason,
    p_details: data.details || null,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'review.report_failed' });
    if (rpcError.message.includes('CANNOT_REPORT_OWN_REVIEW')) {
      return { error: 'You cannot report your own review.' };
    }
    if (rpcError.message.includes('ALREADY_REPORTED')) {
      return { error: 'You have already reported this review.' };
    }
    return { error: 'Unable to submit report. Please try again.' };
  }

  return { success: true };
}

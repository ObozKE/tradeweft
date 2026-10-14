import { z } from 'zod';
import { sanitizeUserText } from '@/features/packages/utils/sanitizer';

export const ratingField = z
  .number({ required_error: 'Rating is required' })
  .int('Rating must be an integer')
  .min(1, 'Rating must be at least 1')
  .max(5, 'Rating cannot exceed 5');

export const reviewTextOptional = z
  .string()
  .max(1000, 'Review text cannot exceed 1,000 characters')
  .optional()
  .transform((val) => {
    if (!val || !val.trim()) return null;
    return sanitizeUserText(val, { maxConsecutiveNewlines: 2 });
  });

export const submitReviewSchema = z.object({
  agreementId: z
    .string({ required_error: 'Agreement identifier is required' })
    .uuid('Invalid agreement identifier'),
  overallRating: ratingField,
  qualityRating: ratingField,
  communicationRating: ratingField,
  timelinessRating: ratingField,
  wouldTradeAgain: z.boolean({
    required_error: 'Please indicate whether you would trade with this provider again',
  }),
  reviewText: reviewTextOptional,
});

export const editReviewSchema = z.object({
  reviewId: z
    .string({ required_error: 'Review identifier is required' })
    .uuid('Invalid review identifier'),
  overallRating: ratingField,
  qualityRating: ratingField,
  communicationRating: ratingField,
  timelinessRating: ratingField,
  wouldTradeAgain: z.boolean({
    required_error: 'Please indicate whether you would trade with this provider again',
  }),
  reviewText: reviewTextOptional,
});

export const withdrawReviewSchema = z.object({
  reviewId: z
    .string({ required_error: 'Review identifier is required' })
    .uuid('Invalid review identifier'),
});

export const replyReviewSchema = z.object({
  reviewId: z
    .string({ required_error: 'Review identifier is required' })
    .uuid('Invalid review identifier'),
  replyText: z
    .string({ required_error: 'Reply text is required' })
    .min(1, 'Reply text cannot be empty')
    .max(500, 'Reply text cannot exceed 500 characters')
    .transform((val) => sanitizeUserText(val, { maxConsecutiveNewlines: 2 })),
});

export const reportReviewReasonEnum = z.enum([
  'harassment',
  'spam',
  'extortion',
  'false_claim',
  'pii_leak',
  'other',
]);

export const reportReviewSchema = z.object({
  reviewId: z
    .string({ required_error: 'Review identifier is required' })
    .uuid('Invalid review identifier'),
  reason: reportReviewReasonEnum,
  details: z
    .string()
    .max(500, 'Report details cannot exceed 500 characters')
    .optional()
    .transform((val) => {
      if (!val || !val.trim()) return null;
      return sanitizeUserText(val, { maxConsecutiveNewlines: 2 });
    }),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type EditReviewInput = z.infer<typeof editReviewSchema>;
export type WithdrawReviewInput = z.infer<typeof withdrawReviewSchema>;
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;
export type ReportReviewInput = z.infer<typeof reportReviewSchema>;

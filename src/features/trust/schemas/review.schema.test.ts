import { describe, it, expect } from 'vitest';
import {
  submitReviewSchema,
  editReviewSchema,
  withdrawReviewSchema,
  replyReviewSchema,
  reportReviewSchema,
} from './review.schema';

describe('Review Schemas Validation', () => {
  const validUUID = 'a0000000-0000-0000-0000-000000000001';

  describe('submitReviewSchema', () => {
    it('validates a correct review submission', () => {
      const input = {
        agreementId: validUUID,
        overallRating: 5,
        qualityRating: 5,
        communicationRating: 4,
        timelinessRating: 5,
        wouldTradeAgain: true,
        reviewText: 'Great experience collaborating on this branding project!',
      };

      const result = submitReviewSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.overallRating).toBe(5);
        expect(result.data.reviewText).toBe('Great experience collaborating on this branding project!');
      }
    });

    it('rejects ratings below 1 or above 5', () => {
      const tooLow = {
        agreementId: validUUID,
        overallRating: 0,
        qualityRating: 5,
        communicationRating: 4,
        timelinessRating: 5,
        wouldTradeAgain: true,
      };
      expect(submitReviewSchema.safeParse(tooLow).success).toBe(false);

      const tooHigh = {
        agreementId: validUUID,
        overallRating: 6,
        qualityRating: 5,
        communicationRating: 4,
        timelinessRating: 5,
        wouldTradeAgain: true,
      };
      expect(submitReviewSchema.safeParse(tooHigh).success).toBe(false);
    });

    it('rejects non-integer ratings', () => {
      const decimal = {
        agreementId: validUUID,
        overallRating: 4.5,
        qualityRating: 5,
        communicationRating: 4,
        timelinessRating: 5,
        wouldTradeAgain: true,
      };
      expect(submitReviewSchema.safeParse(decimal).success).toBe(false);
    });

    it('sanitizes review text and rejects text exceeding 1000 characters', () => {
      const longText = 'a'.repeat(1001);
      const invalid = {
        agreementId: validUUID,
        overallRating: 5,
        qualityRating: 5,
        communicationRating: 5,
        timelinessRating: 5,
        wouldTradeAgain: true,
        reviewText: longText,
      };
      expect(submitReviewSchema.safeParse(invalid).success).toBe(false);

      const dirtyText = {
        agreementId: validUUID,
        overallRating: 5,
        qualityRating: 5,
        communicationRating: 5,
        timelinessRating: 5,
        wouldTradeAgain: true,
        reviewText: 'Hello\x00World\n\n\n\nMultiple lines',
      };
      const result = submitReviewSchema.safeParse(dirtyText);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reviewText).toBe('HelloWorld\n\nMultiple lines');
      }
    });
  });

  describe('replyReviewSchema', () => {
    it('validates a clean reply under 500 characters', () => {
      const valid = {
        reviewId: validUUID,
        replyText: 'Thank you for the kind words! Looking forward to trading again.',
      };
      const result = replyReviewSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects empty replies or replies exceeding 500 characters', () => {
      expect(replyReviewSchema.safeParse({ reviewId: validUUID, replyText: '' }).success).toBe(false);
      expect(replyReviewSchema.safeParse({ reviewId: validUUID, replyText: 'b'.repeat(501) }).success).toBe(false);
    });
  });

  describe('reportReviewSchema', () => {
    it('validates allowed report reasons', () => {
      const valid = {
        reviewId: validUUID,
        reason: 'harassment',
        details: 'Offensive language in review text.',
      };
      expect(reportReviewSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects invalid report reasons', () => {
      const invalid = {
        reviewId: validUUID,
        reason: 'dislike_the_score',
      };
      expect(reportReviewSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('withdrawReviewSchema', () => {
    it('validates uuid reviewId', () => {
      expect(withdrawReviewSchema.safeParse({ reviewId: validUUID }).success).toBe(true);
      expect(withdrawReviewSchema.safeParse({ reviewId: 'invalid' }).success).toBe(false);
    });
  });
});

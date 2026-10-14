import { describe, it, expect } from 'vitest';
import {
  addPortfolioLinkSchema,
  submitManualEvidenceSchema,
  adminReviewLinkSchema,
  adminRevokeLinkSchema,
} from '../schemas/link.schema';

describe('Verification Schemas', () => {
  it('validates addPortfolioLinkSchema correctly', () => {
    const valid = addPortfolioLinkSchema.safeParse({
      providerKey: 'github',
      url: 'https://github.com/developer',
    });
    expect(valid.success).toBe(true);

    const invalidKey = addPortfolioLinkSchema.safeParse({
      providerKey: 'unknown_platform',
      url: 'https://example.com',
    });
    expect(invalidKey.success).toBe(false);

    const emptyUrl = addPortfolioLinkSchema.safeParse({
      providerKey: 'github',
      url: '',
    });
    expect(emptyUrl.success).toBe(false);
  });

  it('validates submitManualEvidenceSchema UUIDs', () => {
    const valid = submitManualEvidenceSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      evidenceAssetId: '223e4567-e89b-12d3-a456-426614174000',
    });
    expect(valid.success).toBe(true);

    const invalid = submitManualEvidenceSchema.safeParse({
      linkId: 'not-a-uuid',
      evidenceAssetId: 'not-a-uuid',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates adminReviewLinkSchema options', () => {
    const validApprove = adminReviewLinkSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'approve',
    });
    expect(validApprove.success).toBe(true);

    const validReject = adminReviewLinkSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'reject',
      rejectReason: 'code_not_found',
      rejectNote: 'Challenge code missing from bio.',
    });
    expect(validReject.success).toBe(true);

    const invalidAction = adminReviewLinkSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'delete',
    });
    expect(invalidAction.success).toBe(false);
  });

  it('validates adminRevokeLinkSchema requires reason', () => {
    const valid = adminRevokeLinkSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      reason: 'Account owner requested revocation.',
    });
    expect(valid.success).toBe(true);

    const tooShort = adminRevokeLinkSchema.safeParse({
      linkId: '123e4567-e89b-12d3-a456-426614174000',
      reason: 'no',
    });
    expect(tooShort.success).toBe(false);
  });
});

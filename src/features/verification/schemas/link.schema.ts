import { z } from 'zod';
import { PLATFORM_REGISTRY } from '../providers/registry';
import type { PlatformKey } from '../types/verification.types';

const platformKeys = Object.keys(PLATFORM_REGISTRY) as [PlatformKey, ...PlatformKey[]];

export const addPortfolioLinkSchema = z.object({
  providerKey: z.enum(platformKeys, {
    errorMap: () => ({ message: 'Please select a supported platform.' }),
  }),
  url: z
    .string()
    .min(5, 'URL is too short.')
    .max(500, 'URL must not exceed 500 characters.')
    .refine((val) => val.trim().length > 0, 'URL is required.'),
});

export const submitManualEvidenceSchema = z.object({
  linkId: z.string().uuid('Invalid portfolio link ID.'),
  evidenceAssetId: z.string().uuid('Invalid evidence asset ID.'),
});

export const verifyDomainSchema = z.object({
  linkId: z.string().uuid('Invalid portfolio link ID.'),
});

export const deletePortfolioLinkSchema = z.object({
  linkId: z.string().uuid('Invalid portfolio link ID.'),
});

export const adminReviewLinkSchema = z.object({
  linkId: z.string().uuid('Invalid portfolio link ID.'),
  action: z.enum(['approve', 'reject'], {
    errorMap: () => ({ message: 'Action must be approve or reject.' }),
  }),
  rejectReason: z
    .enum(['code_not_found', 'handle_mismatch', 'unclear_screenshot', 'suspicious_account', 'other'])
    .optional(),
  rejectNote: z.string().max(300, 'Rejection note must not exceed 300 characters.').optional(),
});

export const adminRevokeLinkSchema = z.object({
  linkId: z.string().uuid('Invalid portfolio link ID.'),
  reason: z
    .string()
    .min(3, 'Revocation reason must be at least 3 characters.')
    .max(300, 'Revocation reason must not exceed 300 characters.'),
});

export type AddPortfolioLinkInput = z.infer<typeof addPortfolioLinkSchema>;
export type SubmitManualEvidenceInput = z.infer<typeof submitManualEvidenceSchema>;
export type VerifyDomainInput = z.infer<typeof verifyDomainSchema>;
export type DeletePortfolioLinkInput = z.infer<typeof deletePortfolioLinkSchema>;
export type AdminReviewLinkInput = z.infer<typeof adminReviewLinkSchema>;
export type AdminRevokeLinkInput = z.infer<typeof adminRevokeLinkSchema>;

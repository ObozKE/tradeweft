import { z } from 'zod';
import { sanitizeUserText } from '@/features/packages/utils/sanitizer';
import { validateAndFormatPhone } from '../utils/phone';

export const contactChannelEnum = z.enum(['phone', 'whatsapp', 'email']);

export const proposalLineSchema = z.object({
  packageVersionId: z
    .string({ required_error: 'Package version ID is required' })
    .uuid('Invalid package version identifier'),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Quantity cannot exceed 99 units'),
});

export const proposeTradeSchema = z.object({
  recipientId: z
    .string({ required_error: 'Recipient provider is required' })
    .uuid('Invalid recipient identifier'),
  proposerLines: z
    .array(proposalLineSchema)
    .min(1, 'You must offer at least 1 service package')
    .max(3, 'You can offer at most 3 service packages in a single trade'),
  recipientLines: z
    .array(proposalLineSchema)
    .min(1, 'You must request at least 1 service package')
    .max(3, 'You can request at most 3 service packages in a single trade'),
  note: z
    .string()
    .max(500, 'Proposal note cannot exceed 500 characters')
    .optional()
    .transform((val) => (val ? sanitizeUserText(val, { maxConsecutiveNewlines: 2 }) : undefined)),
  consentedChannels: z
    .array(contactChannelEnum)
    .min(1, 'Please select at least one contact channel to share upon contract acceptance'),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        return validateAndFormatPhone(val).isValid;
      },
      { message: 'Please enter a valid phone number (e.g. 0712 345 678)' }
    ),
  whatsapp: z.boolean().default(true),
  idempotencyKey: z.string().optional(),
});

export const counterTradeSchema = z.object({
  agreementId: z.string().uuid('Invalid agreement identifier'),
  expectedRevisionNo: z.number().int().min(1),
  proposerLines: z
    .array(proposalLineSchema)
    .min(1, 'Proposer offerings must include at least 1 service package')
    .max(3, 'Proposer offerings cannot exceed 3 service packages'),
  recipientLines: z
    .array(proposalLineSchema)
    .min(1, 'Recipient offerings must include at least 1 service package')
    .max(3, 'Recipient offerings cannot exceed 3 service packages'),
  note: z
    .string()
    .max(500, 'Counter-offer note cannot exceed 500 characters')
    .optional()
    .transform((val) => (val ? sanitizeUserText(val, { maxConsecutiveNewlines: 2 }) : undefined)),
  idempotencyKey: z.string().optional(),
});

export const acceptTradeSchema = z.object({
  agreementId: z.string().uuid('Invalid agreement identifier'),
  expectedRevisionNo: z.number().int().min(1),
  consentedChannels: z
    .array(contactChannelEnum)
    .min(1, 'Please select at least one contact channel to share upon acceptance'),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || !val.trim()) return true;
        return validateAndFormatPhone(val).isValid;
      },
      { message: 'Please enter a valid phone number (e.g. 0712 345 678)' }
    ),
  whatsapp: z.boolean().default(true),
  idempotencyKey: z.string().optional(),
});

export const disputeSchema = z.object({
  agreementId: z.string().uuid('Invalid agreement identifier'),
  reason: z
    .string({ required_error: 'Dispute reason is required' })
    .min(5, 'Dispute reason must be at least 5 characters')
    .max(1000, 'Dispute reason cannot exceed 1000 characters')
    .transform((val) => sanitizeUserText(val, { maxConsecutiveNewlines: 2 })),
  idempotencyKey: z.string().optional(),
});

export const cancellationRequestSchema = z.object({
  agreementId: z.string().uuid('Invalid agreement identifier'),
  reason: z
    .string({ required_error: 'Cancellation reason is required' })
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(500, 'Cancellation reason cannot exceed 500 characters')
    .transform((val) => sanitizeUserText(val, { maxConsecutiveNewlines: 2 })),
  idempotencyKey: z.string().optional(),
});

export const profileContactSchema = z.object({
  phone: z
    .string({ required_error: 'Phone number is required' })
    .refine((val) => validateAndFormatPhone(val).isValid, {
      message: 'Please enter a valid phone number (e.g. 0712 345 678)',
    }),
  whatsapp: z.boolean().default(true),
});

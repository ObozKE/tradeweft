import { z } from 'zod';

/**
 * Normalizes phone numbers for Safaricom Daraja STK Push.
 * Expected output: 2547XXXXXXXX or 2541XXXXXXXX (12 digits, E.164 without leading +)
 */
export function normalizeMpesaPhoneNumber(raw: string): string {
  // Strip spaces, dashes, parentheses, plus signs
  const cleaned = raw.replace(/[\s\-\(\)\+]/g, '');

  if (/^0[71]\d{8}$/.test(cleaned)) {
    // 07XXXXXXXX or 01XXXXXXXX -> 254XXXXXXXXX
    return `254${cleaned.slice(1)}`;
  }

  if (/^[71]\d{8}$/.test(cleaned)) {
    // 7XXXXXXXX or 1XXXXXXXX -> 254XXXXXXXXX
    return `254${cleaned}`;
  }

  if (/^254[71]\d{8}$/.test(cleaned)) {
    // Already formatted 2547XXXXXXXX or 2541XXXXXXXX
    return cleaned;
  }

  throw new Error('INVALID_PHONE_NUMBER: Please provide a valid Kenyan phone number (e.g. 0712345678 or 0112345678)');
}

export const mpesaPhoneSchema = z
  .string()
  .min(9, 'Phone number is too short')
  .max(16, 'Phone number is too long')
  .transform((val, ctx) => {
    try {
      return normalizeMpesaPhoneNumber(val);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please provide a valid Safaricom M-Pesa phone number (e.g. 0712345678 or 0112345678)',
      });
      return z.NEVER;
    }
  });

export const initiateTopAdSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
  productId: z.enum(['top_ad_7d', 'top_ad_14d', 'top_ad_30d'], {
    errorMap: () => ({ message: 'Please select a valid Top Ad duration' }),
  }),
  phoneNumber: mpesaPhoneSchema,
  idempotencyKey: z.string().min(8, 'Idempotency key required'),
});

export const initiateBoostSchema = z.object({
  planId: z.enum(['basic', 'pro', 'enterprise'], {
    errorMap: () => ({ message: 'Please select a valid Boost plan' }),
  }),
  phoneNumber: mpesaPhoneSchema,
  idempotencyKey: z.string().min(8, 'Idempotency key required'),
});

export const darajaCallbackItemSchema = z.object({
  Name: z.string(),
  Value: z.union([z.string(), z.number()]).optional(),
});

export const darajaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(darajaCallbackItemSchema),
        })
        .optional(),
    }),
  }),
});

export type InitiateTopAdInput = z.infer<typeof initiateTopAdSchema>;
export type InitiateBoostInput = z.infer<typeof initiateBoostSchema>;
export type DarajaCallbackPayload = z.infer<typeof darajaCallbackSchema>;

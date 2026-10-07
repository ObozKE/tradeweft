import { z } from 'zod';

export const onboardingFormSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Display name must be at least 2 characters')
      .max(80, 'Display name must be at most 80 characters'),
    accountType: z.enum(['freelancer', 'business'], {
      required_error: 'Please select an account type',
    }),
    businessName: z.string().trim().max(120, 'Business name too long').optional(),
    countryCode: z.string().length(2, 'Please select a valid country'),
    cityId: z.string().uuid('Please select a valid city'),
    areaId: z.string().uuid('Please select a valid neighborhood / area'),
    remoteDelivery: z.boolean().default(false),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to continue' }),
    }),
    termsVersion: z.string().default('v1.0-ke-2026'),
  })
  .refine(
    (data) => {
      // If business account type is chosen, encourage/require business name
      if (data.accountType === 'business' && (!data.businessName || data.businessName.length < 2)) {
        return false;
      }
      return true;
    },
    {
      message: 'Business name is required for business accounts',
      path: ['businessName'],
    }
  );

export type OnboardingFormData = z.infer<typeof onboardingFormSchema>;

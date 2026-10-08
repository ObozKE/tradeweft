import { z } from 'zod';
import { sanitizeUserText } from '../utils/sanitizer';

export const deliveryModeEnum = z.enum(['in_person', 'remote', 'hybrid']);
export type DeliveryMode = z.infer<typeof deliveryModeEnum>;

export const packageStatusEnum = z.enum([
  'draft',
  'published',
  'paused',
  'archived',
  'removed',
]);
export type PackageStatus = z.infer<typeof packageStatusEnum>;

export const servicePackageInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z
      .string()
      .min(10, 'Title must be at least 10 characters')
      .max(80, 'Title cannot exceed 80 characters')
      .transform((val) => sanitizeUserText(val, { singleLine: true })),
    summary: z
      .string()
      .min(20, 'Summary must be at least 20 characters')
      .max(160, 'Summary cannot exceed 160 characters')
      .transform((val) => sanitizeUserText(val, { singleLine: true })),
    description: z
      .string()
      .min(50, 'Description must be at least 50 characters')
      .max(2000, 'Description cannot exceed 2000 characters')
      .transform((val) => sanitizeUserText(val, { maxConsecutiveNewlines: 2 })),
    categoryId: z.string().uuid('Please select a valid category'),
    deliveryMode: deliveryModeEnum,
    countryCode: z.string().length(2, 'Country code must be 2 characters (ISO 3166-1)'),
    cityId: z.string().uuid('City is required').nullable().optional(),
    areaId: z.string().uuid('Neighborhood is required').nullable().optional(),
    turnaroundDays: z.coerce
      .number()
      .int('Turnaround must be a whole number of days')
      .min(1, 'Turnaround must be at least 1 day')
      .max(180, 'Turnaround cannot exceed 180 days'),
    capacityPerMonth: z.coerce
      .number()
      .int('Monthly capacity must be a whole number')
      .min(1, 'Capacity must be at least 1 per month')
      .max(100, 'Capacity cannot exceed 100 per month')
      .nullable()
      .optional(),
    indicativeValueMinor: z.coerce
      .number()
      .int('Indicative value must be an integer')
      .min(0, 'Indicative value cannot be negative')
      .nullable()
      .optional(),
    currencyCode: z
      .string()
      .length(3, 'Currency code must be 3 characters (ISO 4217)')
      .default('KES'),
    deliverables: z
      .array(
        z
          .string()
          .min(3, 'Each deliverable must be at least 3 characters')
          .max(120, 'Deliverables cannot exceed 120 characters')
          .transform((val) => sanitizeUserText(val, { singleLine: true }))
      )
      .min(1, 'Provide at least 1 concrete deliverable item')
      .max(10, 'Maximum of 10 deliverables allowed'),
    exclusions: z
      .array(
        z
          .string()
          .min(3, 'Each exclusion must be at least 3 characters')
          .max(120, 'Exclusions cannot exceed 120 characters')
          .transform((val) => sanitizeUserText(val, { singleLine: true }))
      )
      .max(10, 'Maximum of 10 exclusions allowed')
      .default([]),
    seekingCategoryIds: z
      .array(z.string().uuid())
      .max(5, 'Select up to 5 categories you are seeking in return')
      .default([]),
    expectedUpdatedAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // 1. Delivery mode location rules
    if (data.deliveryMode === 'in_person' || data.deliveryMode === 'hybrid') {
      if (!data.cityId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cityId'],
          message: 'City is required for in-person and hybrid services',
        });
      }
      if (!data.areaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['areaId'],
          message: 'Neighborhood is required for in-person and hybrid services',
        });
      }
    } else if (data.deliveryMode === 'remote') {
      if (!data.cityId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cityId'],
          message: 'City location is required for your operating base',
        });
      }
    }
  });

export type ServicePackageInput = z.infer<typeof servicePackageInputSchema>;

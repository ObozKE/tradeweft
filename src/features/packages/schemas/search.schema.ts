import { z } from 'zod';
import { deliveryModeEnum } from './package.schema';

export const packageSearchSchema = z.object({
  country: z
    .string()
    .length(2, 'Country must be a 2-letter ISO code')
    .toUpperCase()
    .default('KE'),
  city: z.string().uuid().optional(),
  area: z.string().uuid().optional(),
  category: z.string().uuid().optional(),
  seeking: z.string().uuid().optional(),
  mode: deliveryModeEnum.optional(),
  q: z
    .string()
    .max(100, 'Search query is too long')
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  cursor: z.string().optional(),
});

export type PackageSearchParams = z.infer<typeof packageSearchSchema>;

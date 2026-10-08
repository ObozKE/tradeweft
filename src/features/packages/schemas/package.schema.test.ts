import { describe, it, expect } from 'vitest';
import { servicePackageInputSchema } from './package.schema';

describe('servicePackageInputSchema Validation', () => {
  const validData = {
    title: 'Brand Identity Design Package',
    summary: 'Custom logo design, stationery, and visual brand guidelines for your company.',
    description: 'We craft comprehensive visual brand identities tailored to African modern markets. Includes vector logos, typography pairings, color systems, and brand asset guidelines.',
    categoryId: '11111111-1111-1111-1111-111111111111',
    deliveryMode: 'remote' as const,
    countryCode: 'KE',
    cityId: '22222222-2222-2222-2222-222222222222',
    turnaroundDays: 14,
    capacityPerMonth: 4,
    indicativeValueMinor: 5000000,
    currencyCode: 'KES',
    deliverables: ['Primary logo mark', 'Brand guidelines PDF', 'Social media kit'],
    exclusions: ['Commercial printing costs'],
    seekingCategoryIds: ['33333333-3333-3333-3333-333333333333'],
  };

  it('validates a correct service package payload', () => {
    const result = servicePackageInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Brand Identity Design Package');
      expect(result.data.deliverables).toHaveLength(3);
    }
  });

  it('fails when title is shorter than 10 characters', () => {
    const result = servicePackageInputSchema.safeParse({
      ...validData,
      title: 'Tiny Logo',
    });
    expect(result.success).toBe(false);
  });

  it('fails when deliverables list is empty', () => {
    const result = servicePackageInputSchema.safeParse({
      ...validData,
      deliverables: [],
    });
    expect(result.success).toBe(false);
  });

  it('fails when in-person package is missing areaId', () => {
    const result = servicePackageInputSchema.safeParse({
      ...validData,
      deliveryMode: 'in_person',
      areaId: null, // In-person requires areaId
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.areaId).toBeDefined();
    }
  });

  it('sanitizes excess whitespace and newlines automatically upon parsing', () => {
    const result = servicePackageInputSchema.safeParse({
      ...validData,
      title: 'Brand   Identity    Design\nPackage',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Brand Identity Design Package');
    }
  });
});

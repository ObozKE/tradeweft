import { describe, it, expect } from 'vitest';
import { onboardingFormSchema } from './onboarding.schema';

describe('onboardingFormSchema', () => {
  const validFreelancer = {
    displayName: 'Wanjiku Mwangi',
    accountType: 'freelancer' as const,
    countryCode: 'KE',
    cityId: '11111111-1111-1111-1111-111111111111',
    areaId: '22222222-2222-2222-2222-222222222222',
    remoteDelivery: true,
    termsAccepted: true as const,
    termsVersion: 'v1.0-ke-2026',
  };

  it('validates a complete freelancer submission', () => {
    const res = onboardingFormSchema.safeParse(validFreelancer);
    expect(res.success).toBe(true);
  });

  it('validates a business submission with business name', () => {
    const validBusiness = {
      ...validFreelancer,
      accountType: 'business' as const,
      businessName: 'Apex Digital Studios Ltd',
    };
    const res = onboardingFormSchema.safeParse(validBusiness);
    expect(res.success).toBe(true);
  });

  it('rejects a business submission missing business name', () => {
    const invalidBusiness = {
      ...validFreelancer,
      accountType: 'business' as const,
      businessName: '',
    };
    const res = onboardingFormSchema.safeParse(invalidBusiness);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.businessName).toBeDefined();
    }
  });

  it('rejects submission if terms are not accepted', () => {
    const invalidTerms = {
      ...validFreelancer,
      termsAccepted: false,
    };
    const res = onboardingFormSchema.safeParse(invalidTerms);
    expect(res.success).toBe(false);
  });

  it('rejects invalid display name or invalid UUIDs', () => {
    const invalidData = {
      ...validFreelancer,
      displayName: 'A', // too short
      cityId: 'not-a-uuid',
    };
    const res = onboardingFormSchema.safeParse(invalidData);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.displayName).toBeDefined();
      expect(res.error.flatten().fieldErrors.cityId).toBeDefined();
    }
  });
});

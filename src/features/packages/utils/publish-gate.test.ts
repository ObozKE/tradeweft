import { describe, it, expect } from 'vitest';
import { canPublish } from './publish-gate';

describe('Publish Gate Policy', () => {
  const validBasePackage = {
    hasCompletedOnboarding: true,
    title: 'Professional SEO & Content Marketing',
    summary: 'Data-driven SEO optimization and content creation for local brands.',
    description: 'We optimize website technical architecture, perform keyword analysis, and craft high-converting articles.',
    deliveryMode: 'remote' as const,
    cityId: 'c0000000-0000-0000-0000-000000000001',
    areaId: null,
    deliverables: ['Audit report', '10 Blog posts', 'Backlink roadmap'],
    status: 'draft',
    activePackageCount: 3,
    maxActivePackages: 10,
  };

  it('approves complete and valid packages from onboarded providers', () => {
    const result = canPublish(validBasePackage);
    expect(result.canPublish).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejects when provider has not completed onboarding', () => {
    const result = canPublish({
      ...validBasePackage,
      hasCompletedOnboarding: false,
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('ONBOARDING_INCOMPLETE');
  });

  it('rejects when provider has reached the active package limit', () => {
    const result = canPublish({
      ...validBasePackage,
      activePackageCount: 10,
      maxActivePackages: 10,
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('ACTIVE_LIMIT_EXCEEDED');
  });

  it('rejects in-person packages without a specific neighborhood areaId', () => {
    const result = canPublish({
      ...validBasePackage,
      deliveryMode: 'in_person',
      areaId: null, // In-person requires areaId!
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('NEIGHBORHOOD_LOCATION_REQUIRED');
  });

  it('rejects packages without deliverables', () => {
    const result = canPublish({
      ...validBasePackage,
      deliverables: [],
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('DELIVERABLES_REQUIRED');
  });

  it('rejects packages with titles that are too short', () => {
    const result = canPublish({
      ...validBasePackage,
      title: 'Short',
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('INVALID_TITLE');
  });

  it('rejects packages with invalid statuses like archived or removed', () => {
    const resultArchived = canPublish({
      ...validBasePackage,
      status: 'archived',
    });
    expect(resultArchived.canPublish).toBe(false);
    expect(resultArchived.reasons).toContain('INVALID_STATUS');
  });

  it('rejects when country requires full verification and provider is unverified', () => {
    const result = canPublish({
      ...validBasePackage,
      publishGateMode: 'verified',
      verificationStatus: 'none',
    });
    expect(result.canPublish).toBe(false);
    expect(result.reasons).toContain('VERIFICATION_REQUIRED');

    const resultVerified = canPublish({
      ...validBasePackage,
      publishGateMode: 'verified',
      verificationStatus: 'verified',
    });
    expect(resultVerified.canPublish).toBe(true);
  });

  it('evaluates link_pending_or_verified country gate correctly', () => {
    const noLinks = canPublish({
      ...validBasePackage,
      publishGateMode: 'link_pending_or_verified',
      verificationStatus: 'none',
      hasPendingOrSubmittedLink: false,
    });
    expect(noLinks.canPublish).toBe(false);
    expect(noLinks.reasons).toContain('PORTFOLIO_LINK_REQUIRED');

    const pendingLink = canPublish({
      ...validBasePackage,
      publishGateMode: 'link_pending_or_verified',
      verificationStatus: 'pending',
    });
    expect(pendingLink.canPublish).toBe(true);

    const verifiedLink = canPublish({
      ...validBasePackage,
      publishGateMode: 'link_pending_or_verified',
      verificationStatus: 'verified',
    });
    expect(verifiedLink.canPublish).toBe(true);
  });
});

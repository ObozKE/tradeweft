import { describe, it, expect } from 'vitest';
import { initiateBoostSchema, initiateTopAdSchema } from '../schemas/payment.schema';
import { formatMinorMoney, calculateProratedUpgradeDiff } from '../utils/money';

describe('Payment Schemas & Validation', () => {
  it('validates valid Boost subscription inputs', () => {
    const valid = initiateBoostSchema.safeParse({
      planId: 'pro',
      phoneNumber: '0712345678',
      idempotencyKey: 'idemp_key_12345',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.phoneNumber).toBe('254712345678');
      expect(valid.data.planId).toBe('pro');
    }
  });

  it('rejects invalid Boost planId', () => {
    const invalid = initiateBoostSchema.safeParse({
      planId: 'mega_vip',
      phoneNumber: '0712345678',
      idempotencyKey: 'idemp_key_12345',
    });

    expect(invalid.success).toBe(false);
  });

  it('rejects short idempotency key', () => {
    const invalid = initiateBoostSchema.safeParse({
      planId: 'basic',
      phoneNumber: '0712345678',
      idempotencyKey: 'short',
    });

    expect(invalid.success).toBe(false);
  });

  it('validates Top Ad inputs with UUID packageId', () => {
    const valid = initiateTopAdSchema.safeParse({
      packageId: '00000000-0000-0000-0000-000000000001',
      productId: 'top_ad_7d',
      phoneNumber: '0799887766',
      idempotencyKey: 'idemp_topad_test_1',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.productId).toBe('top_ad_7d');
      expect(valid.data.phoneNumber).toBe('254799887766');
    }
  });

  it('rejects non-UUID packageId for Top Ads', () => {
    const invalid = initiateTopAdSchema.safeParse({
      packageId: 'not-a-uuid',
      productId: 'top_ad_7d',
      phoneNumber: '0799887766',
      idempotencyKey: 'idemp_topad_test_1',
    });

    expect(invalid.success).toBe(false);
  });
});

describe('Money Utilities & Currency Formatting', () => {
  it('formats minor amounts into KES correctly', () => {
    expect(formatMinorMoney(150000, 'KES')).toBe('KES 1,500');
    expect(formatMinorMoney(350000, 'KES')).toBe('KES 3,500');
    expect(formatMinorMoney(900000, 'KES')).toBe('KES 9,000');
    expect(formatMinorMoney(5000, 'KES')).toBe('KES 50');
  });

  it('handles proration diff between Basic and Pro plans', () => {
    // Current: Basic (1,500 KES = 150,000 minor)
    // New: Pro (3,500 KES = 350,000 minor)
    // 15 days remaining out of 30
    const diff = calculateProratedUpgradeDiff(150000, 350000, 15, 30);
    // Unused basic: 150,000 * (15/30) = 75,000
    // Prorated pro: 350,000 * (15/30) = 175,000
    // Diff = 175,000 - 75,000 = 100,000 minor (1,000 KES)
    expect(diff).toBe(100000);
  });

  it('returns 0 proration diff if new plan is cheaper or same', () => {
    const diff = calculateProratedUpgradeDiff(350000, 150000, 15, 30);
    expect(diff).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateTaxBreakdown,
  roundUpToGranularity,
  calculateProratedUpgradeDiff,
  formatMinorMoney,
} from '../utils/money';
import { normalizeMpesaPhoneNumber } from '../schemas/payment.schema';

describe('normalizeMpesaPhoneNumber', () => {
  it('normalizes 07XXXXXXXX to 2547XXXXXXXX', () => {
    expect(normalizeMpesaPhoneNumber('0712345678')).toBe('254712345678');
    expect(normalizeMpesaPhoneNumber('0722000000')).toBe('254722000000');
  });

  it('normalizes 01XXXXXXXX (Airtel/Safaricom new 01 prefix) to 2541XXXXXXXX', () => {
    expect(normalizeMpesaPhoneNumber('0112345678')).toBe('254112345678');
  });

  it('normalizes +254 and spaces/dashes', () => {
    expect(normalizeMpesaPhoneNumber('+254 712-345-678')).toBe('254712345678');
    expect(normalizeMpesaPhoneNumber('+254712345678')).toBe('254712345678');
  });

  it('handles 9-digit numbers starting with 7 or 1', () => {
    expect(normalizeMpesaPhoneNumber('712345678')).toBe('254712345678');
    expect(normalizeMpesaPhoneNumber('112345678')).toBe('254112345678');
  });

  it('preserves already normalized 2547XXXXXXXX', () => {
    expect(normalizeMpesaPhoneNumber('254712345678')).toBe('254712345678');
  });

  it('throws on invalid phone numbers', () => {
    expect(() => normalizeMpesaPhoneNumber('0201234567')).toThrow();
    expect(() => normalizeMpesaPhoneNumber('abcdefg')).toThrow();
    expect(() => normalizeMpesaPhoneNumber('12345')).toThrow();
    expect(() => normalizeMpesaPhoneNumber('+14155552671')).toThrow();
  });
});

describe('calculateTaxBreakdown', () => {
  it('calculates tax-inclusive breakdown (16% VAT)', () => {
    // 116.00 KES gross = 100.00 KES net + 16.00 KES tax
    const breakdown = calculateTaxBreakdown(11600, 1600, true);
    expect(breakdown.grossAmountMinor).toBe(11600);
    expect(breakdown.netAmountMinor).toBe(10000);
    expect(breakdown.taxAmountMinor).toBe(1600);
    expect(breakdown.taxInclusive).toBe(true);
  });

  it('calculates tax-exclusive breakdown (16% VAT)', () => {
    // 100.00 KES net + 16% = 116.00 KES gross
    const breakdown = calculateTaxBreakdown(10000, 1600, false);
    expect(breakdown.netAmountMinor).toBe(10000);
    expect(breakdown.taxAmountMinor).toBe(1600);
    expect(breakdown.grossAmountMinor).toBe(11600);
    expect(breakdown.taxInclusive).toBe(false);
  });

  it('handles 0% tax rate', () => {
    const breakdown = calculateTaxBreakdown(50000, 0, true);
    expect(breakdown.netAmountMinor).toBe(50000);
    expect(breakdown.taxAmountMinor).toBe(0);
    expect(breakdown.grossAmountMinor).toBe(50000);
  });

  it('throws on negative amounts or rates', () => {
    expect(() => calculateTaxBreakdown(-100, 1600)).toThrow();
    expect(() => calculateTaxBreakdown(1000, -100)).toThrow();
  });
});

describe('roundUpToGranularity', () => {
  it('rounds up to the nearest whole KES (100 minor units)', () => {
    expect(roundUpToGranularity(10000, 100)).toBe(10000);
    expect(roundUpToGranularity(10001, 100)).toBe(10100);
    expect(roundUpToGranularity(10050, 100)).toBe(10100);
    expect(roundUpToGranularity(10099, 100)).toBe(10100);
  });
});

describe('calculateProratedUpgradeDiff', () => {
  it('calculates exact mid-cycle upgrade difference', () => {
    // Plan Basic: KES 1,000 (100000 minor)
    // Plan Pro: KES 2,500 (250000 minor)
    // Diff: KES 1,500 (150000 minor)
    // 15 days remaining of 30: half = KES 750 (75000 minor)
    const prorated = calculateProratedUpgradeDiff(100000, 250000, 15, 30, 100);
    expect(prorated).toBe(75000);
  });

  it('rounds up prorated amount to adapter granularity', () => {
    // Diff: KES 1,000 across 30 days = 33.33 KES/day
    // 7 days remaining = 233.33 KES -> rounds up to 234.00 KES (23400 minor)
    const prorated = calculateProratedUpgradeDiff(100000, 200000, 7, 30, 100);
    expect(prorated).toBe(23400);
  });

  it('returns 0 for downgrades or equal plans', () => {
    expect(calculateProratedUpgradeDiff(250000, 100000, 15, 30, 100)).toBe(0);
    expect(calculateProratedUpgradeDiff(100000, 100000, 15, 30, 100)).toBe(0);
  });

  it('returns 0 when 0 days remain', () => {
    expect(calculateProratedUpgradeDiff(100000, 250000, 0, 30, 100)).toBe(0);
  });
});

describe('formatMinorMoney', () => {
  it('formats whole currency without decimals', () => {
    expect(formatMinorMoney(50000, 'KES')).toBe('KES 500');
    expect(formatMinorMoney(150000, 'KES')).toBe('KES 1,500');
  });

  it('formats fractional minor amounts with decimals', () => {
    expect(formatMinorMoney(50050, 'KES')).toBe('KES 500.50');
  });
});

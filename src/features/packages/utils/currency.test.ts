import { describe, it, expect } from 'vitest';
import {
  formatIndicativeValue,
  minorToMajor,
  majorToMinor,
  getCurrencyDecimalPlaces,
} from './currency';

describe('Currency and Indicative Barter Value Formatting', () => {
  it('correctly identifies decimal places for African and global currencies', () => {
    // 2-decimal currencies
    expect(getCurrencyDecimalPlaces('KES')).toBe(2);
    expect(getCurrencyDecimalPlaces('ZAR')).toBe(2);
    expect(getCurrencyDecimalPlaces('NGN')).toBe(2);
    expect(getCurrencyDecimalPlaces('USD')).toBe(2);

    // 0-decimal currencies
    expect(getCurrencyDecimalPlaces('UGX')).toBe(0);
    expect(getCurrencyDecimalPlaces('RWF')).toBe(0);
    expect(getCurrencyDecimalPlaces('BIF')).toBe(0);
    expect(getCurrencyDecimalPlaces('XAF')).toBe(0);
  });

  it('converts minor to major units accurately', () => {
    // KES: 250000 minor = 2,500.00 KES
    expect(minorToMajor(250000, 'KES')).toBe(2500);

    // UGX: 50000 minor = 50,000 UGX (0 decimals)
    expect(minorToMajor(50000, 'UGX')).toBe(50000);
  });

  it('converts major to minor units accurately', () => {
    expect(majorToMinor(2500, 'KES')).toBe(250000);
    expect(majorToMinor(50000, 'UGX')).toBe(50000);
  });

  it('formats 2-decimal currency with correct currency symbol', () => {
    const formatted = formatIndicativeValue(150000, 'KES', 'en-KE');
    // Expect KES or KSh formatting with 1,500.00
    expect(formatted).toContain('1,500');
  });

  it('formats 0-decimal currency without decimal places', () => {
    const formatted = formatIndicativeValue(200000, 'UGX', 'en-UG');
    // Expect UGX 200,000 without .00
    expect(formatted).not.toContain('.00');
    expect(formatted).toContain('200,000');
  });

  it('returns default fallback when indicative value is null', () => {
    expect(formatIndicativeValue(null)).toBe('Trade by Agreement');
    expect(formatIndicativeValue(undefined)).toBe('Trade by Agreement');
  });
});

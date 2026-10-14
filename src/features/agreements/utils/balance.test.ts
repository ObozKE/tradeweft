import { describe, it, expect } from 'vitest';
import { calculateTradeBalance } from './balance';

describe('Trade Balance Calculation', () => {
  it('identifies an even trade within 15% tolerance', () => {
    // 50,000 vs 55,000 (10% diff)
    const myLines = [{ indicativeValueMinor: 5000000, quantity: 1 }];
    const theirLines = [{ indicativeValueMinor: 5500000, quantity: 1 }];

    const res = calculateTradeBalance(myLines, theirLines, 'KES');
    expect(res.status).toBe('about_even');
    expect(res.differencePercentage).toBeLessThanOrEqual(15);
    expect(res.myTotalMinor).toBe(5000000);
    expect(res.theirTotalMinor).toBe(5500000);
  });

  it('identifies trade tilted toward counterparty (proposer offers more)', () => {
    // 100,000 vs 40,000
    const myLines = [{ indicativeValueMinor: 10000000, quantity: 1 }];
    const theirLines = [{ indicativeValueMinor: 4000000, quantity: 1 }];

    const res = calculateTradeBalance(myLines, theirLines, 'KES');
    expect(res.status).toBe('tilted_toward_them');
    expect(res.differencePercentage).toBe(60);
  });

  it('identifies trade tilted toward user (counterparty offers more)', () => {
    // 30,000 vs 80,000
    const myLines = [{ indicativeValueMinor: 3000000, quantity: 1 }];
    const theirLines = [{ indicativeValueMinor: 8000000, quantity: 1 }];

    const res = calculateTradeBalance(myLines, theirLines, 'KES');
    expect(res.status).toBe('tilted_toward_you');
    expect(res.differencePercentage).toBe(63);
  });

  it('handles missing indicative values as incomplete (advisory only)', () => {
    const myLines = [{ indicativeValueMinor: null, quantity: 1 }];
    const theirLines = [{ indicativeValueMinor: 5000000, quantity: 1 }];

    const res = calculateTradeBalance(myLines, theirLines, 'KES');
    expect(res.status).toBe('incomplete');
    expect(res.formattedMyTotal).toBe('Value not set');
    expect(res.differencePercentage).toBeNull();
  });

  it('supports 0-decimal currencies like UGX or RWF properly', () => {
    // UGX: minor amount is major amount (0 decimals)
    const myLines = [{ indicativeValueMinor: 500000, quantity: 2 }]; // 1,000,000 UGX
    const theirLines = [{ indicativeValueMinor: 950000, quantity: 1 }]; // 950,000 UGX (~5% diff)

    const res = calculateTradeBalance(myLines, theirLines, 'UGX');
    expect(res.status).toBe('about_even');
    expect(res.formattedMyTotal).toContain('UGX');
  });

  it('handles empty line sets gracefully', () => {
    const res = calculateTradeBalance([], []);
    expect(res.status).toBe('about_even');
    expect(res.myTotalMinor).toBe(0);
    expect(res.theirTotalMinor).toBe(0);
  });
});

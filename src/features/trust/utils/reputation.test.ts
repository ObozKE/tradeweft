import { describe, it, expect } from 'vitest';
import {
  calculateBayesianScore,
  formatContractRef,
  isWindowActive,
  getRemainingTime,
  REPUTATION_TIERS,
} from './reputation';

describe('Reputation Utilities', () => {
  describe('calculateBayesianScore', () => {
    it('returns prior score (80.0) when effectiveTradeCount is 0', () => {
      const score = calculateBayesianScore(0, 0);
      expect(score).toBe(80.0);
    });

    it('correctly calculates Bayesian score for 5 perfect ratings', () => {
      // 5 trades at 5.0 stars = 25.0 sum
      // weightedRatingSum = 25.0 (25 * 20 = 500)
      // prior = 5 * 80 = 400
      // total = (500 + 400) / (5 + 5) = 900 / 10 = 90.0
      const score = calculateBayesianScore(25.0, 5);
      expect(score).toBe(90.0);
    });

    it('smooths low ratings without unfair catastrophic collapse', () => {
      // 1 trade at 1.0 star = 1.0 sum (1 * 20 = 20)
      // prior = 5 * 80 = 400
      // total = (20 + 400) / (1 + 5) = 420 / 6 = 70.0
      const score = calculateBayesianScore(1.0, 1);
      expect(score).toBe(70.0);
    });

    it('clamps scores strictly between 0 and 100', () => {
      const maxScore = calculateBayesianScore(5000, 1000);
      expect(maxScore).toBeLessThanOrEqual(100.0);

      const minScore = calculateBayesianScore(-100, 10);
      expect(minScore).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('formatContractRef', () => {
    it('formats SHA-256 hash into TW- prefix and 12 uppercase characters', () => {
      const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const ref = formatContractRef(hash);
      expect(ref).toBe('TW-E3B0C44298FC');
      expect(ref.length).toBe(15);
    });

    it('handles empty hash gracefully', () => {
      expect(formatContractRef('')).toBe('TW-000000');
    });
  });

  describe('isWindowActive and getRemainingTime', () => {
    it('identifies future and past deadlines accurately', () => {
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      const past = new Date(Date.now() - 1000 * 60).toISOString();

      expect(isWindowActive(future)).toBe(true);
      expect(isWindowActive(past)).toBe(false);

      expect(getRemainingTime(past).isExpired).toBe(true);
      expect(getRemainingTime(future).isExpired).toBe(false);
    });
  });

  describe('REPUTATION_TIERS', () => {
    it('defines new, building, and established tiers', () => {
      expect(REPUTATION_TIERS.new.minPartners).toBe(0);
      expect(REPUTATION_TIERS.building.minPartners).toBe(3);
      expect(REPUTATION_TIERS.established.minPartners).toBe(10);
    });
  });
});

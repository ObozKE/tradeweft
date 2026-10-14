import type { ReputationTier } from '../types/trust.types';

export interface ReputationTierConfig {
  tier: ReputationTier;
  label: string;
  minPartners: number;
  maxPartners?: number;
  badgeClass: string;
  description: string;
}

export const REPUTATION_TIERS: Record<ReputationTier, ReputationTierConfig> = {
  new: {
    tier: 'new',
    label: 'New Provider',
    minPartners: 0,
    maxPartners: 2,
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900/40 dark:text-stone-300 dark:border-stone-800',
    description: 'Fewer than 3 distinct trading partners. Reliability score unlocking soon.',
  },
  building: {
    tier: 'building',
    label: 'Building Track Record',
    minPartners: 3,
    maxPartners: 9,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    description: 'Active trader with 3 to 9 distinct trading partners.',
  },
  established: {
    tier: 'established',
    label: 'Established Provider',
    minPartners: 10,
    badgeClass: 'bg-emerald-50 text-[#01796F] border-emerald-200 dark:bg-[#01796F]/10 dark:text-emerald-400 dark:border-[#01796F]/30',
    description: 'Extensive track record with 10 or more distinct trading partners.',
  },
};

/**
 * Computes the Bayesian Reliability Score (0 to 100).
 * Prior: C = 80.0, weight m = 5 trades.
 * ratings are 1..5 stars, mapped to 0..100 points (rating * 20).
 */
export function calculateBayesianScore(
  weightedRatingSum: number,
  effectiveTradeCount: number,
  priorScore: number = 80.0,
  priorWeight: number = 5.0
): number {
  if (effectiveTradeCount <= 0) {
    return priorScore;
  }

  const score =
    (weightedRatingSum * 20.0 + priorWeight * priorScore) /
    (effectiveTradeCount + priorWeight);

  // Clamp strictly between 0 and 100 and round to 1 decimal place
  const clamped = Math.max(0, Math.min(100, score));
  return Math.round(clamped * 10) / 10;
}

/**
 * Checks whether an ISO timestamp is still in the future.
 */
export function isWindowActive(deadlineIso: string): boolean {
  return new Date(deadlineIso).getTime() > Date.now();
}

/**
 * Returns human-readable remaining time string.
 */
export function getRemainingTime(deadlineIso: string): {
  isExpired: boolean;
  text: string;
} {
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return { isExpired: true, text: 'Expired' };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return {
      isExpired: false,
      text: `${days}d ${remHours}h left`,
    };
  }

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (hours > 0) {
    const remMinutes = minutes % 60;
    return {
      isExpired: false,
      text: `${hours}h ${remMinutes}m left`,
    };
  }

  return {
    isExpired: false,
    text: `${Math.max(1, minutes)}m left`,
  };
}

/**
 * Formats a short contract reference for safe public display.
 */
export function formatContractRef(termsHash: string): string {
  if (!termsHash) return 'TW-000000';
  const clean = termsHash.replace(/[^a-fA-F0-9]/g, '');
  return `TW-${clean.substring(0, 12).toUpperCase()}`;
}

import React from 'react';
import { ShieldCheck, Sparkles, Award } from 'lucide-react';
import type { ReputationTier } from '../types/trust.types';
import { REPUTATION_TIERS } from '../utils/reputation';

export interface ReputationBadgeProps {
  tier?: ReputationTier | null;
  score?: number | null;
  isScoreVisible?: boolean | null;
  completedTradesCount?: number | null;
  distinctPartnersCount?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  className?: string;
}

export function ReputationBadge({
  tier = 'new',
  score,
  isScoreVisible = false,
  completedTradesCount,
  distinctPartnersCount = 0,
  size = 'md',
  showDetails = false,
  className = '',
}: ReputationBadgeProps) {
  const currentTier = tier || 'new';
  const tierConfig = REPUTATION_TIERS[currentTier] || REPUTATION_TIERS.new;

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  }[size];

  const formattedScore = score != null ? Math.round(score) : null;

  // If score is unlocked (distinct partners >= 3)
  if (isScoreVisible && formattedScore !== null) {
    return (
      <div
        className={`inline-flex items-center rounded-chip font-medium border transition-colors ${
          currentTier === 'established'
            ? 'bg-pine-50 text-pine-800 border-pine-300 dark:bg-pine-950/40 dark:text-pine-200 dark:border-pine-800'
            : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
        } ${sizeStyles} ${className}`}
        title={`Reliability Score: ${formattedScore} / 100 based on ${distinctPartnersCount ?? 0} trading partners`}
        aria-label={`Reliability Score ${formattedScore} out of 100, ${tierConfig.label}`}
      >
        {currentTier === 'established' ? (
          <ShieldCheck className={`${iconSizes} text-pine-600 dark:text-pine-400`} aria-hidden="true" />
        ) : (
          <Award className={`${iconSizes} text-amber-700 dark:text-amber-400`} aria-hidden="true" />
        )}
        <span className="font-semibold">{formattedScore}%</span>
        <span className="text-text-secondary dark:text-text-muted">Reliability</span>
        {showDetails && completedTradesCount != null && completedTradesCount > 0 && (
          <span className="text-text-muted border-l border-border pl-1.5 ms-1">
            {completedTradesCount} {completedTradesCount === 1 ? 'trade' : 'trades'}
          </span>
        )}
      </div>
    );
  }

  // If score is building / new (< 3 distinct partners)
  const partners = distinctPartnersCount ?? 0;
  return (
    <div
      className={`inline-flex items-center rounded-chip font-medium border bg-surface-sunken text-text-secondary border-border ${sizeStyles} ${className}`}
      title={tierConfig.description}
      aria-label={`${tierConfig.label}: ${partners} of 3 partners towards public score`}
    >
      <Sparkles className={`${iconSizes} text-text-muted`} aria-hidden="true" />
      <span>{tierConfig.label}</span>
      {showDetails && (
        <span className="text-text-muted text-[11px] border-l border-border pl-1.5 ms-1">
          {partners}/3 partners
        </span>
      )}
    </div>
  );
}

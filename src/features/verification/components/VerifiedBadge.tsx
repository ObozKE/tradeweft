import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderVerificationAggregateStatus } from '@/lib/supabase/database.types';

export interface VerifiedBadgeProps {
  status?: ProviderVerificationAggregateStatus | null;
  linkCount?: number | null;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Trade Weft — "Portfolio Verified" Badge
 * Displays the earned portfolio verification badge with proof count.
 * Earned through cryptographic OAuth, DNS/meta domain proof, or verified work evidence.
 * NEVER implies paid endorsement or commercial warranty.
 */
export function VerifiedBadge({
  status,
  linkCount,
  className,
  size = 'md',
}: VerifiedBadgeProps) {
  if (status !== 'verified') {
    return null;
  }

  const isSmall = size === 'sm';

  const tooltipText = linkCount && linkCount > 0
    ? `Portfolio verified across ${linkCount} external account${linkCount === 1 ? '' : 's'}. Earned through ownership proof.`
    : 'Portfolio verified through proof of ownership. Earned, never bought.';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-pine-300 bg-pine-50 font-semibold text-pine-900 transition-colors',
        isSmall ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className
      )}
      title={tooltipText}
    >
      <BadgeCheck
        className={cn('text-pine-700 shrink-0', isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5')}
        aria-hidden="true"
      />
      <span>Portfolio verified</span>
      {linkCount && linkCount > 1 ? (
        <span className="text-pine-700 text-[10px] font-mono font-normal">
          ({linkCount})
        </span>
      ) : null}
    </span>
  );
}

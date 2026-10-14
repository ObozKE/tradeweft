import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Star,
  Users,
  Repeat,
  CheckCircle2,
  Clock,
  MessageSquare,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import type { ProviderReputationData } from '../types/trust.types';
import { ReputationBadge } from './ReputationBadge';

interface ScoreBreakdownCardProps {
  reputation: ProviderReputationData;
  className?: string;
}

export function ScoreBreakdownCard({ reputation, className = '' }: ScoreBreakdownCardProps) {
  const {
    score,
    tier,
    isScoreVisible,
    completedTradesCount,
    distinctPartnersCount,
    avgOverallRating,
    wouldTradeAgainPct,
    avgQualityRating,
    avgCommunicationRating,
    avgTimelinessRating,
  } = reputation;

  const partnerProgress = Math.min(3, distinctPartnersCount);
  const progressPct = Math.round((partnerProgress / 3) * 100);

  return (
    <div
      className={`rounded-xl border border-border bg-surface p-6 shadow-sm transition-all ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-pine-600" aria-hidden="true" />
            Proof of Reliability
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Tamper-evident reputation derived from verified, completed barter contracts.
          </p>
        </div>
        <div>
          <ReputationBadge
            tier={tier}
            score={score}
            isScoreVisible={isScoreVisible}
            distinctPartnersCount={distinctPartnersCount}
            size="lg"
          />
        </div>
      </div>

      {/* Main Score or Unlock Progress */}
      <div className="py-6 border-b border-border">
        {isScoreVisible ? (
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
            <div className="text-4xl font-bold tracking-tight text-ink flex items-baseline gap-1">
              <span>{Math.round(score)}</span>
              <span className="text-lg font-normal text-text-muted">/100</span>
            </div>
            <div className="text-xs text-text-secondary">
              Bayesian reliability score weighted by contract recency and distinct partner diversity.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 text-ink">
                <Sparkles className="h-4 w-4 text-amber-700" aria-hidden="true" />
                Score Unlocks at 3 Distinct Trading Partners
              </span>
              <span className="text-text-muted">
                {partnerProgress} of 3 partners ({progressPct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
              <div
                className="h-full bg-pine-600 transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              To prevent reciprocal bias and collusive gaming, public numerical scores require at
              least 3 unique counterparties.
            </p>
          </div>
        )}
      </div>

      {/* Key Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-6 border-b border-border">
        <div className="rounded-lg bg-surface-sunken p-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
            <span>Completed Trades</span>
          </div>
          <p className="text-lg font-semibold text-ink mt-1">{completedTradesCount}</p>
        </div>

        <div className="rounded-lg bg-surface-sunken p-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Users className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
            <span>Unique Partners</span>
          </div>
          <p className="text-lg font-semibold text-ink mt-1">{distinctPartnersCount}</p>
        </div>

        <div className="rounded-lg bg-surface-sunken p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Repeat className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
            <span>Would Trade Again</span>
          </div>
          <p className="text-lg font-semibold text-ink mt-1">
            {wouldTradeAgainPct != null ? `${Math.round(wouldTradeAgainPct)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Rating Category Breakdown */}
      <div className="py-6 space-y-3 border-b border-border">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Category Ratings (1 - 5)
        </h3>

        <div className="space-y-2.5">
          <RatingRow
            label="Service Quality"
            icon={<Star className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />}
            value={avgQualityRating}
          />
          <RatingRow
            label="Communication"
            icon={<MessageSquare className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />}
            value={avgCommunicationRating}
          />
          <RatingRow
            label="Timeliness & Delivery"
            icon={<Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />}
            value={avgTimelinessRating}
          />
        </div>
      </div>

      {/* Explainer Link & Safeguard Notice */}
      <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          Neutrality guarantee: Unresolved disputes never reduce scores.
        </span>
        <Link
          href="/trust"
          className="font-medium text-pine-600 hover:text-pine-700 underline underline-offset-4"
        >
          How reliability is computed →
        </Link>
      </div>
    </div>
  );
}

function RatingRow({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | null;
}) {
  const formatted = value != null ? (Math.round(value * 10) / 10).toFixed(1) : '—';
  const widthPct = value != null ? Math.round((value / 5) * 100) : 0;

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 w-44 text-ink">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 mx-3 h-2 rounded-full bg-surface-sunken overflow-hidden">
        <div
          className="h-full bg-pine-600 rounded-full"
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="w-8 text-right font-semibold text-ink">{formatted}</span>
    </div>
  );
}

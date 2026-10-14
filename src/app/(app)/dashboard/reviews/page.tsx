import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import {
  getUserDashboardReviews,
  getProviderProfileData,
} from '@/features/trust/queries/trust.queries';
import { DashboardReviewsClient } from '@/features/trust/components/DashboardReviewsClient';
import { generatePackageSlug } from '@/features/packages/utils/slug';
import {
  ShieldCheck,
  Star,
  ExternalLink,
  Users,
  Repeat,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Reviews & Reputation | Trade Weft Dashboard',
  description: 'Manage barter reviews, track reliability score, and reply to partner feedback.',
};

interface ReviewsPageProps {
  searchParams: Promise<{
    tab?: 'to_review' | 'written' | 'received';
  }>;
}

export default async function ReviewsDashboardPage({ searchParams }: ReviewsPageProps) {
  const { user } = await requireOnboardedUser();
  const { tab = 'to_review' } = await searchParams;

  const [{ pendingTrades, writtenReviews, receivedReviews }, profileData] =
    await Promise.all([
      getUserDashboardReviews(user.id),
      getProviderProfileData(user.id),
    ]);

  const reputation = profileData?.reputation ?? {
    providerId: user.id,
    score: 80,
    tier: 'new',
    completedTradesCount: 0,
    distinctPartnersCount: 0,
    avgOverallRating: null,
    wouldTradeAgainPct: null,
    avgQualityRating: null,
    avgCommunicationRating: null,
    avgTimelinessRating: null,
    isScoreVisible: false,
    calculationVersion: 1,
    lastComputedAt: new Date().toISOString(),
  };

  const name = profileData?.businessName || profileData?.displayName || 'My Profile';
  const slug = generatePackageSlug(name);
  const publicProfileUrl = `/providers/${user.id}/${slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800 mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Phase 4: Trust & Reputation
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Reviews & Reputation
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Build your Proof of Reliability score through verified post-trade evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={publicProfileUrl}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface text-xs font-semibold text-ink hover:bg-surface-sunken transition-colors"
          >
            <span>View Public Profile</span>
            <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
          </Link>
          <Link
            href="/trust"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine-50 border border-pine-200 text-xs font-semibold text-pine-800 hover:bg-pine-100 transition-colors"
          >
            <span>How Score Works</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Reliability Score</span>
            <ShieldCheck className="h-4 w-4 text-pine-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            {reputation.isScoreVisible ? (
              <>
                <span className="text-2xl font-bold text-ink">
                  {Math.round(reputation.score)}
                </span>
                <span className="text-xs text-text-muted">/100</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-amber-800 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Unlocks at 3 partners
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Completed Trades</span>
            <Users className="h-4 w-4 text-pine-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {reputation.completedTradesCount}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Trading Partners</span>
            <Users className="h-4 w-4 text-pine-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {reputation.distinctPartnersCount}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Would Trade Again</span>
            <Repeat className="h-4 w-4 text-pine-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {reputation.wouldTradeAgainPct != null
              ? `${Math.round(reputation.wouldTradeAgainPct)}%`
              : '—'}
          </p>
        </div>
      </div>

      {/* Main Reviews Management Component */}
      <DashboardReviewsClient
        currentUserId={user.id}
        pendingTrades={pendingTrades}
        writtenReviews={writtenReviews}
        receivedReviews={receivedReviews}
        reputation={reputation}
        initialTab={tab}
      />
    </div>
  );
}

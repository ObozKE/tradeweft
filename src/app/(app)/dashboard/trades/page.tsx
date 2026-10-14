import React from 'react';
import Link from 'next/link';
import { requireOnboardedUser } from '@/server/dal';
import { getAgreementsForUser } from '@/features/agreements/queries/agreement.queries';
import { AgreementCard } from '@/features/agreements/components/AgreementCard';
import { Button } from '@/components/ui/button';
import {
  ArrowLeftRight,
  Sparkles,
  Inbox,
  Clock,
  CheckCircle2,
  Archive,
} from 'lucide-react';

interface TradesDashboardPageProps {
  searchParams: Promise<{
    tab?: 'needs_response' | 'waiting' | 'active' | 'closed';
  }>;
}

export default async function TradesDashboardPage({ searchParams }: TradesDashboardPageProps) {
  const { user } = await requireOnboardedUser();
  const { tab = 'needs_response' } = await searchParams;

  // Fetch count badges for tabs in parallel
  const [needsResponse, waiting, active, closed] = await Promise.all([
    getAgreementsForUser(user.id, 'needs_response'),
    getAgreementsForUser(user.id, 'waiting'),
    getAgreementsForUser(user.id, 'active'),
    getAgreementsForUser(user.id, 'closed'),
  ]);

  const currentList =
    tab === 'waiting'
      ? waiting
      : tab === 'active'
      ? active
      : tab === 'closed'
      ? closed
      : needsResponse;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800 mb-2">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Phase 3: Barter Agreements
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Barter Trade Agreements
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Negotiate proposals, agree on contract deliverables, and track barter fulfilments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/dashboard/matches">
            <Button variant="outline" className="h-10 text-xs font-semibold gap-1.5 border-pine-300 text-pine-800 hover:bg-pine-50">
              <Sparkles className="h-3.5 w-3.5 text-pine-600" />
              Mutual Matches
            </Button>
          </Link>
          <Link href="/explore">
            <Button variant="primary" className="h-10 text-xs font-semibold shadow-sm">
              Explore Packages to Trade
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-px" aria-label="Tabs">
          <Link
            href="/dashboard/trades?tab=needs_response"
            className={`inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
              tab === 'needs_response'
                ? 'border-pine-600 text-pine-800'
                : 'border-transparent text-text-secondary hover:text-ink hover:border-border'
            }`}
          >
            <Inbox className="h-4 w-4" />
            <span>Needs Your Response</span>
            {needsResponse.length > 0 && (
              <span className="rounded-full bg-pine-600 px-2 py-0.5 text-[11px] font-bold text-white">
                {needsResponse.length}
              </span>
            )}
          </Link>

          <Link
            href="/dashboard/trades?tab=waiting"
            className={`inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
              tab === 'waiting'
                ? 'border-pine-600 text-pine-800'
                : 'border-transparent text-text-secondary hover:text-ink hover:border-border'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Waiting on Them</span>
            {waiting.length > 0 && (
              <span className="rounded-full bg-surface-sunken border border-border px-2 py-0.5 text-[11px] font-bold text-text-secondary">
                {waiting.length}
              </span>
            )}
          </Link>

          <Link
            href="/dashboard/trades?tab=active"
            className={`inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
              tab === 'active'
                ? 'border-pine-600 text-pine-800'
                : 'border-transparent text-text-secondary hover:text-ink hover:border-border'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Active Trades</span>
            {active.length > 0 && (
              <span className="rounded-full bg-pine-100 text-pine-800 border border-pine-200 px-2 py-0.5 text-[11px] font-bold">
                {active.length}
              </span>
            )}
          </Link>

          <Link
            href="/dashboard/trades?tab=closed"
            className={`inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
              tab === 'closed'
                ? 'border-pine-600 text-pine-800'
                : 'border-transparent text-text-secondary hover:text-ink hover:border-border'
            }`}
          >
            <Archive className="h-4 w-4" />
            <span>Closed</span>
            {closed.length > 0 && (
              <span className="rounded-full bg-surface-sunken border border-border px-2 py-0.5 text-[11px] font-bold text-text-muted">
                {closed.length}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Trades List */}
      {currentList.length === 0 ? (
        <div className="rounded-card border border-border bg-white py-16 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
            <ArrowLeftRight className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-ink">
              {tab === 'needs_response' && 'No Incoming Trades Needing Response'}
              {tab === 'waiting' && 'No Outgoing Trades Awaiting Partner Response'}
              {tab === 'active' && 'No Active Barter Trades in Progress'}
              {tab === 'closed' && 'No Past or Closed Trade Agreements'}
            </h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              {tab === 'needs_response' && 'When other providers propose a trade for your services, they will appear here.'}
              {tab === 'waiting' && 'Proposals you have sent that are currently with your partners for review.'}
              {tab === 'active' && 'Agreed barter contracts currently in delivery and fulfilment.'}
              {tab === 'closed' && 'Completed, declined, or cancelled trade agreements.'}
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <Link href="/explore">
              <Button variant="primary" className="text-xs h-9">
                Find Services to Trade
              </Button>
            </Link>
            <Link href="/dashboard/matches">
              <Button variant="outline" className="text-xs h-9">
                View Mutual Matches
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {currentList.map((agr) => (
            <AgreementCard key={agr.id} agreement={agr} />
          ))}
        </div>
      )}
    </div>
  );
}

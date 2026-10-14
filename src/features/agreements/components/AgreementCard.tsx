import React from 'react';
import Link from 'next/link';
import type { AgreementListItem } from '../types/agreement.types';
import { AgreementStatusBadge } from './AgreementStatusBadge';
import { Button } from '@/components/ui/button';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import {
  ArrowRight,
  Clock,
  ArrowLeftRight,
  AlertCircle,
  Calendar,
} from 'lucide-react';

interface AgreementCardProps {
  agreement: AgreementListItem;
}

export function AgreementCard({ agreement }: AgreementCardProps) {
  const isExpired = agreement.status === 'proposed' && new Date(agreement.expiresAt) < new Date();
  const formattedExpiry = new Date(agreement.expiresAt).toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="rounded-card border border-border bg-white p-5 shadow-xs transition hover:shadow-sm space-y-4">
      {/* Top Header: Counterparty & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine-100 text-pine-800 font-bold">
            {agreement.counterparty.displayName[0]?.toUpperCase() || 'P'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink leading-tight">
                {agreement.counterparty.displayName}
              </h3>
              {agreement.counterparty.businessName && (
                <span className="text-xs text-text-muted">
                  • {agreement.counterparty.businessName}
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Revision #{agreement.currentRevisionNo} • {agreement.myRole === 'proposer' ? 'You initiated' : 'Incoming proposal'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {agreement.status === 'proposed' && (
            agreement.isMyTurn ? (
              <span className="inline-flex items-center gap-1 rounded-chip bg-pine-100 px-2.5 py-0.5 text-xs font-semibold text-pine-800 border border-pine-200">
                <AlertCircle className="h-3 w-3 text-pine-700" />
                Action Needed (Your Turn)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-chip bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text-muted border border-border">
                <Clock className="h-3 w-3" />
                Waiting on Partner
              </span>
            )
          )}
          <AgreementStatusBadge status={agreement.status} />
        </div>
      </div>

      {/* Package Offerings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-button bg-surface-sunken p-3 space-y-1">
          <p className="font-semibold text-text-secondary uppercase tracking-[0.04em]">
            You Deliver:
          </p>
          <p className="font-medium text-ink leading-snug">{agreement.givingLinesSummary}</p>
          {agreement.myTotalValueMinor !== null && (
            <p className="text-text-muted pt-1">
              Advisory: {formatIndicativeValue(agreement.myTotalValueMinor, agreement.currencyCode)}
            </p>
          )}
        </div>

        <div className="rounded-button bg-pine-50/50 border border-pine-100 p-3 space-y-1">
          <p className="font-semibold text-pine-900 uppercase tracking-[0.04em]">
            You Receive:
          </p>
          <p className="font-medium text-pine-950 leading-snug">{agreement.receivingLinesSummary}</p>
          {agreement.theirTotalValueMinor !== null && (
            <p className="text-pine-700 pt-1">
              Advisory: {formatIndicativeValue(agreement.theirTotalValueMinor, agreement.currencyCode)}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between pt-1 text-xs">
        {agreement.status === 'proposed' ? (
          <div className="flex items-center gap-1 text-text-muted">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {isExpired ? 'Proposal expired' : `Expires ${formattedExpiry}`}
            </span>
          </div>
        ) : (
          <div className="text-text-muted text-[11px]">
            Updated {new Date(agreement.updatedAt).toLocaleDateString('en-KE')}
          </div>
        )}

        <Link href={`/dashboard/trades/${agreement.id}`}>
          <Button
            variant={agreement.isMyTurn && agreement.status === 'proposed' ? 'primary' : 'outline'}
            className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-2xs"
          >
            <span>{agreement.isMyTurn && agreement.status === 'proposed' ? 'Review & Respond' : 'View Trade Room'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

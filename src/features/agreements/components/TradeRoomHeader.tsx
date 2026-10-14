'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AgreementStatusBadge } from './AgreementStatusBadge';
import { AcceptTradeModal } from './AcceptTradeModal';
import { CounterOfferModal } from './CounterOfferModal';
import { CancellationModal } from './CancellationModal';
import { DisputeModal } from './DisputeModal';
import {
  declineTradeAction,
  withdrawTradeAction,
} from '../actions/agreement.actions';
import type {
  AgreementDetail,
  PublishedPackageForTrade,
} from '../types/agreement.types';
import {
  ArrowLeft,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Star,
  ExternalLink,
} from 'lucide-react';
import { generatePackageSlug } from '@/features/packages/utils/slug';

interface TradeRoomHeaderProps {
  agreement: AgreementDetail;
  myPackages: PublishedPackageForTrade[];
  counterpartyPackages: PublishedPackageForTrade[];
  userPhone?: string | null;
  userWhatsapp?: boolean;
}

export function TradeRoomHeader({
  agreement,
  myPackages,
  counterpartyPackages,
  userPhone,
  userWhatsapp,
}: TradeRoomHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  const isProposed = agreement.status === 'proposed';
  const isActive = agreement.status === 'active';
  const isMyTurn = agreement.isMyTurn;

  const cancellationPendingByCounterparty =
    agreement.cancellationRequestedBy &&
    agreement.cancellationRequestedBy !== (agreement.myRole === 'proposer' ? agreement.proposerId : agreement.recipientId);

  const handleDecline = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await declineTradeAction(agreement.id, agreement.currentRevisionNo);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setShowDeclineConfirm(false);
        router.refresh();
      }
    });
  };

  const handleWithdraw = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await withdrawTradeAction(agreement.id, agreement.currentRevisionNo);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setShowWithdrawConfirm(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4 text-start">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/trades"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-pine-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trades
        </Link>
        <div className="flex items-center gap-2">
          <AgreementStatusBadge status={agreement.status} />
          {agreement.termsHash && (
            <span
              title={`Terms Hash: ${agreement.termsHash}`}
              className="inline-flex items-center gap-1 text-[11px] font-mono rounded-button px-2 py-0.5 border border-border bg-surface-sunken text-text-muted"
            >
              <ShieldCheck className="h-3 w-3 text-pine-600" />
              {agreement.termsHash.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* Main Header Card */}
      <div className="rounded-card border border-border bg-surface p-6 shadow-elevation-1 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-ink">
                Trade with {agreement.counterparty.displayName}
              </h1>
              <Link
                href={`/providers/${agreement.counterparty.id}/${generatePackageSlug(agreement.counterparty.businessName || agreement.counterparty.displayName || 'provider')}`}
                className="text-xs font-semibold text-pine-600 hover:text-pine-700 flex items-center gap-1"
                title="View partner's public trust profile"
              >
                <span>Profile</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {agreement.counterparty.businessName && (
              <p className="text-xs text-text-muted mt-0.5">
                {agreement.counterparty.businessName}
              </p>
            )}
          </div>

          {/* Action Button if Completed */}
          {agreement.status === 'completed' && (
            <div>
              <Link
                href="/dashboard/reviews?tab=to_review"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-600 text-white text-xs font-semibold hover:bg-pine-700 transition-colors shadow-xs"
              >
                <Star className="h-3.5 w-3.5" />
                <span>Write Partner Review</span>
              </Link>
            </div>
          )}

          {/* Action Buttons if Proposed */}
          {isProposed && (
            <div className="flex flex-wrap items-center gap-2">
              {isMyTurn ? (
                <>
                  <Button
                    type="button"
                    onClick={() => setIsAcceptModalOpen(true)}
                    disabled={isPending}
                    className="bg-pine-600 hover:bg-pine-700 text-white text-xs h-9"
                  >
                    <CheckCircle2 className="h-4 w-4 me-1.5" />
                    Accept Terms
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCounterModalOpen(true)}
                    disabled={isPending}
                    className="text-xs h-9"
                  >
                    <RotateCcw className="h-4 w-4 me-1.5 text-pine-600" />
                    Counter-Offer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeclineConfirm(true)}
                    disabled={isPending}
                    className="text-xs h-9 text-text-muted hover:text-amber-800"
                  >
                    <XCircle className="h-4 w-4 me-1.5" />
                    Decline
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted flex items-center gap-1.5 py-1 px-2.5 rounded-button bg-surface-sunken border border-border">
                    <Clock className="h-3.5 w-3.5 text-amber-700" />
                    Waiting for {agreement.counterparty.displayName}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowWithdrawConfirm(true)}
                    disabled={isPending}
                    className="text-xs h-9 text-text-muted hover:text-amber-800"
                  >
                    Withdraw
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Turn & Expiry Status Banner */}
        {isProposed && (
          <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
            <span className="flex items-center gap-1.5">
              {isMyTurn ? (
                <strong className="text-pine-700 dark:text-pine-400 font-semibold flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-pine-600 animate-pulse" />
                  Your turn to respond (Revision #{agreement.currentRevisionNo})
                </strong>
              ) : (
                <span className="text-text-muted">
                  Turn is currently with {agreement.counterparty.displayName}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-text-muted text-[11px]">
              <Clock className="h-3.5 w-3.5 text-amber-700" />
              Expires {new Date(agreement.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Mutual Cancellation Request Banner */}
        {cancellationPendingByCounterparty && isActive && (
          <div className="rounded-card border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                Cancellation Requested by {agreement.counterparty.displayName}
              </p>
              {agreement.cancellationReason && (
                <p className="italic text-text-secondary">&ldquo;{agreement.cancellationReason}&rdquo;</p>
              )}
            </div>
            <Button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs h-8 shrink-0"
            >
              Review & Accept Cancellation
            </Button>
          </div>
        )}

        {/* Dispute Notice Banner */}
        {agreement.status === 'disputed' && (
          <div className="rounded-card border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
              Trade Paused Due to Formal Dispute
            </p>
            {agreement.disputeReason && (
              <p className="italic text-text-secondary">&ldquo;{agreement.disputeReason}&rdquo;</p>
            )}
            <p className="text-[11px] text-text-muted pt-1">
              Recorded in the immutable trade ledger for resolution mediation.
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-button border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Decline Confirmation Dialog */}
      {showDeclineConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md bg-surface rounded-card border border-border shadow-elevation-3 p-6 text-start space-y-4">
            <h3 className="text-base font-bold text-ink">Decline Trade Proposal?</h3>
            <p className="text-xs text-text-secondary">
              This will decline the trade and mark it closed. {agreement.counterparty.displayName} will be notified.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeclineConfirm(false)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleDecline}
                disabled={isPending}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs"
              >
                {isPending ? 'Declining...' : 'Yes, Decline Proposal'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Confirmation Dialog */}
      {showWithdrawConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md bg-surface rounded-card border border-border shadow-elevation-3 p-6 text-start space-y-4">
            <h3 className="text-base font-bold text-ink">Withdraw Proposal?</h3>
            <p className="text-xs text-text-secondary">
              Are you sure you want to withdraw this proposal before {agreement.counterparty.displayName} responds?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowWithdrawConfirm(false)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleWithdraw}
                disabled={isPending}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs"
              >
                {isPending ? 'Withdrawing...' : 'Yes, Withdraw Proposal'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AcceptTradeModal
        agreementId={agreement.id}
        expectedRevisionNo={agreement.currentRevisionNo}
        isOpen={isAcceptModalOpen}
        onClose={() => setIsAcceptModalOpen(false)}
        counterpartyName={agreement.counterparty.displayName}
        userPhone={userPhone}
        userWhatsapp={userWhatsapp}
      />

      <CounterOfferModal
        agreementId={agreement.id}
        expectedRevisionNo={agreement.currentRevisionNo}
        isOpen={isCounterModalOpen}
        onClose={() => setIsCounterModalOpen(false)}
        myRole={agreement.myRole}
        counterpartyName={agreement.counterparty.displayName}
        currentLines={agreement.currentRevision.lines}
        myPackages={myPackages}
        counterpartyPackages={counterpartyPackages}
      />

      <CancellationModal
        agreementId={agreement.id}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        mode="accept"
        counterpartyName={agreement.counterparty.displayName}
        cancellationReason={agreement.cancellationReason}
      />
    </div>
  );
}

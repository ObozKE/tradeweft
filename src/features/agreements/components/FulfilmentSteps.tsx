'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  markDeliveredAction,
  confirmReceiptAction,
} from '../actions/agreement.actions';
import type {
  AgreementDetail,
  AgreementFulfilmentItem,
  AgreementSide,
} from '../types/agreement.types';
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { CancellationModal } from './CancellationModal';
import { DisputeModal } from './DisputeModal';

interface FulfilmentStepsProps {
  agreement: AgreementDetail;
}

export function FulfilmentSteps({ agreement }: FulfilmentStepsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);

  const isProposer = agreement.myRole === 'proposer';
  const mySide: AgreementSide = isProposer ? 'proposer_gives' : 'recipient_gives';
  const theirSide: AgreementSide = isProposer ? 'recipient_gives' : 'proposer_gives';

  const myFulfilment = agreement.fulfilment.find((f) => f.side === mySide);
  const theirFulfilment = agreement.fulfilment.find((f) => f.side === theirSide);

  const myDelivered = Boolean(myFulfilment?.deliveredMarkedAt);
  const myConfirmed = Boolean(myFulfilment?.receiptConfirmedAt);

  const theirDelivered = Boolean(theirFulfilment?.deliveredMarkedAt);
  const theirConfirmed = Boolean(theirFulfilment?.receiptConfirmedAt);

  const isAgreementActive = agreement.status === 'active';

  const handleMarkDelivered = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await markDeliveredAction(agreement.id, mySide);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleConfirmReceipt = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await confirmReceiptAction(agreement.id, theirSide);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-card border border-border bg-surface p-6 shadow-elevation-1 space-y-6 text-start">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-ink flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-pine-600" />
            Fulfilment & Delivery Milestones
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Both parties must mark their deliverables done and confirm receipt of the other side.
          </p>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Track 1: What You Deliver */}
        <div className="rounded-card border border-border bg-surface-sunken/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-pine-700 dark:text-pine-400">
              Your Deliverables
            </span>
            {myConfirmed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-pine-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed
              </span>
            ) : myDelivered ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                <Clock className="h-3.5 w-3.5" /> Awaiting Confirmation
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Clock className="h-3.5 w-3.5" /> In Progress
              </span>
            )}
          </div>

          <p className="text-xs text-text-secondary">
            {myConfirmed
              ? `${agreement.counterparty.displayName} confirmed receipt on ${new Date(
                  myFulfilment!.receiptConfirmedAt!
                ).toLocaleDateString()}.`
              : myDelivered
              ? `You marked these services delivered on ${new Date(
                  myFulfilment!.deliveredMarkedAt!
                ).toLocaleDateString()}. Waiting for ${agreement.counterparty.displayName} to inspect and confirm receipt.`
              : `Work on your services according to the contract scope. Once finished, mark them as delivered.`}
          </p>

          {isAgreementActive && !myDelivered && (
            <Button
              type="button"
              onClick={handleMarkDelivered}
              disabled={isPending}
              className="w-full bg-pine-600 hover:bg-pine-700 text-white text-xs h-9"
            >
              {isPending ? 'Marking Delivered...' : 'Mark My Services Delivered'}
            </Button>
          )}
        </div>

        {/* Track 2: What Counterparty Delivers */}
        <div className="rounded-card border border-border bg-surface-sunken/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
              {agreement.counterparty.displayName}&apos;s Deliverables
            </span>
            {theirConfirmed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-pine-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Received
              </span>
            ) : theirDelivered ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                <Clock className="h-3.5 w-3.5" /> Ready for Review
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Clock className="h-3.5 w-3.5" /> In Progress
              </span>
            )}
          </div>

          <p className="text-xs text-text-secondary">
            {theirConfirmed
              ? `You confirmed receipt of all deliverables on ${new Date(
                  theirFulfilment!.receiptConfirmedAt!
                ).toLocaleDateString()}.`
              : theirDelivered
              ? `${agreement.counterparty.displayName} marked their services delivered on ${new Date(
                  theirFulfilment!.deliveredMarkedAt!
                ).toLocaleDateString()}. Please inspect the work and confirm receipt below.`
              : `${agreement.counterparty.displayName} is working on their deliverables.`}
          </p>

          {isAgreementActive && theirDelivered && !theirConfirmed && (
            <Button
              type="button"
              onClick={handleConfirmReceipt}
              disabled={isPending}
              className="w-full bg-pine-600 hover:bg-pine-700 text-white text-xs h-9"
            >
              {isPending ? 'Confirming...' : 'Confirm Receipt of Services'}
            </Button>
          )}
        </div>
      </div>

      {/* Auxiliary actions: Cancellation and Dispute */}
      {isAgreementActive && (
        <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          <span>Need to make changes or facing an impasse?</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              className="text-text-secondary hover:text-amber-800 transition-colors underline decoration-dotted"
            >
              Request Mutual Cancellation
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => setIsDisputeModalOpen(true)}
              className="text-amber-800 hover:text-amber-900 transition-colors flex items-center gap-1 font-medium"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Report Dispute
            </button>
          </div>
        </div>
      )}

      <CancellationModal
        agreementId={agreement.id}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        mode="request"
        counterpartyName={agreement.counterparty.displayName}
      />

      <DisputeModal
        agreementId={agreement.id}
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        counterpartyName={agreement.counterparty.displayName}
      />
    </div>
  );
}

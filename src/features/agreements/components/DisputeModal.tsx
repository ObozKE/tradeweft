'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { openDisputeAction } from '../actions/agreement.actions';
import { AlertCircle, X, ShieldAlert } from 'lucide-react';

interface DisputeModalProps {
  agreementId: string;
  isOpen: boolean;
  onClose: () => void;
  counterpartyName: string;
}

export function DisputeModal({
  agreementId,
  isOpen,
  onClose,
  counterpartyName,
}: DisputeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (reason.trim().length < 5) {
      setErrorMsg('Please describe the issue in detail (at least 5 characters).');
      return;
    }

    startTransition(async () => {
      const res = await openDisputeAction(agreementId, reason.trim());
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispute-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-surface rounded-card border border-border shadow-elevation-3 p-6 text-start space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0" />
            <h2 id="dispute-title" className="text-lg font-bold tracking-tight text-ink">
              Open Formal Dispute
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-ink hover:bg-surface-sunken transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-card border border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
            Important Notice
          </p>
          <p>
            Opening a formal dispute pauses all milestones on this agreement and freezes status into disputed.
            Your statement will be immutably recorded in the trade audit log for marketplace mediator review.
          </p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dispute-reason" className="text-xs font-semibold text-ink">
              Dispute Statement & Scope Discrepancy *
            </Label>
            <Textarea
              id="dispute-reason"
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value.slice(0, 1000))}
              placeholder={`Describe how agreed terms were not honored by ${counterpartyName}...`}
              className="h-32 text-xs"
              maxLength={1000}
              required
            />
            <p className="text-[11px] text-text-muted text-end">{reason.length}/1000 chars</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || reason.trim().length < 5}
              className="bg-amber-700 hover:bg-amber-800 text-white min-w-[140px]"
            >
              {isPending ? 'Submitting...' : 'Open Dispute'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

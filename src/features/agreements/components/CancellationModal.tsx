'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestCancellationAction, acceptCancellationAction } from '../actions/agreement.actions';
import { AlertCircle, X, AlertTriangle } from 'lucide-react';

interface CancellationModalProps {
  agreementId: string;
  isOpen: boolean;
  onClose: () => void;
  mode: 'request' | 'accept';
  counterpartyName: string;
  cancellationReason?: string | null;
}

export function CancellationModal({
  agreementId,
  isOpen,
  onClose,
  mode,
  counterpartyName,
  cancellationReason,
}: CancellationModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      let res;
      if (mode === 'accept') {
        res = await acceptCancellationAction(agreementId);
      } else {
        if (reason.trim().length < 5) {
          setErrorMsg('Please provide a reason of at least 5 characters explaining why you need to cancel.');
          return;
        }
        res = await requestCancellationAction(agreementId, reason.trim());
      }

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
      aria-labelledby="cancellation-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-surface rounded-card border border-border shadow-elevation-3 p-6 text-start space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
            <h2 id="cancellation-title" className="text-lg font-bold tracking-tight text-ink">
              {mode === 'accept' ? 'Accept Mutual Cancellation' : 'Request Mutual Cancellation'}
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
          {mode === 'accept' ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                <strong className="text-ink">{counterpartyName}</strong> has requested to mutually cancel this agreement.
              </p>
              {cancellationReason && (
                <div className="p-3 rounded-button border border-border bg-surface-sunken text-xs text-ink italic">
                  &ldquo;{cancellationReason}&rdquo;
                </div>
              )}
              <p className="text-xs text-text-muted">
                Accepting this request will mark the agreement cancelled immediately. Neither party will be held liable for unfinished deliverables.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Mutual cancellation requires confirmation from <strong className="text-ink">{counterpartyName}</strong>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason" className="text-xs font-semibold text-ink">
                  Reason for Cancellation *
                </Label>
                <Textarea
                  id="cancel-reason"
                  value={reason}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value.slice(0, 500))}
                  placeholder="Explain why you are requesting mutual cancellation..."
                  className="h-24 text-xs"
                  maxLength={500}
                  required
                />
                <p className="text-[11px] text-text-muted text-end">{reason.length}/500 chars</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Keep Agreement
            </Button>
            <Button
              type="submit"
              disabled={isPending || (mode === 'request' && reason.trim().length < 5)}
              className="bg-amber-700 hover:bg-amber-800 text-white min-w-[140px]"
            >
              {isPending
                ? 'Processing...'
                : mode === 'accept'
                ? 'Accept & Cancel'
                : 'Send Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

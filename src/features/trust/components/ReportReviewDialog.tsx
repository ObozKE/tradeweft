'use client';

import React, { useState, useTransition } from 'react';
import { Flag, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { reportReviewAction } from '../actions/review.actions';
import type { ReportReason } from '../types/trust.types';

interface ReportReviewDialogProps {
  reviewId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'harassment',
    label: 'Harassment or Abuse',
    description: 'Threatening language, personal insults, or abusive behavior.',
  },
  {
    value: 'spam',
    label: 'Spam or Advertising',
    description: 'Promotional content, repeated junk, or unauthorized solicitation.',
  },
  {
    value: 'extortion',
    label: 'Extortion / Retaliation',
    description: 'Threats to alter or post negative feedback to force extra work or terms.',
  },
  {
    value: 'false_claim',
    label: 'Factual Misrepresentation',
    description: 'Claims contradicted by verifiable barter contract terms or messages.',
  },
  {
    value: 'pii_leak',
    label: 'Personal Information Leak (PII)',
    description: 'Reveals private phone numbers, home addresses, or financial data.',
  },
  {
    value: 'other',
    label: 'Other Policy Violation',
    description: 'Violates general Trade Weft marketplace guidelines.',
  },
];

export function ReportReviewDialog({
  reviewId,
  isOpen,
  onClose,
  onSuccess,
}: ReportReviewDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append('reviewId', reviewId);
    formData.append('reason', reason);
    if (details.trim()) {
      formData.append('details', details);
    }

    startTransition(async () => {
      const result = await reportReviewAction(null, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-text-muted hover:text-ink hover:bg-surface-sunken"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Flag className="h-5 w-5 text-amber-700" aria-hidden="true" />
          <h2 id="report-dialog-title" className="text-lg font-semibold text-ink">
            Report Review
          </h2>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Reports are handled by Trade Weft moderation staff according to platform integrity standards.
        </p>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 mb-4 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="rounded-lg bg-pine-50 border border-pine-300 p-6 text-center text-pine-900 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-pine-600 mx-auto" />
            <h3 className="font-semibold text-sm">Report Received</h3>
            <p className="text-xs text-pine-800">
              Our moderation team will review this report. Thank you for protecting community trust.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                Reason for Report
              </label>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'bg-amber-50 border-amber-300 text-amber-950 ring-1 ring-amber-300'
                      : 'bg-surface border-border text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-0.5 text-pine-600 focus:ring-pine-600"
                  />
                  <div>
                    <span className="font-semibold block">{r.label}</span>
                    <span className="text-[11px] text-text-muted">{r.description}</span>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="reportDetails" className="block text-xs font-medium text-ink">
                  Additional Details (Optional)
                </label>
                <span className="text-[11px] text-text-muted">{details.length}/500</span>
              </div>
              <textarea
                id="reportDetails"
                rows={3}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe why this review violates platform rules..."
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-ink placeholder:text-text-muted focus:border-pine-600 focus:outline-hidden focus:ring-1 focus:ring-pine-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

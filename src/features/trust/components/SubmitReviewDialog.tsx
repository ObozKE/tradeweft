'use client';

import React, { useState, useTransition } from 'react';
import {
  Star,
  ShieldAlert,
  Clock,
  AlertCircle,
  CheckCircle2,
  X,
  Repeat,
} from 'lucide-react';
import { submitReviewAction, editReviewAction } from '../actions/review.actions';
import type { ReviewItem } from '../types/trust.types';

interface SubmitReviewDialogProps {
  agreementId: string;
  counterpartyName?: string | null;
  existingReview?: ReviewItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SubmitReviewDialog({
  agreementId,
  counterpartyName = 'your trading partner',
  existingReview,
  isOpen,
  onClose,
  onSuccess,
}: SubmitReviewDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [overallRating, setOverallRating] = useState<number>(
    existingReview?.overallRating ?? 5
  );
  const [qualityRating, setQualityRating] = useState<number>(
    existingReview?.qualityRating ?? 5
  );
  const [communicationRating, setCommunicationRating] = useState<number>(
    existingReview?.communicationRating ?? 5
  );
  const [timelinessRating, setTimelinessRating] = useState<number>(
    existingReview?.timelinessRating ?? 5
  );
  const [wouldTradeAgain, setWouldTradeAgain] = useState<boolean>(
    existingReview?.wouldTradeAgain ?? true
  );
  const [reviewText, setReviewText] = useState<string>(
    existingReview?.reviewText ?? ''
  );

  if (!isOpen) return null;

  const isEditing = Boolean(existingReview);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData();
    if (isEditing && existingReview) {
      formData.append('reviewId', existingReview.id);
    } else {
      formData.append('agreementId', agreementId);
    }

    formData.append('overallRating', overallRating.toString());
    formData.append('qualityRating', qualityRating.toString());
    formData.append('communicationRating', communicationRating.toString());
    formData.append('timelinessRating', timelinessRating.toString());
    formData.append('wouldTradeAgain', wouldTradeAgain ? 'true' : 'false');
    formData.append('reviewText', reviewText);

    startTransition(async () => {
      const result = isEditing
        ? await editReviewAction(null, formData)
        : await submitReviewAction(null, formData);

      if (result.error) {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      } else {
        setSuccessMessage(
          result.isRevealed
            ? 'Both parties have submitted reviews! Your feedback is now public.'
            : 'Your review has been securely saved. It will remain private until both parties submit or the 14-day window closes.'
        );
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1800);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-text-muted hover:text-ink hover:bg-surface-sunken transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-pine-600" aria-hidden="true" />
          <h2 id="review-dialog-title" className="text-lg font-semibold text-ink">
            {isEditing ? 'Edit Your Review' : `Review ${counterpartyName}`}
          </h2>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Fair, honest feedback powers Africa&apos;s cash-free barter ecosystem.
        </p>

        {/* Double-Blind Callout Notice */}
        <div className="rounded-lg bg-pine-50 border border-pine-200 p-3.5 mb-5 text-xs text-pine-900 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-pine-700 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <strong className="font-semibold">Double-Blind Privacy:</strong> Your review remains completely hidden from {counterpartyName} until both parties submit or the 14-day window expires. You have 1 hour after submitting to edit or withdraw your feedback.
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 mb-4 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage ? (
          <div className="rounded-lg bg-pine-50 border border-pine-300 p-6 text-center text-pine-900 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-pine-600 mx-auto" />
            <h3 className="font-semibold text-sm">Review Recorded!</h3>
            <p className="text-xs text-pine-800">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Overall Rating */}
            <StarRatingInput
              label="Overall Experience"
              value={overallRating}
              onChange={setOverallRating}
              error={fieldErrors.overallRating?.[0]}
            />

            {/* Dimensional Ratings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
              <StarRatingInput
                label="Quality"
                value={qualityRating}
                onChange={setQualityRating}
                compact
              />
              <StarRatingInput
                label="Communication"
                value={communicationRating}
                onChange={setCommunicationRating}
                compact
              />
              <StarRatingInput
                label="Timeliness"
                value={timelinessRating}
                onChange={setTimelinessRating}
                compact
              />
            </div>

            {/* Would Trade Again */}
            <div className="pt-2 border-t border-border">
              <label className="block text-xs font-medium text-ink mb-2">
                Would you trade with this partner again?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWouldTradeAgain(true)}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    wouldTradeAgain
                      ? 'bg-pine-50 text-pine-800 border-pine-600 ring-1 ring-pine-600'
                      : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
                  }`}
                >
                  <Repeat className="h-3.5 w-3.5 text-pine-600" />
                  Yes, definitely
                </button>
                <button
                  type="button"
                  onClick={() => setWouldTradeAgain(false)}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    !wouldTradeAgain
                      ? 'bg-amber-50 text-amber-800 border-amber-600 ring-1 ring-amber-600'
                      : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
                  }`}
                >
                  No, would not
                </button>
              </div>
            </div>

            {/* Review Text */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="reviewText"
                  className="block text-xs font-medium text-ink"
                >
                  Written Feedback (Optional)
                </label>
                <span className="text-[11px] text-text-muted">
                  {reviewText.length}/1000
                </span>
              </div>
              <textarea
                id="reviewText"
                rows={3}
                maxLength={1000}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share specific details about what went well or what could be improved..."
                className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-ink placeholder:text-text-muted focus:border-pine-600 focus:outline-hidden focus:ring-1 focus:ring-pine-600"
              />
              {fieldErrors.reviewText && (
                <p className="text-xs text-amber-700 mt-1">
                  {fieldErrors.reviewText[0]}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 rounded-lg bg-pine-600 text-white text-xs font-semibold hover:bg-pine-700 transition-colors disabled:opacity-50"
              >
                {isPending
                  ? 'Saving...'
                  : isEditing
                  ? 'Update Review'
                  : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StarRatingInput({
  label,
  value,
  onChange,
  error,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  error?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-ink">{label}</label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 hover:scale-110 transition-transform"
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} ${
                star <= value
                  ? 'text-amber-700 fill-amber-700'
                  : 'text-border fill-border'
              }`}
            />
          </button>
        ))}
        {!compact && (
          <span className="text-xs font-medium text-text-secondary ms-2">
            {value} / 5
          </span>
        )}
      </div>
      {error && <p className="text-xs text-amber-700">{error}</p>}
    </div>
  );
}

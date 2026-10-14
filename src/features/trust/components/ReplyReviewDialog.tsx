'use client';

import React, { useState, useTransition } from 'react';
import { CornerDownRight, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { replyReviewAction } from '../actions/review.actions';

interface ReplyReviewDialogProps {
  reviewId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReplyReviewDialog({
  reviewId,
  isOpen,
  onClose,
  onSuccess,
}: ReplyReviewDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append('reviewId', reviewId);
    formData.append('replyText', replyText);

    startTransition(async () => {
      const result = await replyReviewAction(null, formData);
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
      aria-labelledby="reply-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-text-muted hover:text-ink hover:bg-surface-sunken"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <CornerDownRight className="h-5 w-5 text-pine-600" aria-hidden="true" />
          <h2 id="reply-dialog-title" className="text-lg font-semibold text-ink">
            Reply to Review
          </h2>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Your response will be permanently visible under this review on your public profile.
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
            <h3 className="font-semibold text-sm">Response Published</h3>
            <p className="text-xs text-pine-800">Your reply is now live on your profile.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="replyText" className="block text-xs font-medium text-ink">
                  Your Response
                </label>
                <span className="text-[11px] text-text-muted">{replyText.length}/500</span>
              </div>
              <textarea
                id="replyText"
                rows={4}
                required
                maxLength={500}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Thank the client or clarify the trade delivery..."
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
                disabled={isPending || !replyText.trim()}
                className="px-5 py-2 rounded-lg bg-pine-600 text-white text-xs font-semibold hover:bg-pine-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Posting...' : 'Post Reply'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

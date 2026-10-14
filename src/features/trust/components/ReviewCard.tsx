'use client';

import React, { useState } from 'react';
import {
  Star,
  Repeat,
  Flag,
  CornerDownRight,
  User,
  ShieldCheck,
} from 'lucide-react';
import type { ReviewItem } from '../types/trust.types';
import { ReportReviewDialog } from './ReportReviewDialog';
import { ReplyReviewDialog } from './ReplyReviewDialog';

interface ReviewCardProps {
  review: ReviewItem;
  currentUserId?: string;
  isProviderOwner?: boolean;
  className?: string;
}

export function ReviewCard({
  review,
  currentUserId,
  isProviderOwner = false,
  className = '',
}: ReviewCardProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const isOwnReview = currentUserId && review.reviewerId === currentUserId;
  const canReply = isProviderOwner && !review.reply && !isOwnReview;
  const canReport = currentUserId && !isOwnReview;

  const dateFormatted = review.revealedAt
    ? new Date(review.revealedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : new Date(review.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

  return (
    <article
      className={`rounded-xl border border-border bg-surface p-5 shadow-sm transition-all ${className}`}
    >
      {/* Reviewer Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-sunken flex items-center justify-center text-text-secondary overflow-hidden flex-shrink-0">
            {review.reviewerAvatarUrl ? (
              <img
                src={review.reviewerAvatarUrl}
                alt={review.reviewerName || 'Reviewer'}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-text-muted" aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="font-semibold text-sm text-ink flex items-center gap-2">
              <span>{review.reviewerName || 'Verified Partner'}</span>
              {review.reviewerBusinessName && (
                <span className="text-xs text-text-secondary font-normal">
                  ({review.reviewerBusinessName})
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-0.5">{dateFormatted}</div>
          </div>
        </div>

        {/* Rating Stars & Would Trade Again */}
        <div className="flex flex-col items-end gap-1">
          <div
            className="flex items-center gap-0.5"
            aria-label={`Rated ${review.overallRating} out of 5 stars`}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-4 w-4 ${
                  star <= review.overallRating
                    ? 'text-amber-700 fill-amber-700'
                    : 'text-border fill-border'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
          {review.wouldTradeAgain && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pine-700 bg-pine-50 px-2 py-0.5 rounded-chip border border-pine-200">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              Would trade again
            </span>
          )}
        </div>
      </div>

      {/* Review Body */}
      {review.reviewText ? (
        <p className="mt-4 text-sm text-ink leading-relaxed whitespace-pre-line">
          {review.reviewText}
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-text-muted">
          No written feedback provided.
        </p>
      )}

      {/* Dimensional Ratings summary */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-text-secondary pt-3 border-t border-border">
        <span>
          Quality: <strong className="text-ink">{review.qualityRating}/5</strong>
        </span>
        <span className="text-border">•</span>
        <span>
          Communication: <strong className="text-ink">{review.communicationRating}/5</strong>
        </span>
        <span className="text-border">•</span>
        <span>
          Timeliness: <strong className="text-ink">{review.timelinessRating}/5</strong>
        </span>
      </div>

      {/* Public Provider Reply (if present) */}
      {review.reply && (
        <div className="mt-4 ms-4 sm:ms-6 rounded-lg bg-surface-sunken p-4 border-l-2 border-pine-600">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-pine-800">
            <CornerDownRight className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
            <span>Response from Provider</span>
            <span className="text-text-muted font-normal text-[11px] ms-1">
              {new Date(review.reply.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink leading-relaxed whitespace-pre-line">
            {review.reply.replyText}
          </p>
        </div>
      )}

      {/* Action Footer (Reply, Report) */}
      <div className="mt-4 flex items-center justify-end gap-3 pt-2 text-xs">
        {canReply && (
          <button
            type="button"
            onClick={() => setReplyOpen(true)}
            className="text-pine-600 hover:text-pine-700 font-medium hover:underline inline-flex items-center gap-1"
          >
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            Reply to review
          </button>
        )}

        {canReport && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="text-text-muted hover:text-amber-700 inline-flex items-center gap-1 transition-colors"
            title="Report this review for moderation"
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
            <span>Report</span>
          </button>
        )}
      </div>

      {/* Modals */}
      {reportOpen && (
        <ReportReviewDialog
          reviewId={review.id}
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
        />
      )}

      {replyOpen && (
        <ReplyReviewDialog
          reviewId={review.id}
          isOpen={replyOpen}
          onClose={() => setReplyOpen(false)}
        />
      )}
    </article>
  );
}

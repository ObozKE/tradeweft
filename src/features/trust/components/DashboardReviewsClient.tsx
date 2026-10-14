'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Star,
  Clock,
  CheckCircle2,
  AlertCircle,
  Repeat,
  ShieldCheck,
  Edit2,
  Trash2,
  CornerDownRight,
  User,
} from 'lucide-react';
import type { PendingReviewTrade, ReviewItem, ProviderReputationData } from '../types/trust.types';
import { SubmitReviewDialog } from './SubmitReviewDialog';
import { ReviewCard } from './ReviewCard';
import { withdrawReviewAction } from '../actions/review.actions';
import { getRemainingTime, isWindowActive } from '../utils/reputation';

interface DashboardReviewsClientProps {
  currentUserId: string;
  pendingTrades: PendingReviewTrade[];
  writtenReviews: ReviewItem[];
  receivedReviews: ReviewItem[];
  reputation: ProviderReputationData;
  initialTab?: 'to_review' | 'written' | 'received';
}

export function DashboardReviewsClient({
  currentUserId,
  pendingTrades,
  writtenReviews,
  receivedReviews,
  reputation,
  initialTab = 'to_review',
}: DashboardReviewsClientProps) {
  const [activeTab, setActiveTab] = useState<'to_review' | 'written' | 'received'>(initialTab);
  const [selectedTrade, setSelectedTrade] = useState<PendingReviewTrade | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenNewReview = (trade: PendingReviewTrade) => {
    setSelectedTrade(trade);
    setEditingReview(null);
    setReviewModalOpen(true);
  };

  const handleOpenEditReview = (review: ReviewItem) => {
    setEditingReview(review);
    setSelectedTrade(null);
    setReviewModalOpen(true);
  };

  const handleWithdrawReview = (reviewId: string) => {
    if (!confirm('Are you sure you want to withdraw this review? This action cannot be undone.')) {
      return;
    }
    const formData = new FormData();
    formData.append('reviewId', reviewId);
    startTransition(async () => {
      await withdrawReviewAction(null, formData);
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('to_review')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'to_review'
              ? 'border-pine-600 text-pine-700'
              : 'border-transparent text-text-secondary hover:text-ink'
          }`}
        >
          <span>To Review</span>
          <span
            className={`px-2 py-0.5 rounded-chip text-[11px] ${
              activeTab === 'to_review'
                ? 'bg-pine-100 text-pine-800'
                : 'bg-surface-sunken text-text-muted'
            }`}
          >
            {pendingTrades.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('written')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'written'
              ? 'border-pine-600 text-pine-700'
              : 'border-transparent text-text-secondary hover:text-ink'
          }`}
        >
          <span>Written by You</span>
          <span
            className={`px-2 py-0.5 rounded-chip text-[11px] ${
              activeTab === 'written'
                ? 'bg-pine-100 text-pine-800'
                : 'bg-surface-sunken text-text-muted'
            }`}
          >
            {writtenReviews.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('received')}
          className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'received'
              ? 'border-pine-600 text-pine-700'
              : 'border-transparent text-text-secondary hover:text-ink'
          }`}
        >
          <span>Received from Partners</span>
          <span
            className={`px-2 py-0.5 rounded-chip text-[11px] ${
              activeTab === 'received'
                ? 'bg-pine-100 text-pine-800'
                : 'bg-surface-sunken text-text-muted'
            }`}
          >
            {receivedReviews.length}
          </span>
        </button>
      </div>

      {/* Tab 1: To Review */}
      {activeTab === 'to_review' && (
        <div className="space-y-4">
          {pendingTrades.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">
              <CheckCircle2 className="h-8 w-8 text-pine-600 mx-auto mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">All Caught Up!</h3>
              <p className="text-xs text-text-secondary mt-1">
                You have no completed barter trades awaiting your review.
              </p>
            </div>
          ) : (
            pendingTrades.map((trade) => {
              const remaining = getRemainingTime(trade.reviewWindowEndsAt);

              return (
                <div
                  key={trade.agreementId}
                  className="rounded-xl border border-border bg-surface p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-surface-sunken flex items-center justify-center text-text-secondary overflow-hidden">
                      {trade.counterpartyAvatarUrl ? (
                        <img
                          src={trade.counterpartyAvatarUrl}
                          alt={trade.counterpartyName || 'Partner'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-text-muted" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-ink">
                        {trade.counterpartyName || 'Trading Partner'}
                        {trade.counterpartyBusinessName && (
                          <span className="text-xs text-text-secondary font-normal ms-1">
                            ({trade.counterpartyBusinessName})
                          </span>
                        )}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                        <span>
                          Completed{' '}
                          {new Date(trade.completedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded-chip border border-amber-200">
                          <Clock className="h-3 w-3" />
                          {remaining.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenNewReview(trade)}
                      className="px-4 py-2 rounded-lg bg-pine-600 text-white text-xs font-semibold hover:bg-pine-700 transition-colors shadow-xs"
                    >
                      Write Review
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Written by You */}
      {activeTab === 'written' && (
        <div className="space-y-4">
          {writtenReviews.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">
              <Star className="h-8 w-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">No Reviews Written Yet</h3>
              <p className="text-xs text-text-secondary mt-1">
                Reviews you write for completed trade agreements will appear here.
              </p>
            </div>
          ) : (
            writtenReviews.map((review) => {
              const isPendingReveal = review.status === 'pending';
              const isEditable = isPendingReveal && isWindowActive(review.editableUntil);
              const remainingEdit = getRemainingTime(review.editableUntil);

              return (
                <div
                  key={review.id}
                  className="rounded-xl border border-border bg-surface p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          Review for Partner
                        </span>
                        {isPendingReveal ? (
                          <span className="px-2 py-0.5 rounded-chip text-[11px] font-medium bg-pine-50 text-pine-800 border border-pine-200">
                            Double-Blind (Hidden until reveal)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-chip text-[11px] font-medium bg-surface-sunken text-text-secondary border border-border">
                            Revealed & Public
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        Submitted on{' '}
                        {new Date(review.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.overallRating
                              ? 'text-amber-700 fill-amber-700'
                              : 'text-border fill-border'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {review.reviewText && (
                    <p className="text-xs text-ink whitespace-pre-line bg-surface-sunken p-3 rounded-lg">
                      {review.reviewText}
                    </p>
                  )}

                  {/* 1-Hour Grace Period Actions */}
                  {isEditable && (
                    <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                      <span className="text-amber-800 flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        Edit/Withdraw grace period: {remainingEdit.text}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditReview(review)}
                          className="px-3 py-1 rounded-md border border-border text-xs font-medium text-ink hover:bg-surface-sunken inline-flex items-center gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWithdrawReview(review.id)}
                          disabled={isPending}
                          className="px-3 py-1 rounded-md border border-amber-300 text-xs font-medium text-amber-800 hover:bg-amber-50 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Withdraw
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Received from Partners */}
      {activeTab === 'received' && (
        <div className="space-y-4">
          {receivedReviews.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">
              <Star className="h-8 w-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">No Public Reviews Yet</h3>
              <p className="text-xs text-text-secondary mt-1">
                Reviews received from trading partners appear here after the double-blind reveal.
              </p>
            </div>
          ) : (
            receivedReviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                currentUserId={currentUserId}
                isProviderOwner={true}
              />
            ))
          )}
        </div>
      )}

      {/* Dialog for Submit / Edit Review */}
      {reviewModalOpen && (
        <SubmitReviewDialog
          agreementId={selectedTrade?.agreementId || editingReview?.agreementId || ''}
          counterpartyName={selectedTrade?.counterpartyName}
          existingReview={editingReview}
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

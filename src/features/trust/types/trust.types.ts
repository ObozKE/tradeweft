import type {
  ReviewStatus,
  ReportReason,
  ReportStatus,
  ReputationTier,
} from '@/lib/supabase/database.types';

export type { ReviewStatus, ReportReason, ReportStatus, ReputationTier };

export interface ReviewReplyItem {
  id: string;
  reviewId: string;
  authorId: string;
  authorName?: string | null;
  authorBusinessName?: string | null;
  authorAvatarUrl?: string | null;
  replyText: string;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  agreementId: string;
  reviewerId: string;
  reviewerName?: string | null;
  reviewerBusinessName?: string | null;
  reviewerAvatarUrl?: string | null;
  revieweeId: string;
  overallRating: number;
  qualityRating: number;
  communicationRating: number;
  timelinessRating: number;
  wouldTradeAgain: boolean;
  reviewText: string | null;
  status: ReviewStatus;
  reviewWindowEndsAt: string;
  editableUntil: string;
  revealedAt: string | null;
  createdAt: string;
  reply?: ReviewReplyItem | null;
}

export interface ProviderReputationData {
  providerId: string;
  score: number;
  tier: ReputationTier;
  completedTradesCount: number;
  distinctPartnersCount: number;
  avgOverallRating: number | null;
  wouldTradeAgainPct: number | null;
  avgQualityRating: number | null;
  avgCommunicationRating: number | null;
  avgTimelinessRating: number | null;
  isScoreVisible: boolean;
  calculationVersion: number;
  lastComputedAt: string;
}

export interface LedgerEntryItem {
  id: string;
  agreementId: string;
  providerId: string;
  counterpartyId: string;
  counterpartyName: string | null;
  counterpartyBusinessName: string | null;
  contractRef: string;
  countryCode: string;
  tradeTermsVersion: string;
  termsHash: string;
  completedAt: string;
  createdAt: string;
}

import type { ProviderVerificationAggregateStatus } from '@/lib/supabase/database.types';

export interface PublicProviderProfileData {
  id: string;
  displayName: string | null;
  businessName: string | null;
  avatarUrl: string | null;
  cityId: string | null;
  cityName: string | null;
  areaId: string | null;
  areaName: string | null;
  memberSince: string;
  reputation: ProviderReputationData;
  verification?: {
    status: ProviderVerificationAggregateStatus;
    verifiedLinkCount: number;
    verifiedSince: string | null;
  };
}

export interface PendingReviewTrade {
  agreementId: string;
  counterpartyId: string;
  counterpartyName: string | null;
  counterpartyBusinessName: string | null;
  counterpartyAvatarUrl: string | null;
  completedAt: string;
  reviewWindowEndsAt: string;
  myReview: ReviewItem | null;
  counterpartySubmitted: boolean;
}

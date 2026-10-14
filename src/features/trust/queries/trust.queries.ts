import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { FALLBACK_LOCATIONS } from '@/features/onboarding/data/locations.constants';
import type {
  PublicProviderProfileData,
  ReviewItem,
  LedgerEntryItem,
  PendingReviewTrade,
} from '../types/trust.types';

/**
 * Fetches public provider profile information with reputation scores and location details.
 */
export async function getProviderProfileData(
  providerId: string
): Promise<PublicProviderProfileData | null> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('public_provider_profiles')
    .select('*')
    .eq('id', providerId)
    .single();

  if (error || !profile) {
    if (error && error.code !== 'PGRST116') {
      logger.error({ error: error.message, providerId, event: 'trust.provider_fetch_failed' });
    }
    return null;
  }

  // Fetch location names
  let cityName: string | null = null;
  let areaName: string | null = null;

  if (profile.city_id) {
    const { data: cityLoc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', profile.city_id)
      .single();
    cityName = cityLoc?.name || FALLBACK_LOCATIONS.find((l) => l.id === profile.city_id)?.name || null;
  }

  if (profile.area_id) {
    const { data: areaLoc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', profile.area_id)
      .single();
    areaName = areaLoc?.name || FALLBACK_LOCATIONS.find((l) => l.id === profile.area_id)?.name || null;
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    businessName: profile.business_name,
    avatarUrl: profile.avatar_url,
    cityId: profile.city_id,
    cityName,
    areaId: profile.area_id,
    areaName,
    memberSince: profile.member_since || new Date().toISOString(),
    reputation: {
      providerId: profile.id,
      score: profile.reliability_score ?? 80,
      tier: profile.reputation_tier ?? 'new',
      completedTradesCount: profile.completed_trades_count ?? 0,
      distinctPartnersCount: profile.distinct_partners_count ?? 0,
      avgOverallRating: profile.avg_overall_rating,
      wouldTradeAgainPct: profile.would_trade_again_pct,
      avgQualityRating: profile.avg_quality_rating,
      avgCommunicationRating: profile.avg_communication_rating,
      avgTimelinessRating: profile.avg_timeliness_rating,
      isScoreVisible: profile.is_score_visible ?? false,
      calculationVersion: 1,
      lastComputedAt: new Date().toISOString(),
    },
    verification: {
      status: profile.verification_status ?? 'none',
      verifiedLinkCount: profile.verified_link_count ?? 0,
      verifiedSince: profile.verified_since ?? null,
    },
  };
}

/**
 * Queries public verified external portfolio links for a provider.
 */
export async function getPublicVerifiedPortfolioLinks(providerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('public_verified_portfolio_links')
    .select('*')
    .eq('user_id', providerId)
    .order('verified_at', { ascending: false });

  if (error) {
    logger.error({ error: error.message, providerId, event: 'verification.public_links_fetch_failed' });
    return [];
  }

  return data || [];
}


/**
 * Keyset-paginated query for public revealed reviews of a provider.
 */
export async function getProviderReviewsKeyset({
  providerId,
  limit = 10,
  cursorCreatedAt,
  cursorId,
}: {
  providerId: string;
  limit?: number;
  cursorCreatedAt?: string;
  cursorId?: string;
}): Promise<{ reviews: ReviewItem[]; nextCursor: { createdAt: string; id: string } | null }> {
  const supabase = await createClient();

  let query = supabase
    .from('reviews')
    .select(`
      id,
      agreement_id,
      reviewer_id,
      reviewee_id,
      overall_rating,
      quality_rating,
      communication_rating,
      timeliness_rating,
      would_trade_again,
      review_text,
      status,
      review_window_ends_at,
      editable_until,
      revealed_at,
      created_at,
      reviewer:profiles!reviews_reviewer_id_fkey (
        display_name,
        business_name,
        avatar_url
      ),
      review_replies (
        id,
        author_id,
        reply_text,
        created_at
      )
    `)
    .eq('reviewee_id', providerId)
    .eq('status', 'revealed')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursorCreatedAt && cursorId) {
    // Keyset filter: (created_at, id) < (cursorCreatedAt, cursorId)
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
  }

  const { data, error } = await query;
  if (error || !data) {
    logger.error({ error: error?.message, providerId, event: 'trust.reviews_fetch_failed' });
    return { reviews: [], nextCursor: null };
  }

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;

  const reviews: ReviewItem[] = items.map((r: any) => {
    const reviewer = r.reviewer;
    const replyData = Array.isArray(r.review_replies) && r.review_replies.length > 0 ? r.review_replies[0] : null;

    return {
      id: r.id,
      agreementId: r.agreement_id,
      reviewerId: r.reviewer_id,
      reviewerName: reviewer?.display_name || 'Anonymous Member',
      reviewerBusinessName: reviewer?.business_name || null,
      reviewerAvatarUrl: reviewer?.avatar_url || null,
      revieweeId: r.reviewee_id,
      overallRating: r.overall_rating,
      qualityRating: r.quality_rating,
      communicationRating: r.communication_rating,
      timelinessRating: r.timeliness_rating,
      wouldTradeAgain: r.would_trade_again,
      reviewText: r.review_text,
      status: r.status,
      reviewWindowEndsAt: r.review_window_ends_at,
      editableUntil: r.editable_until,
      revealedAt: r.revealed_at,
      createdAt: r.created_at,
      reply: replyData
        ? {
            id: replyData.id,
            reviewId: r.id,
            authorId: replyData.author_id,
            replyText: replyData.reply_text,
            createdAt: replyData.created_at,
          }
        : null,
    };
  });

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? {
          createdAt: lastItem.created_at,
          id: lastItem.id,
        }
      : null;

  return { reviews, nextCursor };
}

/**
 * Keyset-paginated query for public ledger entries of a provider.
 */
export async function getProviderLedgerKeyset({
  providerId,
  limit = 10,
  cursorCompletedAt,
  cursorId,
}: {
  providerId: string;
  limit?: number;
  cursorCompletedAt?: string;
  cursorId?: string;
}): Promise<{ entries: LedgerEntryItem[]; nextCursor: { completedAt: string; id: string } | null }> {
  const supabase = await createClient();

  let query = supabase
    .from('ledger_entries')
    .select(`
      id,
      agreement_id,
      provider_id,
      counterparty_id,
      contract_ref,
      country_code,
      trade_terms_version,
      terms_hash,
      completed_at,
      created_at,
      counterparty:profiles!ledger_entries_counterparty_id_fkey (
        display_name,
        business_name
      )
    `)
    .eq('provider_id', providerId)
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursorCompletedAt && cursorId) {
    query = query.or(
      `completed_at.lt.${cursorCompletedAt},and(completed_at.eq.${cursorCompletedAt},id.lt.${cursorId})`
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    logger.error({ error: error?.message, providerId, event: 'trust.ledger_fetch_failed' });
    return { entries: [], nextCursor: null };
  }

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;

  const entries: LedgerEntryItem[] = items.map((e: any) => {
    const cp = e.counterparty;
    return {
      id: e.id,
      agreementId: e.agreement_id,
      providerId: e.provider_id,
      counterpartyId: e.counterparty_id,
      counterpartyName: cp?.display_name || 'Trading Partner',
      counterpartyBusinessName: cp?.business_name || null,
      contractRef: e.contract_ref,
      countryCode: e.country_code,
      tradeTermsVersion: e.trade_terms_version,
      termsHash: e.terms_hash,
      completedAt: e.completed_at,
      createdAt: e.created_at,
    };
  });

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? {
          completedAt: lastItem.completed_at,
          id: lastItem.id,
        }
      : null;

  return { entries, nextCursor };
}

/**
 * Fetches dashboard reviews for the authenticated user:
 * 1. Pending trades where user can write a review.
 * 2. Reviews written by user.
 * 3. Reviews received by user (revealed).
 */
export async function getUserDashboardReviews(userId: string) {
  const supabase = await createClient();

  // 1. Fetch completed agreements from last 14 days where user is a participant
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completedAgreements } = await supabase
    .from('agreements')
    .select(`
      id,
      proposer_id,
      recipient_id,
      completed_at,
      proposer:profiles!agreements_proposer_id_fkey(id, display_name, business_name, avatar_url),
      recipient:profiles!agreements_recipient_id_fkey(id, display_name, business_name, avatar_url)
    `)
    .eq('status', 'completed')
    .or(`proposer_id.eq.${userId},recipient_id.eq.${userId}`)
    .gte('completed_at', fourteenDaysAgo)
    .order('completed_at', { ascending: false });

  // 2. Fetch all reviews authored by or directed to the user
  const { data: myReviews } = await supabase
    .from('reviews')
    .select(`
      id,
      agreement_id,
      reviewer_id,
      reviewee_id,
      overall_rating,
      quality_rating,
      communication_rating,
      timeliness_rating,
      would_trade_again,
      review_text,
      status,
      review_window_ends_at,
      editable_until,
      revealed_at,
      created_at,
      reviewee:profiles!reviews_reviewee_id_fkey(id, display_name, business_name, avatar_url)
    `)
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false });

  const { data: receivedReviews } = await supabase
    .from('reviews')
    .select(`
      id,
      agreement_id,
      reviewer_id,
      reviewee_id,
      overall_rating,
      quality_rating,
      communication_rating,
      timeliness_rating,
      would_trade_again,
      review_text,
      status,
      review_window_ends_at,
      editable_until,
      revealed_at,
      created_at,
      reviewer:profiles!reviews_reviewer_id_fkey(id, display_name, business_name, avatar_url),
      review_replies(
        id,
        author_id,
        reply_text,
        created_at
      )
    `)
    .eq('reviewee_id', userId)
    .eq('status', 'revealed')
    .order('created_at', { ascending: false });

  // 3. Construct "To Review" list
  const writtenAgreementIds = new Set((myReviews || []).map((r) => r.agreement_id));

  const pendingTrades: PendingReviewTrade[] = [];

  for (const ag of completedAgreements || []) {
    const isProposer = ag.proposer_id === userId;
    const cp = isProposer ? (ag.recipient as any) : (ag.proposer as any);
    const existingReview = (myReviews || []).find((r) => r.agreement_id === ag.id);

    // Only include if review is not yet written, or if still pending/editable
    if (!existingReview || existingReview.status === 'pending') {
      const endsAt = new Date(
        new Date(ag.completed_at!).getTime() + 14 * 24 * 60 * 60 * 1000
      ).toISOString();

      pendingTrades.push({
        agreementId: ag.id,
        counterpartyId: cp?.id,
        counterpartyName: cp?.display_name || 'Trading Partner',
        counterpartyBusinessName: cp?.business_name || null,
        counterpartyAvatarUrl: cp?.avatar_url || null,
        completedAt: ag.completed_at!,
        reviewWindowEndsAt: endsAt,
        myReview: existingReview ? (existingReview as any) : null,
        counterpartySubmitted: false,
      });
    }
  }

  return {
    pendingTrades,
    writtenReviews: (myReviews || []) as any[],
    receivedReviews: (receivedReviews || []).map((r: any) => ({
      ...r,
      reply: Array.isArray(r.review_replies) && r.review_replies.length > 0 ? r.review_replies[0] : null,
    })) as any[],
  };
}

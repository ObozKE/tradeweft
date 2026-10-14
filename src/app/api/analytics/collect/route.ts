import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// Bot User-Agent pattern to filter crawlers and scrapers
const BOT_REGEX =
  /(bot|spider|crawl|slurp|duckduckbot|baiduspider|yandex|headless|curl|wget|python-requests|googlebot|bingbot|facebookexternalhit|whatsapp|preview)/i;

// In-memory 1-hour session deduplication LRU cache
const recentEventsCache = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function pruneOldDeduplicationEntries() {
  const now = Date.now();
  for (const [key, timestamp] of recentEventsCache.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentEventsCache.delete(key);
    }
  }
}

const analyticsBeaconSchema = z.object({
  eventType: z.enum([
    'package_view',
    'package_impression',
    'proposal_start',
    'promo_impression',
    'promo_click',
  ]),
  packageId: z.string().uuid().optional(),
  promotionId: z.string().uuid().optional(),
  sessionKey: z.string().min(4).max(64).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Bot Filtering
  const userAgent = req.headers.get('user-agent') || '';
  if (BOT_REGEX.test(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  // 2. Parse & Validate Payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = analyticsBeaconSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { eventType, packageId, promotionId, sessionKey } = parsed.data;

  // Validate presence of corresponding target
  if (
    ['package_view', 'package_impression', 'proposal_start'].includes(eventType) &&
    !packageId
  ) {
    return NextResponse.json({ error: 'packageId is required for package events' }, { status: 400 });
  }

  if (
    ['promo_impression', 'promo_click'].includes(eventType) &&
    !promotionId
  ) {
    return NextResponse.json({ error: 'promotionId is required for promotion events' }, { status: 400 });
  }

  // 3. 1-Hour Session Deduplication (views, clicks, and proposal starts)
  const targetId = packageId || promotionId || 'anon';
  const dedupKey = `${sessionKey || 'guest'}:${eventType}:${targetId}`;
  const now = Date.now();

  if (['package_view', 'promo_click', 'proposal_start'].includes(eventType)) {
    const lastSeen = recentEventsCache.get(dedupKey);
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
      // Deduplicated within window, ignore duplicate count
      return new NextResponse(null, { status: 204 });
    }
    recentEventsCache.set(dedupKey, now);

    // Periodically prune
    if (recentEventsCache.size > 10000) {
      pruneOldDeduplicationEntries();
    }
  }

  // 4. Atomic Database Aggregation
  const adminSupabase = createAdminClient();

  try {
    if (packageId) {
      const impressions = eventType === 'package_impression' ? 1 : 0;
      const views = eventType === 'package_view' ? 1 : 0;
      const proposalStarts = eventType === 'proposal_start' ? 1 : 0;

      await adminSupabase.rpc('record_package_analytics', {
        p_package_id: packageId,
        p_impressions: impressions,
        p_views: views,
        p_proposal_starts: proposalStarts,
      });
    }

    if (promotionId) {
      const impressions = eventType === 'promo_impression' ? 1 : 0;
      const clicks = eventType === 'promo_click' ? 1 : 0;

      await adminSupabase.rpc('record_promotion_analytics', {
        p_promotion_id: promotionId,
        p_impressions: impressions,
        p_clicks: clicks,
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    logger.error(
      { error: err?.message, eventType, targetId, event: 'analytics.collect_error' },
      'Failed to record analytics beacon'
    );
    return NextResponse.json({ error: 'Failed to record analytics' }, { status: 500 });
  }
}

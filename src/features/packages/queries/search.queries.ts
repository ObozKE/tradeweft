import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { decodeCursor, encodeCursor, type KeysetCursor } from '../utils/cursor';
import type { PackageSearchParams } from '../schemas/search.schema';

export interface SearchResultItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  delivery_mode: 'in_person' | 'remote' | 'hybrid';
  country_code: string;
  city_id: string | null;
  city_name: string | null;
  area_id: string | null;
  area_name: string | null;
  turnaround_days: number;
  capacity_per_month: number | null;
  indicative_value_minor: number | null;
  currency_code: string;
  deliverables: string[];
  exclusions: string[];
  seeking_categories: Array<{ category_id: string; slug: string; name: string }>;
  provider_id: string;
  provider_display_name: string | null;
  provider_business_name: string | null;
  provider_avatar_url: string | null;
  provider_member_since: string | null;
  published_at: string;
  provider_reliability_score?: number | null;
  provider_reputation_tier?: 'new' | 'building' | 'established' | null;
  provider_score_visible?: boolean | null;
  provider_distinct_partners?: number | null;
  is_promoted?: boolean;
  promoted_slot?: number | null;
  rank_ts?: string;
}

export interface SearchResponse {
  items: SearchResultItem[];
  promotedItems?: SearchResultItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export async function searchPackages(
  params: PackageSearchParams,
  locale: string = 'en',
  excludeProviderId?: string
): Promise<SearchResponse> {
  const supabase = await createClient();

  // Decode keyset cursor if supplied
  const decodedCursor: KeysetCursor | null = decodeCursor(params.cursor);

  const { data, error } = await supabase.rpc('search_service_packages', {
    p_country_code: params.country || 'KE',
    p_locale: locale,
    p_city_id: params.city || null,
    p_area_id: params.area || null,
    p_category_id: params.category || null,
    p_seeking_category_id: params.seeking || null,
    p_delivery_mode: params.mode || null,
    p_query: params.q || null,
    p_cursor_published_at: decodedCursor?.rankTs || decodedCursor?.publishedAt || null,
    p_cursor_id: decodedCursor?.id || null,
    p_page_size: 20,
  });

  if (error) {
    logger.warn({ error: error.message, event: 'packages.search_rpc_failed_fallback' });

    // Fallback: direct PostgREST query on published packages
    let q = supabase
      .from('service_packages')
      .select(`
        id,
        title,
        summary,
        category_id,
        delivery_mode,
        country_code,
        city_id,
        area_id,
        turnaround_days,
        capacity_per_month,
        indicative_value_minor,
        currency_code,
        deliverables,
        exclusions,
        provider_id,
        published_at,
        category:service_categories!service_packages_category_id_fkey (
          id,
          slug,
          service_category_translations (
            name,
            locale
          )
        ),
        provider:public_provider_profiles!service_packages_provider_id_fkey (
          id,
          display_name,
          business_name,
          avatar_url,
          member_since
        ),
        city:locations!service_packages_city_id_fkey (name),
        area:locations!service_packages_area_id_fkey (name),
        service_package_seeking_categories (
          category:service_categories (
            id,
            slug,
            service_category_translations (
              name,
              locale
            )
          )
        )
      `)
      .eq('status', 'published')
      .eq('country_code', params.country || 'KE')
      .order('published_at', { ascending: false })
      .limit(21);

    if (params.city) q = q.eq('city_id', params.city);
    if (params.area) q = q.eq('area_id', params.area);
    if (params.category) q = q.eq('category_id', params.category);
    if (params.mode) q = q.eq('delivery_mode', params.mode);
    if (params.q) q = q.ilike('title', `%${params.q}%`);
    if (excludeProviderId) q = q.neq('provider_id', excludeProviderId);

    const { data: fallbackData, error: fallbackError } = await q;

    if (fallbackError || !fallbackData || fallbackData.length === 0) {
      return { items: [], nextCursor: null, hasNextPage: false };
    }

    const hasNext = fallbackData.length > 20;
    const rawItems = hasNext ? fallbackData.slice(0, 20) : fallbackData;

    const items: SearchResultItem[] = (rawItems as any[]).map((row: any) => {
      const catTrans = row.category?.service_category_translations?.find(
        (t: any) => t.locale === locale
      ) || row.category?.service_category_translations?.[0];
      const categoryName = catTrans?.name || row.category?.slug || 'Services';

      const seeking = (row.service_package_seeking_categories || []).map((sc: any) => {
        const scTrans = sc.category?.service_category_translations?.find(
          (t: any) => t.locale === locale
        ) || sc.category?.service_category_translations?.[0];
        return {
          category_id: sc.category?.id || '',
          slug: sc.category?.slug || '',
          name: scTrans?.name || sc.category?.slug || '',
        };
      });

      return {
        id: row.id,
        slug: row.title
          ? row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : 'service',
        title: row.title,
        summary: row.summary,
        category_id: row.category_id,
        category_slug: row.category?.slug || '',
        category_name: categoryName,
        delivery_mode: row.delivery_mode,
        country_code: row.country_code,
        city_id: row.city_id,
        city_name: row.city?.name || null,
        area_id: row.area_id,
        area_name: row.area?.name || null,
        turnaround_days: row.turnaround_days,
        capacity_per_month: row.capacity_per_month,
        indicative_value_minor: row.indicative_value_minor ? Number(row.indicative_value_minor) : null,
        currency_code: row.currency_code,
        deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
        exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
        seeking_categories: seeking,
        provider_id: row.provider_id,
        provider_display_name: row.provider?.display_name || 'Verified Provider',
        provider_business_name: row.provider?.business_name || null,
        provider_avatar_url: row.provider?.avatar_url || null,
        provider_member_since: row.provider?.member_since || null,
        published_at: row.published_at,
      };
    });

    return {
      items,
      nextCursor: null,
      hasNextPage: hasNext,
    };
  }

  if (!data || data.length === 0) {
    return { items: [], nextCursor: null, hasNextPage: false };
  }

  const filteredData = excludeProviderId
    ? (data as any[]).filter((row: any) => row.provider_id !== excludeProviderId)
    : data;

  const hasNextPage = Boolean(data[data.length - 1]?.has_next_page);
  const allItems: SearchResultItem[] = (filteredData as any[]).map((row: any) => ({
    id: row.id,
    slug: row.title
      ? row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'service',
    title: row.title,
    summary: row.summary,
    category_id: row.category_id,
    category_slug: row.category_slug,
    category_name: row.category_name,
    delivery_mode: row.delivery_mode,
    country_code: row.country_code,
    city_id: row.city_id,
    city_name: row.city_name,
    area_id: row.area_id,
    area_name: row.area_name,
    turnaround_days: row.turnaround_days,
    capacity_per_month: row.capacity_per_month,
    indicative_value_minor: row.indicative_value_minor ? Number(row.indicative_value_minor) : null,
    currency_code: row.currency_code,
    deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
    exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
    seeking_categories: Array.isArray(row.seeking_categories) ? row.seeking_categories : [],
    provider_id: row.provider_id,
    provider_display_name: row.provider_display_name || 'Verified Provider',
    provider_business_name: row.provider_business_name,
    provider_avatar_url: row.provider_avatar_url,
    provider_member_since: row.provider_member_since,
    published_at: row.published_at,
    is_promoted: Boolean(row.is_promoted),
    promoted_slot: row.promoted_slot ?? null,
    rank_ts: row.rank_ts || row.published_at,
  }));

  await attachProviderReputations(supabase, allItems);

  const promotedItems = allItems.filter((i) => i.is_promoted);
  const organicItems = allItems.filter((i) => !i.is_promoted);

  let nextCursor: string | null = null;
  if (hasNextPage && organicItems.length > 0) {
    const lastItem = organicItems[organicItems.length - 1];
    nextCursor = encodeCursor({
      publishedAt: lastItem.published_at,
      rankTs: lastItem.rank_ts || lastItem.published_at,
      id: lastItem.id,
    });
  }

  return {
    items: organicItems,
    promotedItems: promotedItems.length > 0 ? promotedItems : undefined,
    nextCursor,
    hasNextPage,
  };
}

async function attachProviderReputations(supabase: any, items: SearchResultItem[]) {
  if (items.length === 0) return items;
  const providerIds = Array.from(new Set(items.map((i) => i.provider_id)));
  if (providerIds.length === 0) return items;

  const { data: reputations } = await supabase
    .from('provider_reputation')
    .select('provider_id, score, tier, is_score_visible, distinct_partners_count')
    .in('provider_id', providerIds);

  if (reputations && reputations.length > 0) {
    const repMap = new Map(reputations.map((r: any) => [r.provider_id, r]));
    for (const item of items) {
      const rep: any = repMap.get(item.provider_id);
      if (rep) {
        item.provider_reliability_score = rep.score;
        item.provider_reputation_tier = rep.tier;
        item.provider_score_visible = rep.is_score_visible;
        item.provider_distinct_partners = rep.distinct_partners_count;
      }
    }
  }
  return items;
}


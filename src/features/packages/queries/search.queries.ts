import 'server-only';
import { createClient } from '@/lib/supabase/server';
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
}

export interface SearchResponse {
  items: SearchResultItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export async function searchPackages(
  params: PackageSearchParams,
  locale: string = 'en'
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
    p_cursor_published_at: decodedCursor?.publishedAt || null,
    p_cursor_id: decodedCursor?.id || null,
    p_page_size: 20,
  });

  if (error || !data || data.length === 0) {
    return { items: [], nextCursor: null, hasNextPage: false };
  }

  const hasNextPage = Boolean(data[data.length - 1]?.has_next_page);
  const items: SearchResultItem[] = data.map((row: any) => ({
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
  }));

  let nextCursor: string | null = null;
  if (hasNextPage && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor({
      publishedAt: lastItem.published_at,
      id: lastItem.id,
    });
  }

  return {
    items,
    nextCursor,
    hasNextPage,
  };
}

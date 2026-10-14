import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { FALLBACK_LOCATIONS, type Location } from '@/features/onboarding/data/locations.constants';
import {
  getFallbackCategories,
  FALLBACK_CATEGORIES,
  type CategoryItem,
} from '../data/categories.constants';

export type { CategoryItem };
export { FALLBACK_CATEGORIES };

export interface PackageListItem {
  id: string;
  title: string;
  summary: string;
  status: 'draft' | 'published' | 'paused' | 'archived' | 'removed';
  categoryName: string;
  deliveryMode: 'in_person' | 'remote' | 'hybrid';
  cityName: string | null;
  areaName: string | null;
  turnaroundDays: number;
  indicativeValueMinor: number | null;
  currencyCode: string;
  publishedAt: string | null;
  updatedAt: string;
  versionNumber: number | null;
}

/**
 * Fetches the active category hierarchy with localized names.
 * Falls back to canonical categories if the database is unmigrated or empty.
 */
export async function getCategories(locale: string = 'en'): Promise<CategoryItem[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('service_categories')
      .select(`
        id,
        parent_id,
        slug,
        sort_order,
        is_active,
        service_category_translations (
          locale,
          name
        )
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return getFallbackCategories(locale);
    }

    const items: CategoryItem[] = (data as any[]).map((cat) => {
      const translations =
        (cat.service_category_translations as Array<{ locale: string; name: string }>) || [];
      const translation = translations.find((t) => t.locale === locale) || translations[0];
      return {
        id: cat.id,
        parentId: cat.parent_id,
        slug: cat.slug,
        name: translation?.name || cat.slug,
        sortOrder: cat.sort_order,
      };
    });

    // Structure hierarchically: parents followed immediately by their children
    const roots = items.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const sorted: CategoryItem[] = [];

    for (const root of roots) {
      sorted.push(root);
      const children = items
        .filter((c) => c.parentId === root.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      sorted.push(...children);
    }

    // Append any orphaned items if present
    const rootsAndChildrenIds = new Set(sorted.map((s) => s.id));
    for (const item of items) {
      if (!rootsAndChildrenIds.has(item.id)) {
        sorted.push(item);
      }
    }

    return sorted;
  } catch {
    return getFallbackCategories(locale);
  }
}

/**
 * Fetches all service packages belonging to a provider for the dashboard.
 */
export async function getProviderPackages(providerId: string): Promise<PackageListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('service_packages')
    .select(`
      id,
      title,
      summary,
      status,
      delivery_mode,
      turnaround_days,
      indicative_value_minor,
      currency_code,
      published_at,
      updated_at,
      category_id,
      city_id,
      area_id,
      city:locations!service_packages_city_id_fkey(name),
      area:locations!service_packages_area_id_fkey(name),
      service_categories!service_packages_category_id_fkey (
        slug,
        service_category_translations (
          locale,
          name
        )
      ),
      service_package_versions (version_number)
    `)
    .eq('provider_id', providerId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error({ error: error.message, providerId, event: 'packages.provider_fetch_failed' });
    return [];
  }

  if (!data) {
    return [];
  }

  return (data as any[]).map((pkg: any) => {
    const translations = pkg.service_categories?.service_category_translations || [];
    const categoryName = translations[0]?.name || pkg.service_categories?.slug || 'General';
    const versions = pkg.service_package_versions || [];
    const maxVersion = versions.length > 0 
      ? Math.max(...versions.map((v: any) => v.version_number))
      : null;

    const cityName = pkg.city?.name || FALLBACK_LOCATIONS.find((l) => l.id === pkg.city_id)?.name || null;
    const areaName = pkg.area?.name || FALLBACK_LOCATIONS.find((l) => l.id === pkg.area_id)?.name || null;

    return {
      id: pkg.id,
      title: pkg.title,
      summary: pkg.summary,
      status: pkg.status,
      categoryName,
      deliveryMode: pkg.delivery_mode,
      cityName,
      areaName,
      turnaroundDays: pkg.turnaround_days,
      indicativeValueMinor: pkg.indicative_value_minor ? Number(pkg.indicative_value_minor) : null,
      currencyCode: pkg.currency_code,
      publishedAt: pkg.published_at,
      updatedAt: pkg.updated_at,
      versionNumber: maxVersion,
    };
  });
}

/**
 * Fetches package details for provider editing (with strict IDOR protection).
 */
export async function getPackageForEdit(packageId: string, providerId: string) {
  const supabase = await createClient();

  const { data: pkg, error } = await supabase
    .from('service_packages')
    .select('*')
    .eq('id', packageId)
    .eq('provider_id', providerId)
    .single();

  if (error || !pkg) {
    return null;
  }

  const { data: seeking } = await supabase
    .from('service_package_seeking_categories')
    .select('category_id')
    .eq('package_id', packageId);

  const seekingCategoryIds = seeking?.map((s) => s.category_id) || [];

  return {
    ...pkg,
    indicative_value_minor: pkg.indicative_value_minor ? Number(pkg.indicative_value_minor) : null,
    deliverables: Array.isArray(pkg.deliverables) ? (pkg.deliverables as string[]) : [],
    exclusions: Array.isArray(pkg.exclusions) ? (pkg.exclusions as string[]) : [],
    seekingCategoryIds,
  };
}

/**
 * Fetches a single public published package for the detail page.
 */
export async function getPublicPackageDetail(packageId: string, locale: string = 'en') {
  const supabase = await createClient();

  const { data: pkg, error } = await supabase
    .from('service_packages')
    .select(`
      id,
      title,
      summary,
      description,
      status,
      delivery_mode,
      country_code,
      city_id,
      area_id,
      city:locations!service_packages_city_id_fkey(name),
      area:locations!service_packages_area_id_fkey(name),
      turnaround_days,
      capacity_per_month,
      indicative_value_minor,
      currency_code,
      deliverables,
      exclusions,
      published_at,
      updated_at,
      provider_id,
      service_categories!service_packages_category_id_fkey (
        id,
        slug,
        service_category_translations (locale, name)
      )
    `)
    .eq('id', packageId)
    .eq('status', 'published')
    .single();

  if (error || !pkg) {
    if (error && error.code !== 'PGRST116') {
      logger.error({ error: error.message, packageId, event: 'packages.detail_fetch_failed' });
    }
    return null;
  }

  const rawPkg = pkg as any;

  // Fetch provider metadata via public_provider_profiles view
  const { data: providerProfile } = await supabase
    .from('public_provider_profiles')
    .select(
      'id, display_name, business_name, avatar_url, member_since, reliability_score, reputation_tier, completed_trades_count, distinct_partners_count, is_score_visible, verification_status, verified_link_count'
    )
    .eq('id', rawPkg.provider_id)
    .single();

  // Fetch package media (cover + gallery)
  const { data: packageMedia } = await supabase
    .from('package_media')
    .select(`
      asset_id,
      is_cover,
      position,
      alt_text,
      media_assets (
        id,
        bucket,
        path,
        blur_data_url,
        variants
      )
    `)
    .eq('package_id', packageId)
    .order('position', { ascending: true });

  // Fetch seeking categories
  const { data: seekingData } = await supabase
    .from('service_package_seeking_categories')
    .select(`
      service_categories (
        id,
        slug,
        service_category_translations (locale, name)
      )
    `)
    .eq('package_id', packageId);

  const seekingCategories = (seekingData || []).map((item: any) => {
    const cat = item.service_categories;
    const trans = cat?.service_category_translations?.find((t: any) => t.locale === locale)
      || cat?.service_category_translations?.[0];
    return {
      id: cat?.id,
      slug: cat?.slug,
      name: trans?.name || cat?.slug,
    };
  });

  const catTrans = rawPkg.service_categories?.service_category_translations?.find((t: any) => t.locale === locale)
    || rawPkg.service_categories?.service_category_translations?.[0];

  const cityName = rawPkg.city?.name || FALLBACK_LOCATIONS.find((l) => l.id === rawPkg.city_id)?.name || null;
  const areaName = rawPkg.area?.name || FALLBACK_LOCATIONS.find((l) => l.id === rawPkg.area_id)?.name || null;

  return {
    id: rawPkg.id,
    title: rawPkg.title,
    summary: rawPkg.summary,
    description: rawPkg.description,
    status: rawPkg.status,
    deliveryMode: rawPkg.delivery_mode,
    countryCode: rawPkg.country_code,
    cityId: rawPkg.city_id,
    cityName: cityName || 'Nairobi',
    areaId: rawPkg.area_id,
    areaName,
    turnaroundDays: rawPkg.turnaround_days,
    capacityPerMonth: rawPkg.capacity_per_month,
    indicativeValueMinor: rawPkg.indicative_value_minor ? Number(rawPkg.indicative_value_minor) : null,
    currencyCode: rawPkg.currency_code,
    deliverables: Array.isArray(rawPkg.deliverables) ? (rawPkg.deliverables as string[]) : [],
    exclusions: Array.isArray(rawPkg.exclusions) ? (rawPkg.exclusions as string[]) : [],
    publishedAt: rawPkg.published_at,
    updatedAt: rawPkg.updated_at,
    category: {
      id: rawPkg.service_categories?.id,
      slug: rawPkg.service_categories?.slug,
      name: catTrans?.name || rawPkg.service_categories?.slug,
    },
    seekingCategories,
    media: (packageMedia || []).map((pm: any) => ({
      assetId: pm.asset_id,
      isCover: pm.is_cover,
      position: pm.position,
      altText: pm.alt_text,
      blurDataUrl: pm.media_assets?.blur_data_url || null,
      path: pm.media_assets?.path || null,
      variants: pm.media_assets?.variants || null,
    })),
    provider: {
      id: providerProfile?.id || rawPkg.provider_id,
      displayName: providerProfile?.display_name || 'Verified Provider',
      businessName: providerProfile?.business_name || null,
      avatarUrl: providerProfile?.avatar_url || null,
      memberSince: providerProfile?.member_since || rawPkg.published_at,
      reliabilityScore: providerProfile?.reliability_score ?? null,
      reputationTier: providerProfile?.reputation_tier ?? 'new',
      completedTradesCount: providerProfile?.completed_trades_count ?? 0,
      distinctPartnersCount: providerProfile?.distinct_partners_count ?? 0,
      isScoreVisible: providerProfile?.is_score_visible ?? false,
      verificationStatus: providerProfile?.verification_status ?? 'none',
      verifiedLinkCount: providerProfile?.verified_link_count ?? 0,
    },
  };
}

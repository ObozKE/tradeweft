import React from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { TopAdCheckoutClient } from '@/features/payments/components/TopAdCheckoutClient';
import { logger } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'Promote Package with Top Ads | Trade Weft',
  description: 'Pin your service package to the top of your category and city in Kenya with Safaricom M-Pesa.',
};

interface PromotePageProps {
  params: Promise<{ packageId: string }>;
}

export default async function PromotePackagePage({ params }: PromotePageProps) {
  const { packageId } = await params;
  const { user } = await requireOnboardedUser();
  const adminSupabase = createAdminClient();

  // 1. Fetch package with direct flat attributes (avoids PostgREST ambiguous foreign key error on locations)
  const { data: pkg, error: pkgErr } = await adminSupabase
    .from('service_packages')
    .select('id, title, status, provider_id, country_code, city_id, category_id')
    .eq('id', packageId)
    .single();

  if (pkgErr || !pkg) {
    logger.warn({ error: pkgErr?.message, packageId, event: 'promote.package_not_found' });
    notFound();
  }

  if (pkg.provider_id !== user.id) {
    redirect('/dashboard/packages');
  }

  if (pkg.status !== 'published') {
    redirect('/dashboard/packages');
  }

  // 2. Fetch location city name safely
  let cityName = 'Nairobi';
  if (pkg.city_id) {
    const { data: loc } = await adminSupabase
      .from('locations')
      .select('name')
      .eq('id', pkg.city_id)
      .maybeSingle();
    if (loc?.name) {
      cityName = loc.name;
    }
  }

  // 3. Fetch category name safely from translations
  let categoryName = 'General';
  if (pkg.category_id) {
    const { data: catTrans } = await adminSupabase
      .from('service_category_translations')
      .select('name')
      .eq('category_id', pkg.category_id)
      .eq('locale', 'en')
      .maybeSingle();
    if (catTrans?.name) {
      categoryName = catTrans.name;
    }
  }

  // 4. Fetch prices for top_ad products
  const { data: prices } = await adminSupabase
    .from('price_book')
    .select('*')
    .eq('country_code', pkg.country_code || 'KE')
    .eq('currency_code', 'KES')
    .in('product_id', ['top_ad_7d', 'top_ad_14d', 'top_ad_30d']);

  const getPrice = (productId: string, fallback: number) => {
    const entry = prices?.find((p) => p.product_id === productId);
    return entry ? Number(entry.amount_minor) : fallback;
  };

  const durations = [
    {
      id: 'top_ad_7d' as const,
      days: 7,
      label: '7 Days Promoted',
      priceMinor: getPrice('top_ad_7d', 50000),
    },
    {
      id: 'top_ad_14d' as const,
      days: 14,
      label: '14 Days Promoted',
      priceMinor: getPrice('top_ad_14d', 90000),
    },
    {
      id: 'top_ad_30d' as const,
      days: 30,
      label: '30 Days Promoted',
      priceMinor: getPrice('top_ad_30d', 160000),
    },
  ];

  // 5. Pre-compute initial slot availability for default 7 days to eliminate client round-trip
  const { data: takenPromotions } = pkg.city_id
    ? await adminSupabase
        .from('listing_promotions')
        .select('slot_no, status, period')
        .eq('country_code', pkg.country_code)
        .eq('city_id', pkg.city_id)
        .eq('category_id', pkg.category_id)
        .in('status', ['held', 'active'])
    : { data: [] };

  const takenSlots = new Set<number>();
  for (const promo of takenPromotions || []) {
    takenSlots.add(promo.slot_no);
  }

  const availableSlotsList = [1, 2, 3].filter((s) => !takenSlots.has(s));
  const initialAvailability = {
    totalSlots: 3,
    availableSlots: availableSlotsList.length,
    isAvailable: availableSlotsList.length > 0,
    assignedSlot: availableSlotsList.length > 0 ? availableSlotsList[0] : null,
    takenSlots: Array.from(takenSlots),
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Promote Service Package
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Lock in a pinned Top Ad placement for your listing in {categoryName} across {cityName}.
        </p>
      </div>

      <TopAdCheckoutClient
        packageId={pkg.id}
        packageTitle={pkg.title}
        cityName={cityName}
        categoryName={categoryName}
        durations={durations}
        initialAvailability={initialAvailability}
        userPhoneDefault=""
      />
    </div>
  );
}

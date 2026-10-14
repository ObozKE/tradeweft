import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserEntitlements } from '@/features/payments/utils/entitlements';
import { PackageAnalyticsView } from '@/features/payments/components/PackageAnalyticsView';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Package Analytics | Trade Weft',
  description: 'View listing impressions, views, and trade conversion performance.',
};

interface AnalyticsPageProps {
  params: Promise<{ id: string }>;
}

export default async function PackageAnalyticsPage({ params }: AnalyticsPageProps) {
  const { id } = await params;
  const { user } = await requireOnboardedUser();
  const adminSupabase = createAdminClient();

  // 1. Fetch package
  const { data: pkg, error: pkgErr } = await adminSupabase
    .from('service_packages')
    .select('id, title, provider_id, status')
    .eq('id', id)
    .single();

  if (pkgErr || !pkg) {
    notFound();
  }

  if (pkg.provider_id !== user.id) {
    redirect('/dashboard/packages');
  }

  // 2. Fetch entitlements
  const entitlements = await getUserEntitlements(user.id);

  // 3. Date window based on tier
  const daysLimit =
    entitlements.analytics_level === 'enterprise'
      ? 365
      : entitlements.analytics_level === 'pro'
      ? 90
      : 30;

  const sinceDate = new Date(Date.now() - daysLimit * 24 * 3600 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: stats } = await adminSupabase
    .from('package_daily_stats')
    .select('*')
    .eq('package_id', id)
    .gte('date', sinceDate)
    .order('date', { ascending: false });

  return (
    <div className="space-y-6">
      {/* Back and Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/dashboard/packages"
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-ink font-semibold mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to My Packages
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Analytics: {pkg.title}
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Tracking impressions, unique listing views, and trade proposal starts.
          </p>
        </div>

        <Link href={`/dashboard/promote/${pkg.id}`}>
          <Button size="sm" variant="outline" className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50 gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            Promote with Top Ads
          </Button>
        </Link>
      </div>

      <PackageAnalyticsView
        packageId={pkg.id}
        packageTitle={pkg.title}
        analyticsLevel={entitlements.analytics_level}
        stats={stats || []}
        canExportCsv={entitlements.csv_export || entitlements.plan_id === 'enterprise'}
      />
    </div>
  );
}

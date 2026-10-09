import React from 'react';
import Link from 'next/link';
import { requireOnboardedUser } from '@/server/dal';
import { getCategories } from '@/features/packages/queries/package.queries';
import { getLocationsByCountry } from '@/features/onboarding/queries/locations.queries';
import { PackageForm } from '@/features/packages/components/PackageForm';
import { ArrowLeft } from 'lucide-react';

export default async function NewServicePackagePage() {
  const { user, profile } = await requireOnboardedUser();
  const [categories, locations] = await Promise.all([
    getCategories('en'),
    getLocationsByCountry(profile?.country_code || 'KE'),
  ]);

  const providerName =
    profile?.business_name || profile?.display_name || user.email?.split('@')[0] || 'Provider';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button */}
      <Link
        href="/dashboard/packages"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-primary transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Packages
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Create Service Package
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Define a strictly scoped service offering that other businesses can trade for.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
        <PackageForm
          categories={categories}
          locations={locations}
          initialPackage={{
            city_id: profile?.city_id,
            area_id: profile?.area_id,
          }}
          providerName={providerName}
        />
      </div>
    </div>
  );
}

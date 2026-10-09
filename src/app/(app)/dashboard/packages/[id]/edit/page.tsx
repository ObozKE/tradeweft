import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOnboardedUser } from '@/server/dal';
import { getPackageForEdit, getCategories } from '@/features/packages/queries/package.queries';
import { getLocationsByCountry } from '@/features/onboarding/queries/locations.queries';
import { PackageForm } from '@/features/packages/components/PackageForm';
import { ArrowLeft } from 'lucide-react';

interface EditPackagePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePackagePage({ params }: EditPackagePageProps) {
  const { id } = await params;
  const { user, profile } = await requireOnboardedUser();

  const pkg = await getPackageForEdit(id, user.id);
  if (!pkg) {
    notFound();
  }

  const [categories, locations] = await Promise.all([
    getCategories('en'),
    getLocationsByCountry(pkg.country_code || 'KE'),
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
          Edit Service Package
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Update scope, deliverables, turnaround, or what you are seeking in return.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
        <PackageForm
          initialPackage={{
            id: pkg.id,
            title: pkg.title,
            summary: pkg.summary,
            description: pkg.description,
            category_id: pkg.category_id,
            delivery_mode: pkg.delivery_mode,
            country_code: pkg.country_code,
            city_id: pkg.city_id,
            area_id: pkg.area_id,
            turnaround_days: pkg.turnaround_days,
            capacity_per_month: pkg.capacity_per_month,
            indicative_value_minor: pkg.indicative_value_minor ? Number(pkg.indicative_value_minor) : null,
            currency_code: pkg.currency_code,
            deliverables: pkg.deliverables,
            exclusions: pkg.exclusions,
            seekingCategoryIds: pkg.seekingCategoryIds,
            status: pkg.status,
            updated_at: pkg.updated_at,
          }}
          categories={categories}
          locations={locations}
          providerName={providerName}
        />
      </div>
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { requireOnboardedUser } from '@/server/dal';
import { getProviderPackages } from '@/features/packages/queries/package.queries';
import { PackageStatusBadge } from '@/features/packages/components/PackageStatusBadge';
import { PackageCardActions } from '@/features/packages/components/PackageCardActions';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Package, Clock, MapPin, Globe } from 'lucide-react';

export default async function ProviderPackagesDashboardPage() {
  const { user } = await requireOnboardedUser();
  const packages = await getProviderPackages(user.id);

  const publishedCount = packages.filter((p) => p.status === 'published').length;
  const draftCount = packages.filter((p) => p.status === 'draft').length;
  const pausedCount = packages.filter((p) => p.status === 'paused').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800 mb-2">
            Phase 2: Service Packages
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            My Service Packages
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your service offerings and barter trade packages.
          </p>
        </div>

        <Link href="/dashboard/packages/new">
          <Button variant="primary" className="h-11 px-5 shadow-sm">
            <Plus className="me-2 h-4 w-4" />
            Create Package
          </Button>
        </Link>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-button border border-border bg-white p-3">
          <p className="text-xs text-text-secondary">Total Packages</p>
          <p className="text-2xl font-bold text-ink mt-1">{packages.length}</p>
        </div>
        <div className="rounded-button border border-pine-200 bg-pine-50/50 p-3">
          <p className="text-xs text-pine-800 font-medium">Published (Active)</p>
          <p className="text-2xl font-bold text-pine-700 mt-1">{publishedCount}</p>
        </div>
        <div className="rounded-button border border-border bg-white p-3">
          <p className="text-xs text-text-secondary">Drafts</p>
          <p className="text-2xl font-bold text-ink mt-1">{draftCount}</p>
        </div>
        <div className="rounded-button border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs text-amber-800 font-medium">Paused</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{pausedCount}</p>
        </div>
      </div>

      {/* Packages List */}
      {packages.length === 0 ? (
        <Card className="border-border bg-white py-12 text-center">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pine-100 text-pine-700">
              <Package className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">No Service Packages Yet</h3>
              <p className="text-sm text-text-secondary max-w-md mx-auto mt-1">
                Create your first service package to showcase your skills and trade for services in Nairobi.
              </p>
            </div>
            <Link href="/dashboard/packages/new">
              <Button variant="primary" className="mt-2">
                <Plus className="me-2 h-4 w-4" />
                Create Your First Package
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-lg border border-border bg-white p-5 transition hover:shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PackageStatusBadge status={pkg.status} />
                    <span className="rounded-chip bg-surface-sunken px-2.5 py-0.5 text-xs text-text-secondary font-medium">
                      {pkg.categoryName}
                    </span>
                    {pkg.versionNumber && (
                      <span className="text-xs text-text-muted">
                        v{pkg.versionNumber}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-ink">
                    {pkg.status === 'published' ? (
                      <Link
                        href={`/packages/${pkg.id}/preview`}
                        className="hover:text-primary transition"
                      >
                        {pkg.title}
                      </Link>
                    ) : (
                      pkg.title
                    )}
                  </h3>

                  <p className="text-sm text-text-secondary line-clamp-2">
                    {pkg.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary pt-2">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-pine-600" />
                      {pkg.turnaroundDays} Days Turnaround
                    </span>

                    <span className="inline-flex items-center gap-1">
                      {pkg.deliveryMode === 'remote' ? (
                        <>
                          <Globe className="h-3.5 w-3.5 text-pine-600" />
                          Remote
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-pine-600" />
                          {pkg.areaName ? `${pkg.areaName}, ${pkg.cityName}` : pkg.cityName}
                        </>
                      )}
                    </span>

                    <span className="font-semibold text-ink">
                      Est. Value: {formatIndicativeValue(pkg.indicativeValueMinor, pkg.currencyCode)}
                    </span>
                  </div>
                </div>

                <div className="md:border-s md:border-border md:ps-5 shrink-0 self-center md:self-start">
                  <PackageCardActions packageId={pkg.id} status={pkg.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

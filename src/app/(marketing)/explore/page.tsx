import React, { Suspense } from 'react';
import Link from 'next/link';
import { getCategories } from '@/features/packages/queries/package.queries';
import { searchPackages } from '@/features/packages/queries/search.queries';
import { packageSearchSchema } from '@/features/packages/schemas/search.schema';
import { ExploreFilters } from '@/features/packages/components/ExploreFilters';
import { PackageCard } from '@/features/packages/components/PackageCard';
import { Button } from '@/components/ui/button';
import { Package, Search, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore B2B Service Packages | Trade Weft Nairobi',
  description:
    'Browse professional services offered for barter trade in Nairobi, Kenya. Web development, design, legal, accounting, therapy, and corporate services.',
};

interface ExplorePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const resolvedParams = await searchParams;

  // Flatten and parse search query params safely
  const rawQuery = {
    country: typeof resolvedParams.country === 'string' ? resolvedParams.country : 'KE',
    city: typeof resolvedParams.city === 'string' ? resolvedParams.city : undefined,
    area: typeof resolvedParams.area === 'string' ? resolvedParams.area : undefined,
    category: typeof resolvedParams.category === 'string' ? resolvedParams.category : undefined,
    seeking: typeof resolvedParams.seeking === 'string' ? resolvedParams.seeking : undefined,
    mode: typeof resolvedParams.mode === 'string' ? resolvedParams.mode : undefined,
    q: typeof resolvedParams.q === 'string' ? resolvedParams.q : undefined,
    cursor: typeof resolvedParams.cursor === 'string' ? resolvedParams.cursor : undefined,
  };

  const validation = packageSearchSchema.safeParse(rawQuery);
  const validatedParams = validation.success ? validation.data : { country: 'KE' };

  // Fetch categories and run keyset search query
  const [categories, { items: packages, nextCursor, hasNextPage }] = await Promise.all([
    getCategories('en'),
    searchPackages(validatedParams, 'en'),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Title & Mission */}
      <div className="mb-8">
        <div className="inline-flex items-center rounded-chip bg-pine-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-pine-800 mb-2">
          Nairobi Barter Marketplace
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Explore Service Packages
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl">
          Discover verified professional skills offered by local businesses and freelancers. Trade your skills without cash barriers.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Responsive Filters: Sidebar on Desktop, Drawer on Mobile */}
        <Suspense fallback={<div className="w-72 h-96 animate-pulse bg-surface-sunken rounded-lg" />}>
          <ExploreFilters categories={categories} />
        </Suspense>

        {/* Results Stream */}
        <div className="flex-1 w-full space-y-6">
          <div className="flex items-center justify-between text-xs text-text-secondary border-b border-border pb-3">
            <span>
              Showing <strong className="text-ink">{packages.length}</strong> available package{packages.length === 1 ? '' : 's'}
            </span>
            {validatedParams.q && (
              <span>
                Matching &quot;<strong className="text-ink">{validatedParams.q}</strong>&quot;
              </span>
            )}
          </div>

          {packages.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-12 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pine-100 text-pine-700 mb-4">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-ink">No Packages Found</h3>
              <p className="mt-1 text-sm text-text-secondary max-w-md mx-auto">
                No active service packages match your selected filters. Try broadening your location or category filters.
              </p>
              <Link href="/explore?country=KE">
                <Button variant="outline" size="sm" className="mt-4 text-xs">
                  Reset All Filters
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}

          {/* Keyset Pagination Load More */}
          {hasNextPage && nextCursor && (
            <div className="pt-6 text-center">
              <Link
                href={`/explore?${new URLSearchParams({
                  ...validatedParams,
                  cursor: nextCursor,
                }).toString()}`}
              >
                <Button variant="outline" className="h-11 px-8 text-sm">
                  Load Next Packages
                  <ChevronRight className="ms-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

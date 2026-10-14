import React from 'react';
import Link from 'next/link';
import { notFound, redirect, RedirectType } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicPackageDetail } from '@/features/packages/queries/package.queries';
import { generatePackageSlug } from '@/features/packages/utils/slug';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import { TradeActionSlot } from '@/features/packages/components/TradeActionSlot';
import { ReputationBadge } from '@/features/trust/components/ReputationBadge';
import { VerifiedBadgeSlot } from '@/features/trust/components/VerifiedBadgeSlot';
import { AnalyticsBeacon } from '@/features/payments/components/AnalyticsBeacon';
import {
  Clock,
  MapPin,
  Globe,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  User,
  ShieldCheck,
  Calendar,
  Layers,
  ExternalLink,
} from 'lucide-react';

interface PackageDetailPageProps {
  params: Promise<{ id: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PackageDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const pkg = await getPublicPackageDetail(id, 'en');

  if (!pkg) {
    return {
      title: 'Service Package Not Found | Trade Weft',
      description: 'The requested barter service package is no longer available.',
    };
  }

  const canonicalSlug = generatePackageSlug(pkg.title);
  const canonicalUrl = `https://tradeweft.com/packages/${pkg.id}/${canonicalSlug}`;

  return {
    title: `${pkg.title} | Trade Weft Barter Nairobi`,
    description: pkg.summary,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${pkg.title} | Trade Weft`,
      description: pkg.summary,
      url: canonicalUrl,
      siteName: 'Trade Weft',
      locale: 'en_KE',
      type: 'website',
    },
  };
}

export default async function PackageDetailPage({ params }: PackageDetailPageProps) {
  const { id, slug } = await params;
  const pkg = await getPublicPackageDetail(id, 'en');

  // Only published packages are publicly visible
  if (!pkg) {
    notFound();
  }

  // Canonical slug verification: redirect stale slugs to current canonical URL
  const canonicalSlug = generatePackageSlug(pkg.title);
  if (slug !== canonicalSlug) {
    redirect(`/packages/${pkg.id}/${canonicalSlug}`, RedirectType.replace);
  }

  const formattedValue = formatIndicativeValue(pkg.indicativeValueMinor, pkg.currencyCode);
  const memberSinceYear = pkg.provider.memberSince
    ? new Date(pkg.provider.memberSince).getFullYear()
    : 2026;

  // Safe JSON-LD Serialization (escapes '<' to prevent script injection)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: pkg.title,
    description: pkg.description,
    provider: {
      '@type': 'Organization',
      name: pkg.provider.businessName || pkg.provider.displayName,
    },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: pkg.areaName ? `${pkg.areaName}, ${pkg.cityName}` : pkg.cityName,
    },
  };
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Inject JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />

      {/* Analytics View Beacon */}
      <AnalyticsBeacon packageId={pkg.id} eventType="package_view" />

      {/* Back to Explore link */}
      <Link
        href="/explore"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-primary transition mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Explore Services
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Main Content Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header Card */}
          <div className="rounded-lg border border-border bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-chip bg-pine-200 px-3 py-1 font-semibold uppercase tracking-[0.04em] text-pine-800">
                {pkg.category.name}
              </span>
              <span className="inline-flex items-center gap-1 text-text-secondary font-medium">
                {pkg.deliveryMode === 'remote' ? (
                  <>
                    <Globe className="h-3.5 w-3.5 text-pine-600" />
                    <span>Remote Delivery</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-pine-600" />
                    <span>{pkg.areaName ? `${pkg.areaName}, ${pkg.cityName}` : pkg.cityName}</span>
                  </>
                )}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-snug">
              {pkg.title}
            </h1>

            <p className="text-base text-text-secondary leading-relaxed">
              {pkg.summary}
            </p>

            {/* Quick Specs Strip */}
            <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
              <div className="space-y-0.5">
                <span className="text-text-muted">Turnaround</span>
                <p className="font-semibold text-ink flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-pine-600" />
                  {pkg.turnaroundDays} Days
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-text-muted">Capacity</span>
                <p className="font-semibold text-ink">
                  {pkg.capacityPerMonth ? `${pkg.capacityPerMonth}/month` : 'Flexible'}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-text-muted">Est. Trade Value</span>
                <p className="font-semibold text-pine-700">{formattedValue}</p>
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="rounded-lg border border-border bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-semibold text-ink">Detailed Scope & Methodology</h2>
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {pkg.description}
            </div>
          </div>

          {/* Deliverables & Exclusions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Deliverables */}
            <div className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-pine-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-pine-600" />
                Included Deliverables
              </h3>
              <ul className="space-y-2">
                {pkg.deliverables.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-ink">
                    <span className="text-pine-600 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Exclusions */}
            <div className="rounded-lg border border-border bg-surface-sunken/40 p-6 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-text-secondary flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-text-muted" />
                Out of Scope / Exclusions
              </h3>
              {pkg.exclusions.length === 0 ? (
                <p className="text-xs text-text-muted italic">No exclusions specified.</p>
              ) : (
                <ul className="space-y-2">
                  {pkg.exclusions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="text-text-muted font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* What Provider is Seeking in Return (Matchmaking) */}
          {pkg.seekingCategories.length > 0 && (
            <div className="rounded-lg border border-pine-200 bg-pine-50/40 p-6 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold text-pine-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-pine-700" />
                What this Provider is Seeking in Barter Exchange:
              </h3>
              <p className="text-xs text-text-secondary">
                This provider is actively open to trading for services in the following categories:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {pkg.seekingCategories.map((want) => (
                  <span
                    key={want.id}
                    className="rounded-chip bg-white border border-pine-300 px-3 py-1 text-xs font-semibold text-pine-900 shadow-2xs"
                  >
                    ✓ {want.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column (Provider Card & Phase 3 Trade Action Slot) */}
        <div className="space-y-6">
          {/* Provider Profile Card */}
          <div className="rounded-lg border border-border bg-white p-6 shadow-xs space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              About the Provider
            </h3>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pine-100 text-pine-800 font-bold">
                {pkg.provider.displayName ? pkg.provider.displayName[0].toUpperCase() : 'P'}
              </div>
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-base font-semibold text-ink leading-tight">
                    {pkg.provider.displayName}
                  </h4>
                  <VerifiedBadgeSlot
                    status={pkg.provider.verificationStatus}
                    linkCount={pkg.provider.verifiedLinkCount}
                  />
                </div>
                {pkg.provider.businessName && (
                  <p className="text-xs text-text-secondary font-medium">
                    {pkg.provider.businessName}
                  </p>
                )}
              </div>
            </div>

            {/* Phase 4 Reputation Badge */}
            <div className="pt-1">
              <ReputationBadge
                tier={pkg.provider.reputationTier}
                score={pkg.provider.reliabilityScore}
                isScoreVisible={pkg.provider.isScoreVisible}
                completedTradesCount={pkg.provider.completedTradesCount}
                distinctPartnersCount={pkg.provider.distinctPartnersCount}
                showDetails={true}
                size="md"
              />
            </div>

            <div className="border-t border-border pt-3 space-y-2 text-xs text-text-secondary">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-text-muted" />
                  <span>Member since {memberSinceYear}</span>
                </span>
                <Link
                  href={`/providers/${pkg.provider.id}/${generatePackageSlug(pkg.provider.businessName || pkg.provider.displayName || 'provider')}`}
                  className="font-semibold text-pine-600 hover:text-pine-700 flex items-center gap-1"
                >
                  View Profile <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Phase 3 Trade Action Slot */}
            <div className="pt-2">
              <TradeActionSlot packageId={pkg.id} providerId={pkg.provider.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

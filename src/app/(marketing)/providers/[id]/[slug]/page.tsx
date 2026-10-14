import React from 'react';
import Link from 'next/link';
import { notFound, redirect, RedirectType } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import {
  getProviderProfileData,
  getProviderReviewsKeyset,
  getProviderLedgerKeyset,
  getPublicVerifiedPortfolioLinks,
} from '@/features/trust/queries/trust.queries';
import { generatePackageSlug } from '@/features/packages/utils/slug';
import { ScoreBreakdownCard } from '@/features/trust/components/ScoreBreakdownCard';
import { ReviewCard } from '@/features/trust/components/ReviewCard';
import { LedgerTable } from '@/features/trust/components/LedgerTable';
import { VerifiedBadgeSlot } from '@/features/trust/components/VerifiedBadgeSlot';
import {
  MapPin,
  Calendar,
  Layers,
  ArrowLeft,
  User,
  ShieldCheck,
  Star,
  ExternalLink,
  BadgeCheck,
} from 'lucide-react';

export const revalidate = 300; // 5 minutes ISR cache

interface ProviderProfilePageProps {
  params: Promise<{ id: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: ProviderProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProviderProfileData(id);

  if (!profile) {
    return {
      title: 'Provider Not Found | Trade Weft',
      description: 'The requested provider profile does not exist.',
    };
  }

  const name = profile.businessName || profile.displayName || 'Provider';
  const canonicalSlug = generatePackageSlug(name);
  const canonicalUrl = `https://tradeweft.com/providers/${profile.id}/${canonicalSlug}`;

  return {
    title: `${name} | Proof of Reliability & Barter Profile | Trade Weft`,
    description: `View verified barter trades, reviews, and Proof of Reliability score for ${name} on Trade Weft.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${name} | Trade Weft Provider`,
      description: `View verified barter trades and Proof of Reliability score for ${name}.`,
      url: canonicalUrl,
      siteName: 'Trade Weft',
      type: 'profile',
    },
  };
}

export default async function ProviderProfilePage({
  params,
}: ProviderProfilePageProps) {
  const { id, slug } = await params;
  const profile = await getProviderProfileData(id);

  if (!profile) {
    notFound();
  }

  const name = profile.businessName || profile.displayName || 'Provider';
  const canonicalSlug = generatePackageSlug(name);

  if (slug !== canonicalSlug) {
    redirect(`/providers/${profile.id}/${canonicalSlug}`, RedirectType.replace);
  }

  // Fetch current user session to determine ownership for review replies/reports
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch reviews, ledger entries, and verified portfolio links
  const [
    { reviews },
    { entries: ledgerEntries, nextCursor: ledgerCursor },
    verifiedLinks,
  ] = await Promise.all([
    getProviderReviewsKeyset({ providerId: profile.id, limit: 10 }),
    getProviderLedgerKeyset({ providerId: profile.id, limit: 10 }),
    getPublicVerifiedPortfolioLinks(profile.id),
  ]);

  // Fetch published service packages by this provider
  const { data: publishedPackages } = await supabase
    .from('service_packages')
    .select(`
      id,
      title,
      summary,
      delivery_mode,
      indicative_value_minor,
      currency_code,
      service_categories!service_packages_category_id_fkey(
        slug,
        service_category_translations(locale, name)
      )
    `)
    .eq('provider_id', profile.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  const isOwner = user?.id === profile.id;
  const memberSinceYear = new Date(profile.memberSince).getFullYear();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-pine-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Explore
        </Link>
      </nav>

      {/* Provider Header Card */}
      <header className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-20 w-20 rounded-full bg-surface-sunken flex items-center justify-center text-text-secondary overflow-hidden border border-border flex-shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-text-muted" aria-hidden="true" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-ink">
                  {name}
                </h1>
                <VerifiedBadgeSlot
                  status={profile.verification?.status}
                  linkCount={profile.verification?.verifiedLinkCount}
                />
              </div>

              {profile.businessName && profile.displayName && (
                <p className="text-xs text-text-secondary mt-0.5">
                  Managed by {profile.displayName}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary mt-3">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  {profile.areaName ? `${profile.areaName}, ${profile.cityName || 'Nairobi'}` : profile.cityName || 'Nairobi'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  Member since {memberSinceYear}
                </span>
              </div>
            </div>
          </div>

          {isOwner && (
            <div className="self-stretch sm:self-auto flex items-center">
              <Link
                href="/dashboard/reviews"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-pine-50 px-4 py-2 text-xs font-semibold text-pine-800 border border-pine-200 hover:bg-pine-100 transition-colors"
              >
                <Star className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
                Manage Your Reviews
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Score Breakdown Section */}
      <section className="mb-8" aria-label="Proof of Reliability">
        <ScoreBreakdownCard reputation={profile.reputation} />
      </section>

      {/* Available Services Section */}
      {publishedPackages && publishedPackages.length > 0 && (
        <section className="mb-10" aria-label="Offered Services">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Layers className="h-5 w-5 text-pine-600" aria-hidden="true" />
              Services Offered for Barter ({publishedPackages.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publishedPackages.map((pkg: any) => {
              const catTrans =
                pkg.service_categories?.service_category_translations?.[0]?.name ||
                pkg.service_categories?.slug ||
                'Service';
              const pkgSlug = generatePackageSlug(pkg.title);

              return (
                <div
                  key={pkg.id}
                  className="rounded-xl border border-border bg-surface p-5 shadow-xs flex flex-col justify-between hover:border-pine-300 transition-colors"
                >
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-chip text-[11px] font-medium bg-surface-sunken text-text-secondary border border-border mb-2.5">
                      {catTrans}
                    </span>
                    <h3 className="font-semibold text-sm text-ink line-clamp-1">
                      {pkg.title}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">
                      {pkg.summary}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-text-muted capitalize">
                      {pkg.delivery_mode.replace('_', ' ')}
                    </span>
                    <Link
                      href={`/packages/${pkg.id}/${pkgSlug}`}
                      className="text-xs font-semibold text-pine-600 hover:text-pine-700 flex items-center gap-1"
                    >
                      View & Trade →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Verified Proof of Work & External Accounts */}
      {verifiedLinks.length > 0 && (
        <section className="mb-10" aria-label="Verified Proof of Work">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-pine-600" aria-hidden="true" />
                Verified Proof of Work & External Accounts
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Proof of ownership cryptographically confirmed. Verification is earned, never bought.
              </p>
            </div>
            <Link
              href="/trust#verification"
              className="text-xs font-medium text-pine-600 hover:underline"
            >
              How verification works
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {verifiedLinks.map((link) => (
              <a
                key={link.id}
                href={link.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between p-3.5 rounded-xl border border-sand-200 bg-white hover:border-pine-300 hover:shadow-xs transition"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink uppercase tracking-wider group-hover:text-pine-700">
                      {link.provider_key.replace('_', ' ')}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-pine-800 bg-pine-50 border border-pine-200 px-1.5 py-0.5 rounded-full">
                      Verified
                    </span>
                  </div>
                  <div className="text-xs text-text-muted truncate mt-0.5 font-mono">
                    {link.handle ? `@${link.handle}` : link.canonical_url.replace(/^https?:\/\//, '')}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-text-muted group-hover:text-pine-600 shrink-0 transition" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Public Trust Ledger Section */}
      <section className="mb-10" aria-label="Public Trust Ledger">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-pine-600" aria-hidden="true" />
            Public Trust Ledger
          </h2>
          <Link
            href="/trust#ledger"
            className="text-xs font-medium text-pine-600 hover:underline"
          >
            How the ledger works
          </Link>
        </div>

        <LedgerTable
          initialEntries={ledgerEntries}
          initialCursor={ledgerCursor}
          providerId={profile.id}
        />
      </section>

      {/* Revealed Reviews Section */}
      <section aria-label="Customer Reviews">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-700" aria-hidden="true" />
            Verified Reviews ({reviews.length})
          </h2>
        </div>

        {reviews.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">
            <p className="text-xs text-text-secondary">
              No public reviews revealed yet for this provider.
            </p>
            <p className="text-[11px] text-text-muted mt-1">
              Reviews are revealed once both trading parties submit or after the 14-day window closes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                currentUserId={user?.id}
                isProviderOwner={isOwner}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

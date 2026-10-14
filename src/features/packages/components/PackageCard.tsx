import React from 'react';
import Link from 'next/link';
import { Clock, MapPin, Globe, ArrowRight, User, Sparkles } from 'lucide-react';
import { formatIndicativeValue } from '../utils/currency';
import type { SearchResultItem } from '../queries/search.queries';
import { ReputationBadge } from '@/features/trust/components/ReputationBadge';
import { generatePackageSlug } from '../utils/slug';

interface PackageCardProps {
  pkg: SearchResultItem;
}

export function PackageCard({ pkg }: PackageCardProps) {
  const formattedValue = formatIndicativeValue(pkg.indicative_value_minor, pkg.currency_code);
  const providerTitle = pkg.provider_business_name
    ? `${pkg.provider_display_name} (${pkg.provider_business_name})`
    : pkg.provider_display_name || 'Verified Provider';
  const providerSlug = generatePackageSlug(pkg.provider_business_name || pkg.provider_display_name || 'provider');

  return (
    <article className={`flex flex-col justify-between rounded-lg border bg-white p-5 shadow-xs transition hover:shadow-sm ${pkg.is_promoted ? 'border-amber-300 ring-1 ring-amber-200/50' : 'border-border hover:border-pine-300'}`}>
      <div className="space-y-3">
        {/* Header Tag Bar */}
        <div className="flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-chip bg-pine-200 px-2.5 py-0.5 font-semibold uppercase tracking-[0.04em] text-pine-800">
              {pkg.category_name}
            </span>
            {pkg.is_promoted && (
              <span className="inline-flex items-center gap-1 rounded-chip bg-amber-50 border border-amber-300 px-2 py-0.5 font-semibold text-amber-950 text-[11px]" title="Promoted Top Ad placement">
                <Sparkles className="h-3 w-3 text-amber-700" aria-hidden="true" />
                <span>Promoted</span>
              </span>
            )}
          </div>

          <span className="inline-flex items-center gap-1 text-text-secondary font-medium">
            {pkg.delivery_mode === 'remote' ? (
              <>
                <Globe className="h-3.5 w-3.5 text-pine-600" />
                <span>Remote</span>
              </>
            ) : (
              <>
                <MapPin className="h-3.5 w-3.5 text-pine-600" />
                <span>{pkg.area_name ? `${pkg.area_name}, ${pkg.city_name}` : pkg.city_name}</span>
              </>
            )}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-ink leading-snug">
          <Link
            href={`/packages/${pkg.id}/${pkg.slug}`}
            className="hover:text-primary transition"
          >
            {pkg.title}
          </Link>
        </h3>

        {/* Summary */}
        <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
          {pkg.summary}
        </p>

        {/* Seeking Wants Chips */}
        {pkg.seeking_categories.length > 0 && (
          <div className="pt-2">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.04em] block mb-1">
              Seeking In Return:
            </span>
            <div className="flex flex-wrap gap-1">
              {pkg.seeking_categories.slice(0, 3).map((want) => (
                <span
                  key={want.category_id}
                  className="rounded-chip bg-surface-sunken border border-border px-2 py-0.5 text-[11px] text-ink font-medium"
                >
                  {want.name}
                </span>
              ))}
              {pkg.seeking_categories.length > 3 && (
                <span className="text-[11px] text-text-muted self-center">
                  +{pkg.seeking_categories.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info Bar */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-text-secondary">
          <span className="flex items-center gap-1 font-semibold text-ink">
            {formattedValue}
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-pine-600" />
            {pkg.turnaround_days}d
          </span>
        </div>

        <Link
          href={`/packages/${pkg.id}/${pkg.slug}`}
          className="inline-flex items-center gap-1 font-semibold text-pine-700 hover:text-pine-900 transition"
        >
          View Details
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Provider Attribution with Reputation Badge */}
      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between gap-2 text-xs text-text-muted">
        <Link
          href={`/providers/${pkg.provider_id}/${providerSlug}`}
          className="flex items-center gap-2 hover:text-pine-700 transition truncate min-w-0"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-sunken text-text-secondary flex-shrink-0">
            <User className="h-3 w-3" />
          </div>
          <span className="truncate">{providerTitle}</span>
        </Link>

        <ReputationBadge
          tier={pkg.provider_reputation_tier}
          score={pkg.provider_reliability_score}
          isScoreVisible={pkg.provider_score_visible}
          distinctPartnersCount={pkg.provider_distinct_partners}
          size="sm"
        />
      </div>
    </article>
  );
}

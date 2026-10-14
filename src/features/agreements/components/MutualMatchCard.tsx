'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { MutualMatchItem, PublishedPackageForTrade } from '../types/agreement.types';
import { ProposeTradeDialog } from './ProposeTradeDialog';
import {
  Sparkles,
  ArrowRight,
  ArrowLeftRight,
  MapPin,
  CheckCircle2,
  Package,
} from 'lucide-react';

import { generatePackageSlug } from '@/features/packages/utils/slug';

interface MutualMatchCardProps {
  match: MutualMatchItem;
  myPackages: PublishedPackageForTrade[];
  userPhone?: string | null;
  userWhatsapp?: boolean;
}

export function MutualMatchCard({
  match,
  myPackages,
  userPhone,
  userWhatsapp,
}: MutualMatchCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const topTheirPackage = match.theirMatchingPackages[0];
  const partnerSlug = generatePackageSlug(match.businessName || match.displayName || 'partner');

  // Map myPackages for ProposeTradeDialog
  const myPackageOptions = myPackages.map((p) => ({
    packageId: p.packageId,
    packageVersionId: p.packageVersionId,
    title: p.title,
    summary: p.summary,
    categoryId: p.categoryId,
    indicativeValueMinor: p.indicativeValueMinor,
    currencyCode: p.currencyCode,
    capacityPerMonth: p.capacityPerMonth,
  }));

  return (
    <div className="rounded-card border border-border bg-surface p-6 shadow-elevation-1 space-y-5 text-start hover:border-pine-300 transition-colors">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-pine-100 text-pine-800 border border-pine-200 flex items-center justify-center font-bold text-base shrink-0">
            {match.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-bold text-ink leading-snug">
              <Link
                href={`/providers/${match.counterpartyId}/${partnerSlug}`}
                className="hover:text-pine-600 transition-colors"
              >
                {match.displayName}
              </Link>
            </h3>
            {match.businessName && (
              <p className="text-xs text-text-secondary">{match.businessName}</p>
            )}
            {(match.cityName || match.areaName) && (
              <p className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {[match.areaName, match.cityName].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold border border-pine-300 bg-pine-50/60 text-pine-800 shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-pine-700" />
          {match.matchStrength} Mutual Match{match.matchStrength > 1 ? 'es' : ''}
        </span>
      </div>

      {/* Match details columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* They offer what you seek */}
        <div className="p-3.5 rounded-card border border-border bg-surface-sunken/40 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-pine-700 dark:text-pine-400">
            They Offer (You Seek)
          </span>
          <div className="space-y-1">
            {match.theirMatchingPackages.map((p) => (
              <div key={p.id} className="flex items-start gap-1.5 text-xs text-ink font-medium">
                <Package className="h-3.5 w-3.5 text-pine-600 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{p.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* You offer what they seek */}
        <div className="p-3.5 rounded-card border border-border bg-surface-sunken/40 space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
            You Offer (They Seek)
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-pine-600 shrink-0" />
              <span>
                {match.myMatchingPackages.length} of your published packages match their barter wishlist
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">
          High double-coincidence of wants
        </span>
        {topTheirPackage ? (
          <div>
            <Button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className="bg-pine-600 hover:bg-pine-700 text-white text-xs h-9 gap-1.5"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Propose Trade
            </Button>

            <ProposeTradeDialog
              recipientProviderId={match.counterpartyId}
              recipientProviderName={match.displayName}
              recipientPackage={{
                packageId: topTheirPackage.id,
                packageVersionId: topTheirPackage.id,
                title: topTheirPackage.title,
                indicativeValueMinor: null,
                currencyCode: 'KES',
                seekingCategoryIds: [],
              }}
              myPackages={myPackageOptions}
              userPhone={userPhone}
              userWhatsapp={userWhatsapp}
            />
          </div>
        ) : (
          <Link
            href="/explore"
            className="text-xs font-semibold text-pine-700 hover:text-pine-900 inline-flex items-center gap-1"
          >
            <span>View Listings</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

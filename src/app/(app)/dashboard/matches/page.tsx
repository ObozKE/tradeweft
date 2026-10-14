import React from 'react';
import Link from 'next/link';
import { requireOnboardedUser } from '@/server/dal';
import { createClient } from '@/lib/supabase/server';
import { getMutualMatches } from '@/features/agreements/queries/match.queries';
import { getProviderPublishedPackagesForTrade } from '@/features/agreements/queries/agreement.queries';
import { MutualMatchCard } from '@/features/agreements/components/MutualMatchCard';
import {
  Sparkles,
  ArrowLeft,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export default async function MatchesPage() {
  const { user } = await requireOnboardedUser();

  const [matches, myPackages] = await Promise.all([
    getMutualMatches(20),
    getProviderPublishedPackagesForTrade(user.id),
  ]);

  const supabase = await createClient();
  const { data: userContact } = await supabase
    .from('profile_contacts')
    .select('phone_e164, whatsapp')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 text-start">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-pine-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <span className="text-xs text-text-muted flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-pine-600" />
          Same-Country Rule Enforced
        </span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-pine-600" />
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Mutual Matches
          </h1>
        </div>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">
          Double-coincidence of wants engine. These providers offer services in categories you are seeking,
          and are actively seeking services in categories you provide.
        </p>
      </div>

      {/* Matches Grid */}
      {matches.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-12 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-pine-50 border border-pine-200 text-pine-700 flex items-center justify-center mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-ink">No Mutual Matches Found Yet</h3>
            <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
              Matchmaking requires two-way category harmony. Make sure you have published service packages
              and specified 1-5 categories you are seeking in return.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/dashboard/packages"
              className="inline-flex items-center gap-2 rounded-button bg-pine-600 hover:bg-pine-700 text-white px-4 py-2 text-xs font-semibold transition-colors"
            >
              <Layers className="h-4 w-4" />
              Manage My Packages & Seeking Categories
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match) => (
            <MutualMatchCard
              key={match.counterpartyId}
              match={match}
              myPackages={myPackages}
              userPhone={userContact?.phone_e164 || null}
              userWhatsapp={userContact?.whatsapp ?? true}
            />
          ))}
        </div>
      )}
    </div>
  );
}

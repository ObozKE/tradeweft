import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ProposeTradeDialog } from '@/features/agreements/components/ProposeTradeDialog';
import { getProviderPublishedPackagesForTrade } from '@/features/agreements/queries/agreement.queries';
import { ArrowLeftRight, UserCheck } from 'lucide-react';

export interface TradeActionSlotProps {
  packageId: string;
  providerId: string;
}

/**
 * Phase 3 Barter Trade Action Slot:
 * Plugs the interactive "Propose a Trade" initiation flow directly into the package detail page.
 */
export async function TradeActionSlot({ packageId, providerId }: TradeActionSlotProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Unauthenticated Visitor
  if (!user) {
    return (
      <Link href={`/login?next=/packages/${packageId}`} className="block w-full">
        <Button
          variant="primary"
          className="w-full h-12 text-sm font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Sign In to Propose Trade
        </Button>
      </Link>
    );
  }

  // 2. Package Owner (Cannot trade with yourself)
  if (user.id === providerId) {
    return (
      <div className="rounded-button border border-border bg-surface-sunken p-3 text-center">
        <p className="text-xs text-text-muted flex items-center justify-center gap-1.5 font-medium">
          <UserCheck className="h-4 w-4 text-pine-600" />
          This is your own package. You cannot trade with yourself.
        </p>
      </div>
    );
  }

  // 3. Fetch package data and latest published version
  const { data: recipientPkg } = await supabase
    .from('service_packages')
    .select(`
      id,
      title,
      indicative_value_minor,
      currency_code,
      provider:profiles!service_packages_provider_id_fkey (display_name),
      service_package_versions (
        id,
        version_number
      ),
      service_package_seeking_categories (category_id)
    `)
    .eq('id', packageId)
    .single();

  if (!recipientPkg) {
    return null;
  }

  const versions = recipientPkg.service_package_versions || [];
  const latestVer = versions.sort((a: any, b: any) => b.version_number - a.version_number)[0];

  if (!latestVer) {
    return (
      <div className="rounded-button border border-border bg-surface-sunken p-3 text-center">
        <p className="text-xs text-text-muted">
          This package is not currently available for trade proposals.
        </p>
      </div>
    );
  }

  const seekingCategoryIds = (recipientPkg.service_package_seeking_categories || []).map(
    (sc: any) => sc.category_id
  );

  // 4. Fetch the proposer's own published packages
  const myPackages = await getProviderPublishedPackagesForTrade(user.id);

  // 5. Fetch proposer's contact preferences
  const { data: contact } = await supabase
    .from('profile_contacts')
    .select('phone_e164, whatsapp')
    .eq('user_id', user.id)
    .single();

  // 6. Fetch recipient's reputation
  const { data: recipientRep } = await supabase
    .from('provider_reputation')
    .select('score, tier, is_score_visible')
    .eq('provider_id', providerId)
    .single();

  const providerName = (recipientPkg.provider as any)?.display_name || 'Provider';

  return (
    <ProposeTradeDialog
      recipientProviderId={providerId}
      recipientProviderName={providerName}
      recipientReputationTier={recipientRep?.tier ?? 'new'}
      recipientReliabilityScore={recipientRep?.score ?? null}
      recipientScoreVisible={recipientRep?.is_score_visible ?? false}
      recipientPackage={{
        packageId,
        packageVersionId: latestVer.id,
        title: recipientPkg.title,
        indicativeValueMinor: recipientPkg.indicative_value_minor
          ? Number(recipientPkg.indicative_value_minor)
          : null,
        currencyCode: recipientPkg.currency_code,
        seekingCategoryIds,
      }}
      myPackages={myPackages}
      userPhone={contact?.phone_e164 || null}
      userWhatsapp={contact?.whatsapp ?? true}
    />
  );
}

import React from 'react';
import type { Metadata } from 'next';
import { requireOnboardedUser } from '@/server/dal';
import { VerificationManager } from '@/features/verification/components/VerificationManager';

export const metadata: Metadata = {
  title: 'Portfolio Verification | Trade Weft',
  description: 'Manage verified external accounts and proof of work for your Trade Weft provider profile.',
};

export default async function DashboardVerificationPage() {
  const { user, profile, supabase } = await requireOnboardedUser();

  // 1. Fetch provider's portfolio links
  const { data: links } = await supabase
    .from('portfolio_links')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 2. Fetch provider's verification aggregate
  const { data: pv } = await supabase
    .from('provider_verification')
    .select('*')
    .eq('provider_id', user.id)
    .maybeSingle();

  // 3. Fetch country publish gate setting
  const { data: country } = await supabase
    .from('countries')
    .select('publish_gate')
    .eq('code', profile.country_code || 'KE')
    .maybeSingle();

  const aggregateStatus = pv?.status || 'none';
  const verifiedCount = pv?.verified_link_count || 0;
  const countryGateMode = country?.publish_gate || 'link_pending_or_verified';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Portfolio & Proof of Work Verification
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Verify external developer, design, and social platform accounts to build immediate buyer trust.
        </p>
      </div>

      <VerificationManager
        initialLinks={links || []}
        aggregateStatus={aggregateStatus}
        verifiedCount={verifiedCount}
        countryGateMode={countryGateMode}
      />
    </div>
  );
}

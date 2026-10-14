import React from 'react';
import { notFound } from 'next/navigation';
import { requireOnboardedUser } from '@/server/dal';
import { createClient } from '@/lib/supabase/server';
import {
  getAgreementDetail,
  getProviderPublishedPackagesForTrade,
} from '@/features/agreements/queries/agreement.queries';
import { TradeRoomHeader } from '@/features/agreements/components/TradeRoomHeader';
import { BalanceMeter } from '@/features/agreements/components/BalanceMeter';
import { ContactRevealCard } from '@/features/agreements/components/ContactRevealCard';
import { FulfilmentSteps } from '@/features/agreements/components/FulfilmentSteps';
import { AgreementTimeline } from '@/features/agreements/components/AgreementTimeline';

interface TradeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TradeDetailPage({ params }: TradeDetailPageProps) {
  const { id } = await params;
  const { user } = await requireOnboardedUser();

  const agreement = await getAgreementDetail(id, user.id);
  if (!agreement) {
    notFound();
  }

  // Fetch published packages for counter-offer modal
  const [myPackages, counterpartyPackages] = await Promise.all([
    getProviderPublishedPackagesForTrade(user.id),
    getProviderPublishedPackagesForTrade(agreement.counterparty.id),
  ]);

  // Fetch current user contact preferences if any
  const supabase = await createClient();
  const { data: userContact } = await supabase
    .from('profile_contacts')
    .select('phone_e164, whatsapp')
    .eq('user_id', user.id)
    .single();

  const isProposer = agreement.myRole === 'proposer';
  const myGivesSide = isProposer ? 'proposer_gives' : 'recipient_gives';
  const theirGivesSide = isProposer ? 'recipient_gives' : 'proposer_gives';

  const myLinesForMeter = agreement.currentRevision.lines
    .filter((l) => l.side === myGivesSide)
    .map((l) => ({
      indicativeValueMinor: l.indicativeValueMinor,
      quantity: l.quantity,
    }));

  const theirLinesForMeter = agreement.currentRevision.lines
    .filter((l) => l.side === theirGivesSide)
    .map((l) => ({
      indicativeValueMinor: l.indicativeValueMinor,
      quantity: l.quantity,
    }));

  const currencyCode = agreement.currentRevision.lines[0]?.currencyCode || 'KES';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header and Action Controls */}
      <TradeRoomHeader
        agreement={agreement}
        myPackages={myPackages}
        counterpartyPackages={counterpartyPackages}
        userPhone={userContact?.phone_e164 || null}
        userWhatsapp={userContact?.whatsapp ?? true}
      />

      {/* Agreed / Proposed Balance Meter */}
      <div className="rounded-card border border-border bg-surface p-6 shadow-elevation-1 space-y-4 text-start">
        <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary">
          {agreement.status === 'active' || agreement.status === 'completed'
            ? 'Contract Scope & Balance'
            : `Current Terms (Revision #${agreement.currentRevisionNo})`}
        </h3>
        <BalanceMeter
          myLines={myLinesForMeter}
          theirLines={theirLinesForMeter}
          currencyCode={currencyCode}
        />
      </div>

      {/* Contact Reveal Card (reveals once trade is accepted) */}
      <ContactRevealCard
        counterpartyName={agreement.counterparty.displayName}
        contact={agreement.contact}
      />

      {/* Fulfilment Milestones (Active / Completed / Disputed) */}
      {['active', 'completed', 'disputed'].includes(agreement.status) && (
        <FulfilmentSteps agreement={agreement} />
      )}

      {/* Negotiation History & Revision Timeline */}
      <div className="space-y-4 text-start">
        <h3 className="text-lg font-bold tracking-tight text-ink">
          Negotiation History & Scope Revisions
        </h3>
        <AgreementTimeline
          revisions={agreement.revisions}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}

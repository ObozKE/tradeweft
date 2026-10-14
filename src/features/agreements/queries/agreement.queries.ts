import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type {
  AgreementDetail,
  AgreementListItem,
  AgreementRevisionItem,
  AgreementLineItem,
  AgreementFulfilmentItem,
  CounterpartyContact,
} from '../types/agreement.types';

/**
 * Fetches trades for the authenticated user partitioned by tab.
 */
export async function getAgreementsForUser(
  userId: string,
  tab: 'needs_response' | 'waiting' | 'active' | 'closed' = 'needs_response'
): Promise<AgreementListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('agreements')
    .select(`
      id,
      status,
      current_revision_no,
      turn_user_id,
      proposer_id,
      recipient_id,
      expires_at,
      updated_at,
      created_at,
      proposer:profiles!agreements_proposer_id_fkey (
        id, display_name, business_name, avatar_url
      ),
      recipient:profiles!agreements_recipient_id_fkey (
        id, display_name, business_name, avatar_url
      ),
      agreement_revisions:agreement_revisions!agreement_revisions_agreement_id_fkey (
        revision_no,
        agreement_lines (
          side,
          quantity,
          package_version:service_package_versions!agreement_lines_package_version_id_fkey (
            snapshot
          )
        )
      )
    `)
    .or(`proposer_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (tab === 'needs_response') {
    query = query.eq('status', 'proposed').eq('turn_user_id', userId);
  } else if (tab === 'waiting') {
    query = query.eq('status', 'proposed').neq('turn_user_id', userId);
  } else if (tab === 'active') {
    query = query.eq('status', 'active');
  } else if (tab === 'closed') {
    query = query.in('status', ['completed', 'declined', 'withdrawn', 'expired', 'cancelled', 'disputed']);
  }

  const { data, error } = await query;

  if (error || !data) {
    logger.error({ userId, error: error?.message, event: 'agreements.list_fetch_failed' });
    return [];
  }

  return (data as any[]).map((agr: any) => {
    const isProposer = agr.proposer_id === userId;
    const counterpartyProfile = isProposer ? agr.recipient : agr.proposer;
    const isMyTurn = agr.turn_user_id === userId;

    // Latest revision lines
    const latestRev = agr.agreement_revisions?.find(
      (r: any) => r.revision_no === agr.current_revision_no
    ) || agr.agreement_revisions?.[0];

    const lines = latestRev?.agreement_lines || [];
    const mySide = isProposer ? 'proposer_gives' : 'recipient_gives';
    const theirSide = isProposer ? 'recipient_gives' : 'proposer_gives';

    const myLines = lines.filter((l: any) => l.side === mySide);
    const theirLines = lines.filter((l: any) => l.side === theirSide);

    let myTotalMinor: number | null = 0;
    for (const l of myLines) {
      const snap = l.package_version?.snapshot || {};
      if (snap.indicative_value_minor === null || snap.indicative_value_minor === undefined) {
        myTotalMinor = null;
        break;
      }
      myTotalMinor = (myTotalMinor ?? 0) + Number(snap.indicative_value_minor) * l.quantity;
    }

    let theirTotalMinor: number | null = 0;
    for (const l of theirLines) {
      const snap = l.package_version?.snapshot || {};
      if (snap.indicative_value_minor === null || snap.indicative_value_minor === undefined) {
        theirTotalMinor = null;
        break;
      }
      theirTotalMinor = (theirTotalMinor ?? 0) + Number(snap.indicative_value_minor) * l.quantity;
    }

    const firstSnap = lines[0]?.package_version?.snapshot || {};
    const currencyCode = firstSnap.currency_code || 'KES';

    const givingTitles = myLines
      .map((l: any) => `${l.quantity}x ${l.package_version?.snapshot?.title || 'Service'}`)
      .join(', ');
    const receivingTitles = theirLines
      .map((l: any) => `${l.quantity}x ${l.package_version?.snapshot?.title || 'Service'}`)
      .join(', ');

    return {
      id: agr.id,
      status: agr.status,
      currentRevisionNo: agr.current_revision_no,
      turnUserId: agr.turn_user_id,
      isMyTurn,
      myRole: isProposer ? 'proposer' : 'recipient',
      counterparty: {
        id: counterpartyProfile?.id || '',
        displayName: counterpartyProfile?.display_name || 'Counterparty',
        businessName: counterpartyProfile?.business_name || null,
        avatarUrl: counterpartyProfile?.avatar_url || null,
      },
      givingLinesSummary: givingTitles || 'None specified',
      receivingLinesSummary: receivingTitles || 'None specified',
      myTotalValueMinor: myTotalMinor,
      theirTotalValueMinor: theirTotalMinor,
      currencyCode,
      expiresAt: agr.expires_at,
      updatedAt: agr.updated_at,
      createdAt: agr.created_at,
    };
  });
}

/**
 * Fetches full agreement details with revisions, lines, fulfilment, and counterparty metadata.
 * Strict IDOR: returns null if user is not a party.
 */
export async function getAgreementDetail(
  agreementId: string,
  userId: string
): Promise<AgreementDetail | null> {
  const supabase = await createClient();

  const { data: agr, error } = await supabase
    .from('agreements')
    .select(`
      *,
      proposer:profiles!agreements_proposer_id_fkey (
        id, display_name, business_name, avatar_url, city_id, area_id
      ),
      recipient:profiles!agreements_recipient_id_fkey (
        id, display_name, business_name, avatar_url, city_id, area_id
      ),
      agreement_revisions:agreement_revisions!agreement_revisions_agreement_id_fkey (
        id,
        revision_no,
        authored_by,
        note,
        created_at,
        agreement_lines (
          id,
          side,
          package_version_id,
          quantity,
          package_version:service_package_versions!agreement_lines_package_version_id_fkey (
            id,
            snapshot
          )
        )
      ),
      agreement_fulfilment (
        side,
        giving_user_id,
        receiving_user_id,
        delivered_marked_at,
        delivered_marked_by,
        receipt_confirmed_at,
        receipt_confirmed_by
      )
    `)
    .eq('id', agreementId)
    .single();

  if (error || !agr) {
    if (error) {
      logger.error({ agreementId, userId, error: error.message, event: 'agreement.detail_fetch_failed' });
    }
    return null;
  }

  // Strict party verification
  if (agr.proposer_id !== userId && agr.recipient_id !== userId) {
    return null;
  }

  const isProposer = agr.proposer_id === userId;
  const counterpartyProfile = isProposer ? agr.recipient : agr.proposer;
  const isMyTurn = agr.turn_user_id === userId;

  // Process revisions
  const rawRevisions: any[] = Array.isArray(agr.agreement_revisions)
    ? agr.agreement_revisions
    : agr.agreement_revisions
    ? [agr.agreement_revisions]
    : [];
  const revisions: AgreementRevisionItem[] = rawRevisions
    .sort((a: any, b: any) => a.revision_no - b.revision_no)
    .map((r: any) => {
      const lines: AgreementLineItem[] = (r.agreement_lines || []).map((l: any) => {
        const snap = l.package_version?.snapshot || {};
        return {
          id: l.id,
          side: l.side,
          packageVersionId: l.package_version_id,
          quantity: l.quantity,
          title: snap.title || 'Service Offering',
          summary: snap.summary || '',
          indicativeValueMinor: snap.indicative_value_minor ? Number(snap.indicative_value_minor) : null,
          currencyCode: snap.currency_code || 'KES',
          categoryName: snap.category_id || 'General',
          deliveryMode: snap.delivery_mode || 'remote',
          turnaroundDays: snap.turnaround_days || 7,
          deliverables: Array.isArray(snap.deliverables) ? snap.deliverables : [],
        };
      });

      return {
        id: r.id,
        revisionNo: r.revision_no,
        authoredBy: r.authored_by,
        note: r.note,
        createdAt: r.created_at,
        lines,
      };
    });

  const currentRevision =
    revisions.find((r) => r.revisionNo === agr.current_revision_no) ||
    revisions[revisions.length - 1] || {
      id: '',
      revisionNo: 1,
      authoredBy: agr.proposer_id,
      note: null,
      createdAt: agr.created_at,
      lines: [],
    };

  const fulfilment: AgreementFulfilmentItem[] = (agr.agreement_fulfilment || []).map((f: any) => ({
    side: f.side,
    givingUserId: f.giving_user_id,
    receivingUserId: f.receiving_user_id,
    deliveredMarkedAt: f.delivered_marked_at,
    deliveredMarkedBy: f.delivered_marked_by,
    receiptConfirmedAt: f.receipt_confirmed_at,
    receiptConfirmedBy: f.receipt_confirmed_by,
  }));

  // Fetch revealed contact if active/completed/disputed
  let contact: CounterpartyContact | null = null;
  if (['active', 'completed', 'disputed'].includes(agr.status)) {
    const { data: contactData } = await supabase.rpc('get_counterparty_contact', {
      p_agreement_id: agreementId,
    });
    contact = (contactData as unknown as CounterpartyContact) || null;
  }

  return {
    id: agr.id,
    countryCode: agr.country_code,
    proposerId: agr.proposer_id,
    recipientId: agr.recipient_id,
    status: agr.status,
    currentRevisionNo: agr.current_revision_no,
    turnUserId: agr.turn_user_id,
    expiresAt: agr.expires_at,
    acceptedRevisionId: agr.accepted_revision_id,
    termsHash: agr.terms_hash,
    tradeTermsVersion: agr.trade_terms_version,
    acceptedAt: agr.accepted_at,
    completedAt: agr.completed_at,
    cancellationRequestedBy: agr.cancellation_requested_by,
    cancellationReason: agr.cancellation_reason,
    cancelledAt: agr.cancelled_at,
    disputedBy: agr.disputed_by,
    disputeReason: agr.dispute_reason,
    disputedAt: agr.disputed_at,
    createdAt: agr.created_at,
    updatedAt: agr.updated_at,
    isMyTurn,
    myRole: isProposer ? 'proposer' : 'recipient',
    counterparty: {
      id: counterpartyProfile?.id || '',
      displayName: counterpartyProfile?.display_name || 'Counterparty',
      businessName: counterpartyProfile?.business_name || null,
      avatarUrl: counterpartyProfile?.avatar_url || null,
      cityName: null,
      areaName: null,
    },
    revisions,
    currentRevision,
    fulfilment,
    contact,
  };
}

/**
 * Fetches published packages belonging to a user with their latest published version snapshot.
 * Used to populate the "Propose a Trade" and "Counter-Offer" package pickers.
 */
export async function getProviderPublishedPackagesForTrade(providerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('service_packages')
    .select(`
      id,
      title,
      summary,
      category_id,
      delivery_mode,
      turnaround_days,
      capacity_per_month,
      indicative_value_minor,
      currency_code,
      service_package_versions!inner (
        id,
        version_number,
        snapshot
      )
    `)
    .eq('provider_id', providerId)
    .eq('status', 'published')
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((pkg: any) => {
    const versions = pkg.service_package_versions || [];
    const latestVersion = versions.sort((a: any, b: any) => b.version_number - a.version_number)[0];

    return {
      packageId: pkg.id,
      packageVersionId: latestVersion?.id,
      title: pkg.title,
      summary: pkg.summary,
      categoryId: pkg.category_id,
      deliveryMode: pkg.delivery_mode,
      turnaroundDays: pkg.turnaround_days,
      capacityPerMonth: pkg.capacity_per_month,
      indicativeValueMinor: pkg.indicative_value_minor ? Number(pkg.indicative_value_minor) : null,
      currencyCode: pkg.currency_code,
    };
  });
}

import type { AgreementStatus, AgreementSide, ContactChannel } from '@/lib/supabase/database.types';

export type { AgreementStatus, AgreementSide, ContactChannel };

export interface AgreementLineInput {
  packageVersionId: string;
  quantity: number;
}

export interface ProposalInput {
  recipientId: string;
  proposerLines: AgreementLineInput[];
  recipientLines: AgreementLineInput[];
  note?: string;
  consentedChannels?: ContactChannel[];
  idempotencyKey?: string;
}

export interface CounterInput {
  agreementId: string;
  expectedRevisionNo: number;
  proposerLines: AgreementLineInput[];
  recipientLines: AgreementLineInput[];
  note?: string;
  idempotencyKey?: string;
}

export interface AcceptInput {
  agreementId: string;
  expectedRevisionNo: number;
  consentedChannels?: ContactChannel[];
  idempotencyKey?: string;
}

export interface AgreementLineItem {
  id: string;
  side: AgreementSide;
  packageVersionId: string;
  quantity: number;
  title: string;
  summary: string;
  indicativeValueMinor: number | null;
  currencyCode: string;
  categoryName: string;
  deliveryMode: 'in_person' | 'remote' | 'hybrid';
  turnaroundDays: number;
  deliverables: string[];
}

export interface PublishedPackageForTrade {
  packageId: string;
  packageVersionId: string;
  title: string;
  summary: string;
  categoryId: string;
  deliveryMode: 'in_person' | 'remote' | 'hybrid';
  turnaroundDays: number;
  capacityPerMonth: number | null;
  indicativeValueMinor: number | null;
  currencyCode: string;
}

export interface AgreementRevisionItem {
  id: string;
  revisionNo: number;
  authoredBy: string;
  note: string | null;
  createdAt: string;
  lines: AgreementLineItem[];
}

export interface AgreementFulfilmentItem {
  side: AgreementSide;
  givingUserId: string;
  receivingUserId: string;
  deliveredMarkedAt: string | null;
  deliveredMarkedBy: string | null;
  receiptConfirmedAt: string | null;
  receiptConfirmedBy: string | null;
}

export interface CounterpartyContact {
  revealed: boolean;
  userId?: string;
  channels?: ContactChannel[];
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  reason?: string;
}

export interface AgreementDetail {
  id: string;
  countryCode: string;
  proposerId: string;
  recipientId: string;
  status: AgreementStatus;
  currentRevisionNo: number;
  turnUserId: string;
  expiresAt: string;
  acceptedRevisionId: string | null;
  termsHash: string | null;
  tradeTermsVersion: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancellationRequestedBy: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  disputedBy: string | null;
  disputeReason: string | null;
  disputedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isMyTurn: boolean;
  myRole: 'proposer' | 'recipient';
  counterparty: {
    id: string;
    displayName: string;
    businessName: string | null;
    avatarUrl: string | null;
    cityName: string | null;
    areaName: string | null;
  };
  revisions: AgreementRevisionItem[];
  currentRevision: AgreementRevisionItem;
  fulfilment: AgreementFulfilmentItem[];
  contact: CounterpartyContact | null;
}

export interface AgreementListItem {
  id: string;
  status: AgreementStatus;
  currentRevisionNo: number;
  turnUserId: string;
  isMyTurn: boolean;
  myRole: 'proposer' | 'recipient';
  counterparty: {
    id: string;
    displayName: string;
    businessName: string | null;
    avatarUrl: string | null;
  };
  givingLinesSummary: string;
  receivingLinesSummary: string;
  myTotalValueMinor: number | null;
  theirTotalValueMinor: number | null;
  currencyCode: string;
  expiresAt: string;
  updatedAt: string;
  createdAt: string;
}

export interface MutualMatchItem {
  counterpartyId: string;
  displayName: string;
  businessName: string | null;
  avatarUrl: string | null;
  cityName: string | null;
  areaName: string | null;
  matchStrength: number;
  myMatchingPackages: Array<{ id: string; categoryId: string }>;
  theirMatchingPackages: Array<{ id: string; title: string; categoryId: string }>;
}

export interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

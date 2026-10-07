/**
 * Trade Weft Pan-African Payment Provider Abstraction
 *
 * Designed to support M-Pesa (Safaricom Daraja) in Kenya first,
 * followed by MTN MoMo, Airtel Money, Flutterwave, and Paystack across Africa.
 */

import type { Result } from '@/lib/errors';

export type SupportedCurrency = 'KES' | 'UGX' | 'TZS' | 'NGN' | 'GHS' | 'ZAR' | 'USD';

export interface MoneyAmount {
  /**
   * Stored as integer minor units (e.g., 50000 = 500.00 KES)
   */
  amountMinor: number;
  currency: SupportedCurrency;
}

export type EscrowStatus =
  | 'pending'
  | 'held_in_escrow'
  | 'released_to_provider'
  | 'refunded_to_sender'
  | 'disputed';

export interface EscrowDepositRequest {
  tradeAgreementId: string;
  senderUserId: string;
  recipientUserId: string;
  amount: MoneyAmount;
  payerPhoneNumber?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface EscrowDepositResponse {
  transactionId: string;
  providerReference: string;
  status: EscrowStatus;
  checkoutUrl?: string;
  promptSentToPhone?: boolean;
}

export interface WebhookValidationResult {
  isValid: boolean;
  event?: {
    eventType: 'payment.success' | 'payment.failed' | 'escrow.released';
    transactionId: string;
    amount: MoneyAmount;
    rawPayload: unknown;
  };
}

export interface PaymentProvider {
  /**
   * Unique identifier for the payment provider adapter
   */
  readonly id: 'mpesa_daraja' | 'airtel_money' | 'mtn_momo' | 'flutterwave' | 'paystack';

  /**
   * ISO 3166-1 alpha-2 country codes supported by this provider
   */
  readonly supportedCountries: string[];

  /**
   * Initiates an escrow deposit from a barter participant
   */
  initiateEscrowDeposit(
    request: EscrowDepositRequest
  ): Promise<Result<EscrowDepositResponse>>;

  /**
   * Verifies incoming webhook signatures (e.g., Daraja STK callback or Flutterwave secret hash)
   */
  verifyWebhookSignature(headers: Headers, rawBody: string): boolean;

  /**
   * Processes a webhook payload and returns normalized transaction state
   */
  handleWebhook(rawBody: string): Promise<Result<WebhookValidationResult>>;

  /**
   * Releases held escrow funds to the service provider once the barter is completed
   */
  releaseEscrow(
    transactionId: string,
    recipientAccountId: string
  ): Promise<Result<{ released: boolean }>>;

  /**
   * Refunds held escrow funds to the sender in case of an agreed trade cancellation
   */
  refundEscrow(
    transactionId: string,
    reason: string
  ): Promise<Result<{ refunded: boolean }>>;
}

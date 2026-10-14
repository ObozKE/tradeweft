import type { Database } from '@/lib/supabase/database.types';

export type PaymentProviderCode = Database['public']['Enums']['payment_provider_code'];
export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type PaymentPurpose = Database['public']['Enums']['payment_purpose'];
export type LedgerEntryType = Database['public']['Enums']['ledger_entry_type'];
export type PromotionStatus = Database['public']['Enums']['promotion_status'];
export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];
export type BillingMode = Database['public']['Enums']['billing_mode'];

export type PaymentRow = Database['public']['Tables']['payments']['Row'];
export type PriceBookRow = Database['public']['Tables']['price_book']['Row'];
export type AdProductRow = Database['public']['Tables']['ad_products']['Row'];
export type PlanRow = Database['public']['Tables']['plans']['Row'];
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
export type SubscriptionInvoiceRow = Database['public']['Tables']['subscription_invoices']['Row'];
export type ListingPromotionRow = Database['public']['Tables']['listing_promotions']['Row'];
export type PaymentLedgerRow = Database['public']['Tables']['payment_ledger']['Row'];

export interface PlanEntitlements {
  rank_bonus_days: number;
  max_active_packages: number;
  max_concurrent_top_ads: number;
  analytics_level: 'basic' | 'pro' | 'enterprise';
  csv_export: boolean;
}

export interface UserEntitlements extends PlanEntitlements {
  plan_id: string;
  is_subscribed: boolean;
  in_grace: boolean;
  status: SubscriptionStatus | 'none';
}

export interface TaxBreakdown {
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  taxRateBps: number;
  taxInclusive: boolean;
}

export interface PaymentInitiationResult {
  paymentId: string;
  status: PaymentStatus;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  customerMessage?: string;
}

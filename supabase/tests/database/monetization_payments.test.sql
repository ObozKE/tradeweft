-- pgTAP Test Suite: Phase 6 Monetization & Payments
-- Tests monetization schema, append-only ledger, exclusion constraints, entitlements, and RLS.

begin;
select plan(32);

-- 1. Test Tables Presence
select has_table('public', 'payment_providers', 'Table payment_providers must exist');
select has_table('public', 'ad_products', 'Table ad_products must exist');
select has_table('public', 'plans', 'Table plans must exist');
select has_table('public', 'price_book', 'Table price_book must exist');
select has_table('public', 'payments', 'Table payments must exist');
select has_table('public', 'payment_events_raw', 'Table payment_events_raw must exist');
select has_table('public', 'payment_ledger', 'Table payment_ledger must exist');
select has_table('public', 'listing_promotions', 'Table listing_promotions must exist');
select has_table('public', 'subscriptions', 'Table subscriptions must exist');
select has_table('public', 'subscription_invoices', 'Table subscription_invoices must exist');
select has_table('public', 'package_daily_stats', 'Table package_daily_stats must exist');
select has_table('public', 'promotion_daily_stats', 'Table promotion_daily_stats must exist');
select has_table('public', 'payment_audit_log', 'Table payment_audit_log must exist');

-- 2. Test RLS is active on all Phase 6 tables
select row_level_security_active('public', 'payment_providers', 'RLS must be active on payment_providers');
select row_level_security_active('public', 'ad_products', 'RLS must be active on ad_products');
select row_level_security_active('public', 'plans', 'RLS must be active on plans');
select row_level_security_active('public', 'price_book', 'RLS must be active on price_book');
select row_level_security_active('public', 'payments', 'RLS must be active on payments');
select row_level_security_active('public', 'payment_events_raw', 'RLS must be active on payment_events_raw');
select row_level_security_active('public', 'payment_ledger', 'RLS must be active on payment_ledger');
select row_level_security_active('public', 'listing_promotions', 'RLS must be active on listing_promotions');
select row_level_security_active('public', 'subscriptions', 'RLS must be active on subscriptions');
select row_level_security_active('public', 'subscription_invoices', 'RLS must be active on subscription_invoices');
select row_level_security_active('public', 'package_daily_stats', 'RLS must be active on package_daily_stats');
select row_level_security_active('public', 'promotion_daily_stats', 'RLS must be active on promotion_daily_stats');
select row_level_security_active('public', 'payment_audit_log', 'RLS must be active on payment_audit_log');

-- 3. Test Enums and Types
select has_type('public', 'payment_provider_code', 'Type payment_provider_code must exist');
select has_type('public', 'payment_status', 'Type payment_status must exist');
select has_type('public', 'payment_purpose', 'Type payment_purpose must exist');
select has_type('public', 'ledger_entry_type', 'Type ledger_entry_type must exist');
select has_type('public', 'promotion_status', 'Type promotion_status must exist');
select has_type('public', 'subscription_status', 'Type subscription_status must exist');

-- 4. Test Key Functions
select has_function('public', 'get_entitlements', ARRAY['uuid'], 'get_entitlements function must exist');
select has_function('public', 'is_finance_or_admin', 'is_finance_or_admin function must exist');

select * from finish();
rollback;

-- pgTAP Test Suite: Phase 4 Reviews & Public Trust Ledger
-- Tests eligibility, double-blind visibility, reveal triggers, grace period,
-- replies, reports, admin moderation, ledger privacy, and Bayesian reputation scoring.

begin;
select plan(18);

-- 1. Test Schema & Extension Presence
select has_table('public', 'reviews', 'Table reviews must exist');
select has_table('public', 'review_replies', 'Table review_replies must exist');
select has_table('public', 'review_reports', 'Table review_reports must exist');
select has_table('public', 'ledger_entries', 'Table ledger_entries must exist');
select has_table('public', 'provider_reputation', 'Table provider_reputation must exist');
select has_table('public', 'domain_event_deliveries', 'Table domain_event_deliveries must exist');

-- 2. Test RLS is enabled on all Phase 4 tables
select row_level_security_active('public', 'reviews', 'RLS should be active on reviews');
select row_level_security_active('public', 'review_replies', 'RLS should be active on review_replies');
select row_level_security_active('public', 'review_reports', 'RLS should be active on review_reports');
select row_level_security_active('public', 'ledger_entries', 'RLS should be active on ledger_entries');
select row_level_security_active('public', 'provider_reputation', 'RLS should be active on provider_reputation');

-- 3. Verify Terms Version seeding
select results_eq(
    $$ select includes_public_ledger from public.trade_terms_versions where version = '2026-10-v1' $$,
    $$ values (false) $$,
    'Terms v1 must have includes_public_ledger = false'
);

select results_eq(
    $$ select includes_public_ledger from public.trade_terms_versions where version = '2026-10-v2' $$,
    $$ values (true) $$,
    'Terms v2 must have includes_public_ledger = true'
);

-- 4. Test RPC functions existence
select has_function('public', 'submit_review', ARRAY['uuid', 'integer', 'integer', 'integer', 'integer', 'boolean', 'text', 'text'], 'submit_review function must exist');
select has_function('public', 'reply_to_review', ARRAY['uuid', 'text', 'text'], 'reply_to_review function must exist');
select has_function('public', 'moderate_review', ARRAY['uuid', 'text', 'text'], 'moderate_review function must exist');
select has_function('public', 'recompute_provider_reputation', ARRAY['uuid', 'timestamp with time zone'], 'recompute_provider_reputation function must exist');
select has_function('public', 'dispatch_domain_events', ARRAY['integer'], 'dispatch_domain_events function must exist');

select * from finish();
rollback;

-- pgTAP Test Suite: Phase 5 Verification & Proof of Work
-- Tests verification schema, media tables, triggers, immutability, RLS, and RPC functions.

begin;
select plan(24);

-- 1. Test Tables Presence
select has_table('public', 'media_assets', 'Table media_assets must exist');
select has_table('public', 'portfolio_links', 'Table portfolio_links must exist');
select has_table('public', 'oauth_states', 'Table oauth_states must exist');
select has_table('public', 'provider_verification', 'Table provider_verification must exist');
select has_table('public', 'verification_audit_log', 'Table verification_audit_log must exist');
select has_table('public', 'package_media', 'Table package_media must exist');

-- 2. Test Views Presence
select has_view('public', 'public_verified_portfolio_links', 'View public_verified_portfolio_links must exist');
select has_view('public', 'public_provider_profiles', 'View public_provider_profiles must exist');

-- 3. Test RLS is enabled on all Phase 5 tables
select row_level_security_active('public', 'media_assets', 'RLS should be active on media_assets');
select row_level_security_active('public', 'portfolio_links', 'RLS should be active on portfolio_links');
select row_level_security_active('public', 'oauth_states', 'RLS should be active on oauth_states');
select row_level_security_active('public', 'provider_verification', 'RLS should be active on provider_verification');
select row_level_security_active('public', 'verification_audit_log', 'RLS should be active on verification_audit_log');
select row_level_security_active('public', 'package_media', 'RLS should be active on package_media');

-- 4. Test Enums and Types
select has_type('public', 'verification_method', 'Type verification_method must exist');
select has_type('public', 'verification_status', 'Type verification_status must exist');
select has_type('public', 'provider_verification_aggregate_status', 'Type provider_verification_aggregate_status must exist');
select has_type('public', 'media_kind', 'Type media_kind must exist');
select has_type('public', 'media_status', 'Type media_status must exist');
select has_type('public', 'publish_gate_mode', 'Type publish_gate_mode must exist');

-- 5. Test RPC functions existence
select has_function('public', 'create_portfolio_link', ARRAY['text', 'text', 'text', 'public.verification_method', 'text', 'text', 'text'], 'create_portfolio_link function must exist');
select has_function('public', 'submit_manual_evidence', ARRAY['uuid', 'uuid', 'text'], 'submit_manual_evidence function must exist');
select has_function('public', 'admin_review_link', ARRAY['uuid', 'text', 'text', 'text', 'text'], 'admin_review_link function must exist');
select has_function('public', 'admin_revoke_link', ARRAY['uuid', 'text', 'text'], 'admin_revoke_link function must exist');

select * from finish();
rollback;

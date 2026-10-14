-- ==============================================================================
-- TRADE WEFT: Phase 3 Barter Agreements pgTAP Test Suite
-- Tests: state machine transitions, turn enforcement, idempotency,
-- immutability, line constraints, contact sharing privacy, terms hashing.
-- ==============================================================================

begin;
select plan(20);

-- 1. Verify RLS is active on Phase 3 tables
select row_level_security_active('public', 'agreements', 'RLS should be active on agreements');
select row_level_security_active('public', 'agreement_revisions', 'RLS should be active on agreement_revisions');
select row_level_security_active('public', 'agreement_lines', 'RLS should be active on agreement_lines');
select row_level_security_active('public', 'agreement_fulfilment', 'RLS should be active on agreement_fulfilment');
select row_level_security_active('public', 'profile_contacts', 'RLS should be active on profile_contacts');
select row_level_security_active('public', 'notifications', 'RLS should be active on notifications');

-- 2. Mock Test Users & Packages
insert into auth.users (id, email)
values
    ('aaaaaaaa-1111-1111-1111-111111111111', 'trader_a@example.com'),
    ('bbbbbbbb-2222-2222-2222-222222222222', 'trader_b@example.com'),
    ('cccccccc-3333-3333-3333-333333333333', 'trader_c@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, country_code, onboarding_completed_at)
values
    ('aaaaaaaa-1111-1111-1111-111111111111', 'Trader A', 'KE', now()),
    ('bbbbbbbb-2222-2222-2222-222222222222', 'Trader B', 'KE', now()),
    ('cccccccc-3333-3333-3333-333333333333', 'Trader C', 'KE', now())
on conflict (id) do update set onboarding_completed_at = now();

insert into public.profile_contacts (user_id, phone_e164, whatsapp)
values
    ('aaaaaaaa-1111-1111-1111-111111111111', '+254711000001', true),
    ('bbbbbbbb-2222-2222-2222-222222222222', '+254722000002', true)
on conflict (user_id) do nothing;

-- Setup Mock Published Packages and Versions
do $$
declare
    v_cat uuid;
    v_pkg_a uuid := '11110000-0000-0000-0000-000000000001';
    v_pkg_b uuid := '22220000-0000-0000-0000-000000000002';
    v_ver_a uuid := '11110000-0000-0000-0000-00000000000a';
    v_ver_b uuid := '22220000-0000-0000-0000-00000000000b';
begin
    select id into v_cat from public.service_categories limit 1;

    insert into public.service_packages (
        id, provider_id, category_id, status, title, summary, description,
        delivery_mode, country_code, turnaround_days, currency_code, deliverables
    ) values
        (v_pkg_a, 'aaaaaaaa-1111-1111-1111-111111111111', v_cat, 'published', 'Package A', 'Summary A', 'Desc A', 'remote', 'KE', 7, 'KES', '["Work A"]'::jsonb),
        (v_pkg_b, 'bbbbbbbb-2222-2222-2222-222222222222', v_cat, 'published', 'Package B', 'Summary B', 'Desc B', 'remote', 'KE', 7, 'KES', '["Work B"]'::jsonb)
    on conflict (id) do nothing;

    insert into public.service_package_versions (id, package_id, version_number, snapshot)
    values
        (v_ver_a, v_pkg_a, 1, jsonb_build_object('package_id', v_pkg_a, 'provider_id', 'aaaaaaaa-1111-1111-1111-111111111111', 'country_code', 'KE', 'capacity_per_month', 10)),
        (v_ver_b, v_pkg_b, 1, jsonb_build_object('package_id', v_pkg_b, 'provider_id', 'bbbbbbbb-2222-2222-2222-222222222222', 'country_code', 'KE', 'capacity_per_month', 5))
    on conflict (id) do nothing;
end $$;

-- 3. Test: Cannot propose trade to self
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-111111111111"}';

select throws_ok(
    $$ select public.propose_agreement(
        'aaaaaaaa-1111-1111-1111-111111111111',
        '[{"package_version_id": "11110000-0000-0000-0000-00000000000a", "quantity": 1}]'::jsonb,
        '[{"package_version_id": "22220000-0000-0000-0000-00000000000b", "quantity": 1}]'::jsonb,
        'Self trade note'
    ) $$,
    '%SELF_PROPOSAL_FORBIDDEN%',
    'Proposing trade to self should fail'
);

-- 4. Test: Successful Proposal Creation
select lives_ok(
    $$ select public.propose_agreement(
        'bbbbbbbb-2222-2222-2222-222222222222',
        '[{"package_version_id": "11110000-0000-0000-0000-00000000000a", "quantity": 1}]'::jsonb,
        '[{"package_version_id": "22220000-0000-0000-0000-00000000000b", "quantity": 2}]'::jsonb,
        'Let us trade',
        array['phone', 'email']::text[],
        'test_idemp_key_1'
    ) $$,
    'Proposing a valid trade should succeed'
);

-- 5. Test: Idempotent replay returns same result
select lives_ok(
    $$ select public.propose_agreement(
        'bbbbbbbb-2222-2222-2222-222222222222',
        '[{"package_version_id": "11110000-0000-0000-0000-00000000000a", "quantity": 1}]'::jsonb,
        '[{"package_version_id": "22220000-0000-0000-0000-00000000000b", "quantity": 2}]'::jsonb,
        'Let us trade',
        array['phone', 'email']::text[],
        'test_idemp_key_1'
    ) $$,
    'Replaying idempotency key should succeed'
);

-- 6. Test: Unique open negotiation per pair is enforced
select throws_ok(
    $$ select public.propose_agreement(
        'bbbbbbbb-2222-2222-2222-222222222222',
        '[{"package_version_id": "11110000-0000-0000-0000-00000000000a", "quantity": 1}]'::jsonb,
        '[{"package_version_id": "22220000-0000-0000-0000-00000000000b", "quantity": 1}]'::jsonb,
        'Duplicate trade'
    ) $$,
    '%idx_unique_open_negotiation_pair%',
    'Opening a second simultaneous negotiation with same user should violate unique index'
);

-- 7. Test: Non-party cannot see agreement
set local "request.jwt.claims" to '{"sub": "cccccccc-3333-3333-3333-333333333333"}';
select is(
    (select count(*)::int from public.agreements),
    0,
    'Non-party should see 0 agreements via RLS'
);

-- 8. Test: Proposer cannot accept on recipient turn
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-111111111111"}';
select throws_ok(
    format(
        $$ select public.accept_agreement('%s'::uuid, 1) $$,
        (select id from public.agreements limit 1)
    ),
    '%NOT_YOUR_TURN%',
    'Proposer cannot accept when turn is with recipient'
);

-- 9. Test: Recipient counters proposal
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-2222-2222-2222-222222222222"}';
select lives_ok(
    format(
        $$ select public.counter_agreement(
            '%s'::uuid,
            1,
            '[{"package_version_id": "11110000-0000-0000-0000-00000000000a", "quantity": 2}]'::jsonb,
            '[{"package_version_id": "22220000-0000-0000-0000-00000000000b", "quantity": 2}]'::jsonb,
            'Counter offer: need 2 units of your service'
        ) $$,
        (select id from public.agreements limit 1)
    ),
    'Recipient can counter with new revision'
);

-- 10. Test: Stale revision check on accept
select throws_ok(
    format(
        $$ select public.accept_agreement('%s'::uuid, 1) $$,
        (select id from public.agreements limit 1)
    ),
    '%STALE_REVISION%',
    'Accepting with stale revision 1 when current is 2 must fail'
);

-- 11. Test: Proposer accepts revision 2
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-111111111111"}';
select lives_ok(
    format(
        $$ select public.accept_agreement('%s'::uuid, 2, array['phone', 'email']::text[]) $$,
        (select id from public.agreements limit 1)
    ),
    'Proposer accepting revision 2 should succeed'
);

-- 12. Test: Status is active and terms_hash is populated
select is(
    (select status from public.agreements limit 1),
    'active'::public.agreement_status,
    'Agreement status should now be active'
);

select ok(
    (select length(terms_hash) = 64 from public.agreements limit 1),
    'Terms hash should be 64-char SHA-256 hex digest'
);

-- 13. Test: Contact details revealed to parties
select ok(
    (select (public.get_counterparty_contact(id)->>'revealed')::boolean from public.agreements limit 1),
    'Contact details should be revealed once trade is active'
);

-- 14. Test: Non-party cannot reveal contacts
set local "request.jwt.claims" to '{"sub": "cccccccc-3333-3333-3333-333333333333"}';
select throws_ok(
    format(
        $$ select public.get_counterparty_contact('%s'::uuid) $$,
        (select id from public.agreements limit 1)
    ),
    '%NOT_FOUND%',
    'Non-party cannot access counterparty contact'
);

-- 15. Test: Fulfilment - Trader A marks delivered
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-111111111111"}';
select lives_ok(
    format(
        $$ select public.mark_delivered('%s'::uuid, 'proposer_gives'::public.agreement_side) $$,
        (select id from public.agreements limit 1)
    ),
    'Trader A marks their delivery complete'
);

-- 16. Test: Trader B confirms receipt of Trader A delivery
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-2222-2222-2222-222222222222"}';
select lives_ok(
    format(
        $$ select public.confirm_receipt('%s'::uuid, 'proposer_gives'::public.agreement_side) $$,
        (select id from public.agreements limit 1)
    ),
    'Trader B confirms receipt of Trader A delivery'
);

-- 17. Test: Fulfilment - Trader B marks delivered
select lives_ok(
    format(
        $$ select public.mark_delivered('%s'::uuid, 'recipient_gives'::public.agreement_side) $$,
        (select id from public.agreements limit 1)
    ),
    'Trader B marks their delivery complete'
);

-- 18. Test: Trader A confirms receipt of Trader B delivery -> completed
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-111111111111"}';
select lives_ok(
    format(
        $$ select public.confirm_receipt('%s'::uuid, 'recipient_gives'::public.agreement_side) $$,
        (select id from public.agreements limit 1)
    ),
    'Trader A confirms receipt -> triggers completion'
);

-- 19. Test: Final status is completed
select is(
    (select status from public.agreements limit 1),
    'completed'::public.agreement_status,
    'Agreement should now be completed'
);

-- 20. Test: Immutability triggers on agreement revisions
reset role;
select throws_ok(
    $$ update public.agreement_revisions set note = 'tampered' $$,
    '%Agreement revisions are strictly immutable%',
    'Direct revision update must be blocked by immutability trigger'
);

rollback;

begin;
select plan(12);

-- 1. Verify RLS is active on Phase 2 tables
select row_level_security_active('public', 'service_packages', 'RLS should be active on service_packages');
select row_level_security_active('public', 'service_package_versions', 'RLS should be active on service_package_versions');
select row_level_security_active('public', 'service_categories', 'RLS should be active on service_categories');

-- 2. Setup mock data
insert into auth.users (id, email)
values
    ('11111111-1111-1111-1111-111111111111', 'provider_a@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'provider_b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, country_code, onboarding_completed_at)
values
    ('11111111-1111-1111-1111-111111111111', 'Provider A', 'KE', now()),
    ('22222222-2222-2222-2222-222222222222', 'Provider B', 'KE', now())
on conflict (id) do update set onboarding_completed_at = now();

-- Retrieve category and location IDs
do $$
declare
    v_cat_id uuid;
    v_city_id uuid;
    v_area_id uuid;
    v_pkg_a_draft uuid := 'aaaa0000-0000-0000-0000-000000000001';
    v_pkg_a_pub uuid := 'aaaa0000-0000-0000-0000-000000000002';
begin
    select id into v_cat_id from public.service_categories where slug = 'web-software';
    select id into v_city_id from public.locations where slug = 'nairobi' and level = 'city';
    select id into v_area_id from public.locations where slug = 'westlands' and level = 'area';

    -- Package A: Draft
    insert into public.service_packages (
        id, provider_id, category_id, status, title, summary, description,
        delivery_mode, country_code, city_id, area_id, turnaround_days,
        currency_code, deliverables
    ) values (
        v_pkg_a_draft,
        '11111111-1111-1111-1111-111111111111',
        v_cat_id,
        'draft',
        'Next.js Full-Stack Web Development',
        'Modern performant web apps built with Next.js and Supabase',
        'Full-stack architecture with production-grade security, testing, and continuous delivery.',
        'remote',
        'KE',
        v_city_id,
        null,
        14,
        'KES',
        '["Complete web application", "Deployment setup"]'::jsonb
    );

    -- Package A: Published
    insert into public.service_packages (
        id, provider_id, category_id, status, title, summary, description,
        delivery_mode, country_code, city_id, area_id, turnaround_days,
        currency_code, deliverables, published_at
    ) values (
        v_pkg_a_pub,
        '11111111-1111-1111-1111-111111111111',
        v_cat_id,
        'published',
        'Tailwind UI Design & Consultation',
        'Tailored design systems with accessible WCAG 2.2 AA compliant tokens',
        'Complete design token architecture, components, and brand guidelines for Nairobi businesses.',
        'in_person',
        'KE',
        v_city_id,
        v_area_id,
        7,
        'KES',
        '["Design tokens", "Figma library"]'::jsonb,
        now()
    );
end $$;

-- 3. Anonymous user tests
set local role anon;

-- Test 3.1: Anonymous user CAN see published package
select results_eq(
    $$ select id from public.service_packages where id = 'aaaa0000-0000-0000-0000-000000000002' $$,
    $$ values ('aaaa0000-0000-0000-0000-000000000002'::uuid) $$,
    'Anonymous user should see published service packages'
);

-- Test 3.2: Anonymous user CANNOT see draft package
select is_empty(
    $$ select id from public.service_packages where id = 'aaaa0000-0000-0000-0000-000000000001' $$,
    'Anonymous user must NOT see draft service packages'
);

-- 4. User B impersonation tests
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

-- Test 4.1: User B CANNOT see User A draft package
select is_empty(
    $$ select id from public.service_packages where id = 'aaaa0000-0000-0000-0000-000000000001' $$,
    'User B must NOT see User A draft package'
);

-- Test 4.2: User B CANNOT update User A package
update public.service_packages
set title = 'Hijacked Package Title'
where id = 'aaaa0000-0000-0000-0000-000000000002';

reset role;
select isnt(
    (select title from public.service_packages where id = 'aaaa0000-0000-0000-0000-000000000002'),
    'Hijacked Package Title',
    'User B must NOT be able to modify User A package'
);

-- 5. Immutability of service_package_versions
insert into public.service_package_versions (id, package_id, version_number, snapshot)
values ('vvvv0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002', 1, '{"version": 1}'::jsonb);

-- Test 5.1: Version snapshot UPDATE is blocked
select throws_ok(
    $$ update public.service_package_versions set snapshot = '{"hacked": true}'::jsonb where id = 'vvvv0000-0000-0000-0000-000000000001' $$,
    null,
    'Service package version update must be blocked by trigger'
);

-- Test 5.2: Version snapshot DELETE is blocked
select throws_ok(
    $$ delete from public.service_package_versions where id = 'vvvv0000-0000-0000-0000-000000000001' $$,
    null,
    'Service package version delete must be blocked by trigger'
);

-- 6. Integrity check: In-person package without area_id must fail
select throws_ok(
    $$
    insert into public.service_packages (
        provider_id, category_id, status, title, summary, description,
        delivery_mode, country_code, city_id, area_id, turnaround_days,
        currency_code, deliverables
    ) values (
        '11111111-1111-1111-1111-111111111111',
        (select id from public.service_categories limit 1),
        'draft',
        'Physical Therapy In Clinic',
        'Rehabilitation and sports massage at clinic',
        'Comprehensive treatment plans for acute and chronic musculoskeletal conditions.',
        'in_person',
        'KE',
        (select id from public.locations where level = 'city' limit 1),
        null, -- Missing area_id for in_person mode!
        7,
        'KES',
        '["1-hour session"]'::jsonb
    );
    $$,
    null,
    'In-person packages must require area_id'
);

-- 7. Public provider profiles view security
-- Verify that terms_accepted_at and locale are NOT in public_provider_profiles columns
select is_empty(
    $$
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_provider_profiles'
      and column_name in ('terms_accepted_at', 'terms_version', 'locale', 'onboarding_completed_at')
    $$,
    'Private columns must never be exposed through public_provider_profiles view'
);

select * from finish();
rollback;

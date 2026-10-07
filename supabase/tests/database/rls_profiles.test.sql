begin;
select plan(6);

-- 1. Verify RLS is enabled on profiles
select row_level_security_active('public', 'profiles', 'RLS should be active on public.profiles');

-- 2. Setup mock users
-- User A
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'user_a@example.com')
on conflict (id) do nothing;

-- User B
insert into auth.users (id, email)
values ('22222222-2222-2222-2222-222222222222', 'user_b@example.com')
on conflict (id) do nothing;

-- 3. Impersonate User A
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- Test 3.1: User A can read their own profile
select results_eq(
    $$ select id from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
    $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
    'User A should be able to read own profile'
);

-- Test 3.2: User A CANNOT read User B's profile (Zero rows returned)
select is_empty(
    $$ select id from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
    'User A must NOT be able to read User B profile'
);

-- Test 3.3: User A can update their own profile
select lives_ok(
    $$ update public.profiles set display_name = 'User A Updated' where id = '11111111-1111-1111-1111-111111111111' $$,
    'User A should be able to update own profile'
);

-- Test 3.4: User A CANNOT update User B's profile
update public.profiles set display_name = 'Hacked Name' where id = '22222222-2222-2222-2222-222222222222';

-- Reset role to check User B still has original name
reset role;
select isnt(
    (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
    'Hacked Name',
    'User B profile must NOT have been modified by User A'
);

-- Test 3.5: User A cannot insert directly into profiles (only triggers can)
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

select throws_ok(
    $$ insert into public.profiles (id, display_name) values ('33333333-3333-3333-3333-333333333333', 'Rogue User') $$,
    null,
    'Direct insert by authenticated user should be blocked by RLS'
);

select * from finish();
rollback;

begin;
select plan(5);

-- 1. Verify RLS is active on user_roles
select row_level_security_active('public', 'user_roles', 'RLS should be active on public.user_roles');

-- 2. Setup mock user
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'user_a@example.com')
on conflict (id) do nothing;

-- 3. Impersonate User A
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- Test 3.1: User A can view their own roles
select results_eq(
    $$ select role from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111' $$,
    $$ values ('user'::public.app_role) $$,
    'User A should view own role'
);

-- Test 3.2: User A CANNOT escalate privileges by inserting an admin role
select throws_ok(
    $$ insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin'::public.app_role) $$,
    null,
    'User A must NOT be able to insert admin role'
);

-- Test 3.3: User A CANNOT update their role to admin
update public.user_roles set role = 'admin'::public.app_role where user_id = '11111111-1111-1111-1111-111111111111';

reset role;
select isnt(
    (select role from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111'),
    'admin'::public.app_role,
    'User A role must NOT have been updated to admin'
);

-- Test 3.4: User A CANNOT delete their role
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

delete from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111';

reset role;
select is(
    (select count(*)::int from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111'),
    1,
    'User A role must NOT have been deleted'
);

select * from finish();
rollback;

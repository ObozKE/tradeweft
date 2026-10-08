-- Migration 4: Row Level Security (RLS) Policies
-- Enforces zero IDOR at the database engine level using (select auth.uid())

-- Enable RLS on all tables
alter table public.countries enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- 1. Countries: Read-only for authenticated and anonymous users (reference data)
create policy "Allow read access to countries for all users"
    on public.countries
    for select
    to authenticated, anon
    using (true);

-- 2. Locations: Read-only for authenticated and anonymous users (reference data)
create policy "Allow read access to locations for all users"
    on public.locations
    for select
    to authenticated, anon
    using (true);

-- 3. Profiles:
-- Users can only SELECT their own profile
create policy "Users can view own profile"
    on public.profiles
    for select
    to authenticated
    using (id = (select auth.uid()));

-- Users can only UPDATE their own profile
create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

-- Users can insert their own profile (for fallback or pre-trigger users)
create policy "Users can insert own profile"
    on public.profiles
    for insert
    to authenticated
    with check (id = (select auth.uid()));

-- 4. User Roles:
-- Users can only view their own roles
create policy "Users can view own roles"
    on public.user_roles
    for select
    to authenticated
    using (user_id = (select auth.uid()));

-- ZERO user-facing INSERT, UPDATE, or DELETE policies on user_roles.
-- Roles are assigned exclusively by system triggers or internal service migrations.

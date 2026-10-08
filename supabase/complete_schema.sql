-- ==============================================================================
-- TRADE WEFT: COMPLETE DATABASE SCHEMA MIGRATION & SEED
-- Execute this script in Supabase Studio -> SQL Editor -> New Query -> Run
-- Project: https://supabase.com/dashboard/project/fxnbwiiyycrnnottauhr/sql/new
-- ==============================================================================

-- 1. ENUMS (Idempotent creation)
do $$ begin
    create type public.location_level as enum ('region', 'city', 'area');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.account_type as enum ('freelancer', 'business');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.app_role as enum ('user', 'admin', 'support');
exception when duplicate_object then null;
end $$;

-- 2. REFERENCE TABLES: COUNTRIES & LOCATIONS
create table if not exists public.countries (
    code text primary key check (length(code) = 2),
    name text not null,
    currency_code text not null check (length(currency_code) = 3),
    default_locale text not null default 'en',
    phone_code text not null,
    timezone text not null default 'UTC',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.locations (
    id uuid primary key default gen_random_uuid(),
    country_code text not null references public.countries(code) on delete cascade,
    parent_id uuid references public.locations(id) on delete cascade,
    level public.location_level not null,
    name text not null,
    slug text not null,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_locations_parent_slug 
    on public.locations (parent_id, slug);

create index if not exists idx_locations_hierarchy 
    on public.locations (country_code, level, parent_id);

create index if not exists idx_locations_parent 
    on public.locations (parent_id);

-- 3. PROFILES AND USER ROLES
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    account_type public.account_type,
    business_name text,
    country_code text references public.countries(code) on delete set null,
    city_id uuid references public.locations(id) on delete set null,
    area_id uuid references public.locations(id) on delete set null,
    remote_delivery boolean not null default false,
    locale text not null default 'en',
    terms_accepted_at timestamptz,
    terms_version text,
    onboarding_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
    user_id uuid not null references auth.users(id) on delete cascade,
    role public.app_role not null default 'user',
    created_at timestamptz not null default now(),
    primary key (user_id, role)
);

create index if not exists idx_profiles_location 
    on public.profiles (country_code, city_id, area_id);

create index if not exists idx_profiles_onboarding 
    on public.profiles (id, onboarding_completed_at);

-- 4. TRIGGERS & FUNCTIONS
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists tr_profiles_updated_at on public.profiles;
create trigger tr_profiles_updated_at
    before update on public.profiles
    for each row
    execute function public.handle_updated_at();

drop trigger if exists tr_countries_updated_at on public.countries;
create trigger tr_countries_updated_at
    before update on public.countries
    for each row
    execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_display_name text;
    v_avatar_url text;
begin
    v_display_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    );
    v_avatar_url := coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
    );

    insert into public.profiles (
        id,
        display_name,
        avatar_url,
        created_at,
        updated_at
    ) values (
        new.id,
        v_display_name,
        v_avatar_url,
        now(),
        now()
    ) on conflict (id) do nothing;

    insert into public.user_roles (
        user_id,
        role,
        created_at
    ) values (
        new.id,
        'user'::public.app_role,
        now()
    ) on conflict (user_id, role) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- 5. BACKFILL EXISTING USERS (ensures existing auth users receive profile & role rows)
insert into public.profiles (id, display_name, avatar_url, created_at, updated_at)
select 
    id,
    coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
    coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'),
    now(),
    now()
from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role, created_at)
select id, 'user'::public.app_role, now()
from auth.users
on conflict (user_id, role) do nothing;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.countries enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Countries read policy
drop policy if exists "Allow read access to countries for all users" on public.countries;
create policy "Allow read access to countries for all users"
    on public.countries for select to authenticated, anon
    using (true);

-- Locations read policy
drop policy if exists "Allow read access to locations for all users" on public.locations;
create policy "Allow read access to locations for all users"
    on public.locations for select to authenticated, anon
    using (true);

-- Profiles policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
    on public.profiles for insert to authenticated
    with check (id = (select auth.uid()));

-- User roles policy
drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles"
    on public.user_roles for select to authenticated
    using (user_id = (select auth.uid()));

-- 7. SEED DATA: KENYA & NAIROBI
insert into public.countries (
    code, name, currency_code, default_locale, phone_code, timezone, is_active
) values (
    'KE', 'Kenya', 'KES', 'en', '+254', 'Africa/Nairobi', true
)
on conflict (code) do update set
    name = excluded.name,
    currency_code = excluded.currency_code,
    default_locale = excluded.default_locale,
    phone_code = excluded.phone_code,
    timezone = excluded.timezone,
    is_active = excluded.is_active;

do $$
declare
    v_region_id uuid;
    v_city_id uuid;
begin
    -- Region: Nairobi County
    insert into public.locations (country_code, parent_id, level, name, slug)
    values ('KE', null, 'region', 'Nairobi County', 'nairobi-county')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_region_id;

    if v_region_id is null then
        select id into v_region_id from public.locations 
        where parent_id is null and slug = 'nairobi-county';
    end if;

    -- City: Nairobi
    insert into public.locations (country_code, parent_id, level, name, slug)
    values ('KE', v_region_id, 'city', 'Nairobi', 'nairobi')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_city_id;

    if v_city_id is null then
        select id into v_city_id from public.locations 
        where parent_id = v_region_id and slug = 'nairobi';
    end if;

    -- Neighborhoods
    insert into public.locations (country_code, parent_id, level, name, slug) values
        ('KE', v_city_id, 'area', 'Westlands', 'westlands'),
        ('KE', v_city_id, 'area', 'Kilimani', 'kilimani'),
        ('KE', v_city_id, 'area', 'Karen', 'karen'),
        ('KE', v_city_id, 'area', 'Upper Hill', 'upper-hill'),
        ('KE', v_city_id, 'area', 'Nairobi Central (CBD)', 'cbd'),
        ('KE', v_city_id, 'area', 'Parklands', 'parklands'),
        ('KE', v_city_id, 'area', 'Kileleshwa', 'kileleshwa'),
        ('KE', v_city_id, 'area', 'Lavington', 'lavington'),
        ('KE', v_city_id, 'area', 'Gigiri', 'gigiri'),
        ('KE', v_city_id, 'area', 'Industrial Area', 'industrial-area')
    on conflict (parent_id, slug) do update set name = excluded.name;
end $$;

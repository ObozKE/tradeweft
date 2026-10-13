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
    insert into public.locations (id, country_code, parent_id, level, name, slug)
    values ('a0000000-0000-0000-0000-000000000001', 'KE', null, 'region', 'Nairobi County', 'nairobi-county')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_region_id;

    if v_region_id is null then
        select id into v_region_id from public.locations 
        where parent_id is null and slug = 'nairobi-county';
    end if;

    -- City: Nairobi
    insert into public.locations (id, country_code, parent_id, level, name, slug)
    values ('b0000000-0000-0000-0000-000000000001', 'KE', v_region_id, 'city', 'Nairobi', 'nairobi')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_city_id;

    if v_city_id is null then
        select id into v_city_id from public.locations 
        where parent_id = v_region_id and slug = 'nairobi';
    end if;

    -- Neighborhoods
    insert into public.locations (id, country_code, parent_id, level, name, slug) values
        ('c0000000-0000-0000-0000-000000000001', 'KE', v_city_id, 'area', 'Westlands', 'westlands'),
        ('c0000000-0000-0000-0000-000000000002', 'KE', v_city_id, 'area', 'Kilimani', 'kilimani'),
        ('c0000000-0000-0000-0000-000000000003', 'KE', v_city_id, 'area', 'Karen', 'karen'),
        ('c0000000-0000-0000-0000-000000000004', 'KE', v_city_id, 'area', 'Upper Hill', 'upper-hill'),
        ('c0000000-0000-0000-0000-000000000005', 'KE', v_city_id, 'area', 'Nairobi Central (CBD)', 'cbd'),
        ('c0000000-0000-0000-0000-000000000006', 'KE', v_city_id, 'area', 'Parklands', 'parklands'),
        ('c0000000-0000-0000-0000-000000000007', 'KE', v_city_id, 'area', 'Kileleshwa', 'kileleshwa'),
        ('c0000000-0000-0000-0000-000000000008', 'KE', v_city_id, 'area', 'Lavington', 'lavington'),
        ('c0000000-0000-0000-0000-000000000009', 'KE', v_city_id, 'area', 'Gigiri', 'gigiri'),
        ('c0000000-0000-0000-0000-000000000010', 'KE', v_city_id, 'area', 'Industrial Area', 'industrial-area')
    on conflict (parent_id, slug) do update set name = excluded.name;
end $$;


-- ==============================================================================
-- PHASE 2: SERVICE PACKAGES, TAXONOMY, VERSIONS, VIEWS & RPC FUNCTIONS
-- ==============================================================================

-- 8. SERVICE CATEGORIES TAXONOMY & TRANSLATIONS
create table if not exists public.service_categories (
    id uuid primary key default gen_random_uuid(),
    parent_id uuid references public.service_categories(id) on delete cascade,
    slug text not null unique,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.service_category_translations (
    category_id uuid not null references public.service_categories(id) on delete cascade,
    locale text not null,
    name text not null,
    primary key (category_id, locale)
);

create index if not exists idx_service_categories_parent 
    on public.service_categories (parent_id, sort_order);

create index if not exists idx_service_categories_slug 
    on public.service_categories (slug);

create index if not exists idx_category_translations_lookup 
    on public.service_category_translations (locale, category_id);

-- Seed Taxonomy Data with deterministic UUIDs
do $$
declare
    v_cat_id uuid;
    v_sub_id uuid;
begin
    -- 1. Web & Software
    insert into public.service_categories (id, slug, sort_order, is_active)
    values ('10000000-0000-0000-0000-000000000001', 'web-software', 10, true)
    on conflict (slug) do update set sort_order = excluded.sort_order
    returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'web-software'; end if;

    insert into public.service_category_translations (category_id, locale, name) values
        (v_cat_id, 'en', 'Web & Software'),
        (v_cat_id, 'sw', 'Tovuti na Programu')
    on conflict (category_id, locale) do update set name = excluded.name;

    -- Subcategories for Web & Software
    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000001', v_cat_id, 'frontend-dev', 11, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'frontend-dev'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Frontend Development'), (v_sub_id, 'sw', 'Maendeleo ya Frontend') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000002', v_cat_id, 'backend-apis', 12, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'backend-apis'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Backend & APIs'), (v_sub_id, 'sw', 'Maendeleo ya Backend na API') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000003', v_cat_id, 'mobile-apps', 13, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'mobile-apps'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Mobile App Development'), (v_sub_id, 'sw', 'Maendeleo ya Programu za Simu') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000004', v_cat_id, 'ui-ux-design', 14, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'ui-ux-design'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'UI/UX Design'), (v_sub_id, 'sw', 'Ubunifu wa UI na UX') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 2. Design & Branding
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000002', 'design-branding', 20, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'design-branding'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Design & Branding'), (v_cat_id, 'sw', 'Ubunifu na Chapa') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000005', v_cat_id, 'logo-brand-identity', 21, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'logo-brand-identity'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Logo & Brand Identity'), (v_sub_id, 'sw', 'Nembo na Utambulisho wa Chapa') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000006', v_cat_id, 'print-packaging', 22, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'print-packaging'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Print & Packaging'), (v_sub_id, 'sw', 'Uchapishaji na Ufungashaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 3. Marketing & Social Media
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000003', 'marketing-social-media', 30, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'marketing-social-media'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Marketing & Social Media'), (v_cat_id, 'sw', 'Uuzaji na Mitandao ya Kijamii') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000007', v_cat_id, 'social-media-management', 31, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'social-media-management'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Social Media Management'), (v_sub_id, 'sw', 'Usimamizi wa Mitandao') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000008', v_cat_id, 'seo-search-marketing', 32, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'seo-search-marketing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'SEO & Search Marketing'), (v_sub_id, 'sw', 'Uboreshaji wa Injini za Utafutaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 4. Writing & Content
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000004', 'writing-content', 40, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'writing-content'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Writing & Content'), (v_cat_id, 'sw', 'Uandishi na Maudhui') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000009', v_cat_id, 'copywriting-sales', 41, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'copywriting-sales'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Copywriting & Sales Pages'), (v_sub_id, 'sw', 'Uandishi wa Mauzo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000010', v_cat_id, 'translation-localization', 42, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'translation-localization'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Translation & Localization'), (v_sub_id, 'sw', 'Tafsiri na Ujanibishaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 5. Photo & Video
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000005', 'photo-video', 50, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'photo-video'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Photo & Video'), (v_cat_id, 'sw', 'Upigaji Picha na Video') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000011', v_cat_id, 'commercial-photography', 51, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'commercial-photography'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Commercial Photography'), (v_sub_id, 'sw', 'Picha za Kibiashara') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000012', v_cat_id, 'video-production-editing', 52, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'video-production-editing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Video Production & Editing'), (v_sub_id, 'sw', 'Utengenezaji wa Video') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 6. Accounting & Finance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000006', 'accounting-finance', 60, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'accounting-finance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Accounting & Finance'), (v_cat_id, 'sw', 'Uhasibu na Fedha') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000013', v_cat_id, 'bookkeeping-statements', 61, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'bookkeeping-statements'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Bookkeeping & Statements'), (v_sub_id, 'sw', 'Utunzaji wa Hesabu') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000014', v_cat_id, 'tax-advisory-filing', 62, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'tax-advisory-filing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Tax Advisory & KRA Filing'), (v_sub_id, 'sw', 'Ushauri wa Kodi na KRA') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 7. Legal Services
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000007', 'legal-services', 70, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'legal-services'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Legal Services'), (v_cat_id, 'sw', 'Huduma za Kisheria') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000015', v_cat_id, 'contract-drafting-review', 71, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'contract-drafting-review'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Contract Drafting & Review'), (v_sub_id, 'sw', 'Uandishi wa Mikataba') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000016', v_cat_id, 'business-compliance', 72, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'business-compliance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Business Registration & Compliance'), (v_sub_id, 'sw', 'Usajili na Uzingatiaji wa Sheria') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 8. Health & Therapy
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000008', 'health-therapy', 80, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'health-therapy'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Health & Therapy'), (v_cat_id, 'sw', 'Afya na Tiba') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000017', v_cat_id, 'physical-therapy', 81, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'physical-therapy'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Physical Therapy & Rehab'), (v_sub_id, 'sw', 'Tiba ya Viungo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 9. Beauty & Grooming
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000009', 'beauty-grooming', 90, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'beauty-grooming'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Beauty & Grooming'), (v_cat_id, 'sw', 'Urembo na Utunzaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000018', v_cat_id, 'hair-styling-barbering', 91, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'hair-styling-barbering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Hair Styling & Barbering'), (v_sub_id, 'sw', 'Unyozi na Ususi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 10. Fitness & Training
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000010', 'fitness-training', 100, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'fitness-training'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Fitness & Training'), (v_cat_id, 'sw', 'Mazoezi na Mafunzo ya Mwili') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000019', v_cat_id, 'personal-fitness-training', 101, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'personal-fitness-training'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Personal Training'), (v_sub_id, 'sw', 'Mkufunzi Binafsi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 11. Food & Catering
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000011', 'food-catering', 110, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'food-catering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Food & Catering'), (v_cat_id, 'sw', 'Chakula na Upishi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000020', v_cat_id, 'corporate-catering', 111, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'corporate-catering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Corporate Catering'), (v_sub_id, 'sw', 'Upishi wa Mashirika') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 12. Education & Tutoring
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000012', 'education-tutoring', 120, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'education-tutoring'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Education & Tutoring'), (v_cat_id, 'sw', 'Elimu na Mafunzo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000021', v_cat_id, 'business-coaching', 121, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'business-coaching'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Business Coaching'), (v_sub_id, 'sw', 'Ushauri wa Biashara') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 13. Admin & Virtual Assistance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000013', 'admin-virtual-assistance', 130, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'admin-virtual-assistance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Admin & Virtual Assistance'), (v_cat_id, 'sw', 'Utawala na Usaidizi wa Mtandaoni') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000022', v_cat_id, 'virtual-assistant', 131, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'virtual-assistant'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Virtual Assistant'), (v_sub_id, 'sw', 'Msaidizi wa Mtandaoni') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 14. Repairs & Maintenance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000014', 'repairs-maintenance', 140, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'repairs-maintenance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Repairs & Maintenance'), (v_cat_id, 'sw', 'Matengenezo na Ukarabati') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000023', v_cat_id, 'office-it-repairs', 141, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'office-it-repairs'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Office IT & Equipment Repair'), (v_sub_id, 'sw', 'Matengenezo ya TEHAMA') 
    on conflict (category_id, locale) do update set name = excluded.name;

end $$;

-- 9. PHASE 2 ENUMS & EXTENSIONS
do $$ begin
    create type public.package_status as enum ('draft', 'published', 'paused', 'archived', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.delivery_mode as enum ('in_person', 'remote', 'hybrid');
exception when duplicate_object then null;
end $$;

create extension if not exists pg_trgm;

-- 10. HELPER FUNCTIONS: UUIDv7 & VALIDATION
create or replace function public.gen_uuidv7()
returns uuid
language plpgsql
as $$
declare
    v_time timestamptz := clock_timestamp();
    v_secs bigint := extract(epoch from v_time);
    v_msec bigint := mod(floor(extract(milliseconds from v_time))::bigint, 1000);
    v_timestamp bigint := (v_secs * 1000) + v_msec;
    v_timestamp_hex text := lpad(to_hex(v_timestamp), 12, '0');
    v_random bytea := gen_random_bytes(10);
    v_random_hex text := encode(v_random, 'hex');
    v_bytes text;
begin
    v_bytes := substr(v_timestamp_hex, 1, 8) || '-' ||
               substr(v_timestamp_hex, 9, 4) || '-' ||
               '7' || substr(v_random_hex, 1, 3) || '-' ||
               to_hex((get_byte(v_random, 2) & 63) | 128) || substr(v_random_hex, 5, 2) || '-' ||
               substr(v_random_hex, 7, 12);
    return v_bytes::uuid;
exception when others then
    return gen_random_uuid();
end;
$$;

create or replace function public.validate_service_package_integrity()
returns trigger
language plpgsql
as $$
declare
    v_country_curr text;
    v_city_country text;
    v_area_parent uuid;
begin
    select currency_code into v_country_curr from public.countries where code = new.country_code;
    if v_country_curr is null then
        raise exception 'Invalid country_code %', new.country_code;
    end if;
    if new.currency_code is distinct from v_country_curr then
        raise exception 'Currency code % does not match country currency %', new.currency_code, v_country_curr;
    end if;

    if new.delivery_mode in ('in_person', 'hybrid') then
        if new.city_id is null or new.area_id is null then
            raise exception 'In-person and hybrid packages require both city_id and area_id';
        end if;
    elsif new.delivery_mode = 'remote' then
        if new.city_id is null then
            raise exception 'Remote delivery packages require at least city_id';
        end if;
    end if;

    if new.city_id is not null then
        select country_code into v_city_country from public.locations where id = new.city_id and level = 'city';
        if v_city_country is null or v_city_country <> new.country_code then
            raise exception 'city_id % does not belong to country %', new.city_id, new.country_code;
        end if;
    end if;

    if new.area_id is not null then
        select parent_id into v_area_parent from public.locations where id = new.area_id and level = 'area';
        if v_area_parent is null or v_area_parent <> new.city_id then
            raise exception 'area_id % does not belong to city_id %', new.area_id, new.city_id;
        end if;
    end if;

    if tg_op = 'UPDATE' then
        if old.status = 'archived' and new.status = 'published' then
            raise exception 'Archived packages cannot directly transition to published. Create a new package or draft.';
        end if;
        if old.status = 'removed' and new.status <> 'removed' then
            raise exception 'Removed packages cannot be restored by users.';
        end if;
    end if;

    if jsonb_typeof(new.deliverables) <> 'array' or jsonb_array_length(new.deliverables) < 1 or jsonb_array_length(new.deliverables) > 10 then
        raise exception 'Deliverables must be an array of 1 to 10 items';
    end if;

    if jsonb_typeof(new.exclusions) <> 'array' or jsonb_array_length(new.exclusions) > 10 then
        raise exception 'Exclusions must be an array of at most 10 items';
    end if;

    return new;
end;
$$;

-- 11. SERVICE PACKAGES TABLE
create table if not exists public.service_packages (
    id uuid primary key default public.gen_uuidv7(),
    provider_id uuid not null references public.profiles(id) on delete cascade,
    category_id uuid not null references public.service_categories(id) on delete restrict,
    status public.package_status not null default 'draft',
    title text not null check (char_length(title) between 10 and 80),
    summary text not null check (char_length(summary) between 20 and 160),
    description text not null check (char_length(description) between 50 and 2000),
    content_locale text not null default 'en',
    delivery_mode public.delivery_mode not null,
    country_code text not null references public.countries(code) on delete restrict,
    city_id uuid references public.locations(id) on delete restrict,
    area_id uuid references public.locations(id) on delete restrict,
    turnaround_days integer not null check (turnaround_days between 1 and 180),
    capacity_per_month integer check (capacity_per_month is null or (capacity_per_month between 1 and 100)),
    indicative_value_minor bigint check (indicative_value_minor is null or indicative_value_minor >= 0),
    currency_code text not null check (length(currency_code) = 3),
    deliverables jsonb not null default '[]'::jsonb,
    exclusions jsonb not null default '[]'::jsonb,
    current_version_id uuid,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    search_vector tsvector generated always as (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'C')
    ) stored
);

drop trigger if exists tr_service_packages_integrity on public.service_packages;
create trigger tr_service_packages_integrity
    before insert or update on public.service_packages
    for each row
    execute function public.validate_service_package_integrity();

drop trigger if exists tr_service_packages_updated_at on public.service_packages;
create trigger tr_service_packages_updated_at
    before update on public.service_packages
    for each row
    execute function public.handle_updated_at();

-- 12. SEEKING CATEGORIES TABLE
create table if not exists public.service_package_seeking_categories (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    category_id uuid not null references public.service_categories(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (package_id, category_id)
);

-- 13. IMMUTABLE SERVICE PACKAGE VERSIONS
create table if not exists public.service_package_versions (
    id uuid primary key default gen_random_uuid(),
    package_id uuid not null references public.service_packages(id) on delete cascade,
    version_number integer not null,
    snapshot jsonb not null,
    created_at timestamptz not null default now(),
    unique (package_id, version_number)
);

create or replace function public.prevent_immutable_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Service package version snapshots are strictly immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_version_mutation on public.service_package_versions;
create trigger tr_block_version_mutation
    before update or delete on public.service_package_versions
    for each row
    execute function public.prevent_immutable_mutation();

-- 14. DOMAIN EVENTS OUTBOX
create table if not exists public.domain_events (
    id uuid primary key default gen_random_uuid(),
    aggregate_type text not null,
    aggregate_id uuid not null,
    event_type text not null,
    actor_id uuid references auth.users(id) on delete set null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

drop trigger if exists tr_block_domain_event_mutation on public.domain_events;
create trigger tr_block_domain_event_mutation
    before update or delete on public.domain_events
    for each row
    execute function public.prevent_immutable_mutation();

-- 15. INDEXES FOR SERVICE PACKAGES
create index if not exists idx_packages_provider_status 
    on public.service_packages (provider_id, status, updated_at desc);

create index if not exists idx_packages_published_hot 
    on public.service_packages (country_code, city_id, area_id, category_id, published_at desc, id desc)
    where status = 'published';

create index if not exists idx_packages_search_vector 
    on public.service_packages using gin (search_vector)
    where status = 'published';

create index if not exists idx_packages_title_trgm 
    on public.service_packages using gin (title gin_trgm_ops)
    where status = 'published';

create index if not exists idx_seeking_categories_reverse 
    on public.service_package_seeking_categories (category_id, package_id);

create index if not exists idx_package_versions_package 
    on public.service_package_versions (package_id, version_number desc);

-- 16. PUBLIC PROVIDER PROFILES VIEW
create or replace view public.public_provider_profiles
with (security_invoker = false)
as
select
    p.id,
    p.display_name,
    p.business_name,
    p.avatar_url,
    p.city_id,
    p.area_id,
    p.created_at as member_since
from public.profiles p
where exists (
    select 1
    from public.service_packages sp
    where sp.provider_id = p.id
      and sp.status = 'published'
);

grant select on public.public_provider_profiles to anon, authenticated;

-- 17. RPC FUNCTIONS
create or replace function public.publish_service_package(
    p_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_pkg record;
    v_onboarding timestamptz;
    v_active_count integer;
    v_next_ver integer;
    v_snapshot jsonb;
    v_version_id uuid;
    v_seeking_categories jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if v_pkg.status = 'archived' or v_pkg.status = 'removed' then
        raise exception 'INVALID_STATE: Archived or removed packages cannot be published directly';
    end if;

    select onboarding_completed_at into v_onboarding from public.profiles where id = v_user_id;
    if v_onboarding is null then
        raise exception 'ONBOARDING_REQUIRED: Profile onboarding must be completed before publishing';
    end if;

    select count(*) into v_active_count
    from public.service_packages
    where provider_id = v_user_id
      and status in ('published', 'paused')
      and id <> p_package_id;

    if v_active_count >= 10 then
        raise exception 'LIMIT_EXCEEDED: Active package limit reached (maximum 10 allowed)';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('category_id', sc.category_id)), '[]'::jsonb)
    into v_seeking_categories
    from public.service_package_seeking_categories sc
    where sc.package_id = p_package_id;

    select coalesce(max(version_number), 0) + 1
    into v_next_ver
    from public.service_package_versions
    where package_id = p_package_id;

    v_snapshot := jsonb_build_object(
        'package_id', v_pkg.id,
        'provider_id', v_pkg.provider_id,
        'category_id', v_pkg.category_id,
        'title', v_pkg.title,
        'summary', v_pkg.summary,
        'description', v_pkg.description,
        'content_locale', v_pkg.content_locale,
        'delivery_mode', v_pkg.delivery_mode,
        'country_code', v_pkg.country_code,
        'city_id', v_pkg.city_id,
        'area_id', v_pkg.area_id,
        'turnaround_days', v_pkg.turnaround_days,
        'capacity_per_month', v_pkg.capacity_per_month,
        'indicative_value_minor', v_pkg.indicative_value_minor,
        'currency_code', v_pkg.currency_code,
        'deliverables', v_pkg.deliverables,
        'exclusions', v_pkg.exclusions,
        'seeking_categories', v_seeking_categories,
        'version_number', v_next_ver,
        'snapshot_created_at', now()
    );

    insert into public.service_package_versions (package_id, version_number, snapshot)
    values (p_package_id, v_next_ver, v_snapshot)
    returning id into v_version_id;

    update public.service_packages
    set status = 'published',
        current_version_id = v_version_id,
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = p_package_id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        'package.published',
        v_user_id,
        jsonb_build_object(
            'version_number', v_next_ver,
            'version_id', v_version_id,
            'country_code', v_pkg.country_code,
            'category_id', v_pkg.category_id
        )
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'version_number', v_next_ver,
        'status', 'published'
    );
end;
$$;

create or replace function public.set_service_package_status(
    p_package_id uuid,
    p_status public.package_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_pkg record;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if p_status = 'published' then
        raise exception 'INVALID_ACTION: Use publish_service_package to publish or unpause into published state';
    end if;

    if p_status = 'draft' and v_pkg.status <> 'draft' then
        raise exception 'INVALID_STATE: Published or archived packages cannot transition back to draft';
    end if;

    update public.service_packages
    set status = p_status,
        updated_at = now()
    where id = p_package_id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        case when p_status = 'paused' then 'package.paused'
             when p_status = 'archived' then 'package.archived'
             else 'package.status_changed' end,
        v_user_id,
        jsonb_build_object('old_status', v_pkg.status, 'new_status', p_status)
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'status', p_status
    );
end;
$$;

create or replace function public.delete_service_package(
    p_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_pkg record;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if v_pkg.status <> 'draft' then
        raise exception 'INVALID_STATE: Only drafts can be deleted. Published packages must be archived.';
    end if;

    delete from public.service_packages where id = p_package_id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        'package.deleted',
        v_user_id,
        jsonb_build_object('title', v_pkg.title)
    );

    return jsonb_build_object('success', true, 'deleted_id', p_package_id);
end;
$$;

create or replace function public.search_service_packages(
    p_country_code text,
    p_locale text default 'en',
    p_city_id uuid default null,
    p_area_id uuid default null,
    p_category_id uuid default null,
    p_seeking_category_id uuid default null,
    p_delivery_mode public.delivery_mode default null,
    p_query text default null,
    p_cursor_published_at timestamptz default null,
    p_cursor_id uuid default null,
    p_page_size integer default 20
)
returns table (
    id uuid,
    title text,
    summary text,
    category_id uuid,
    category_slug text,
    category_name text,
    delivery_mode public.delivery_mode,
    country_code text,
    city_id uuid,
    city_name text,
    area_id uuid,
    area_name text,
    turnaround_days integer,
    capacity_per_month integer,
    indicative_value_minor bigint,
    currency_code text,
    deliverables jsonb,
    exclusions jsonb,
    seeking_categories jsonb,
    provider_id uuid,
    provider_display_name text,
    provider_business_name text,
    provider_avatar_url text,
    provider_member_since timestamptz,
    published_at timestamptz,
    has_next_page boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_limit integer := least(coalesce(p_page_size, 20), 50);
    v_clean_query text := nullif(trim(p_query), '');
    v_tsquery tsquery := null;
begin
    if v_clean_query is not null then
        v_tsquery := plainto_tsquery('simple', v_clean_query);
    end if;

    return query
    with raw_results as (
        select
            sp.id,
            sp.title,
            sp.summary,
            sp.category_id,
            cat.slug as category_slug,
            coalesce(ct.name, cat.slug) as category_name,
            sp.delivery_mode,
            sp.country_code,
            sp.city_id,
            city.name as city_name,
            sp.area_id,
            area.name as area_name,
            sp.turnaround_days,
            sp.capacity_per_month,
            sp.indicative_value_minor,
            sp.currency_code,
            sp.deliverables,
            sp.exclusions,
            coalesce(
                (
                    select jsonb_agg(
                        jsonb_build_object(
                            'category_id', scat.id,
                            'slug', scat.slug,
                            'name', coalesce(sct.name, scat.slug)
                        )
                    )
                    from public.service_package_seeking_categories spsc
                    join public.service_categories scat on scat.id = spsc.category_id
                    left join public.service_category_translations sct 
                        on sct.category_id = scat.id and sct.locale = p_locale
                    where spsc.package_id = sp.id
                ),
                '[]'::jsonb
            ) as seeking_categories,
            sp.provider_id,
            prov.display_name as provider_display_name,
            prov.business_name as provider_business_name,
            prov.avatar_url as provider_avatar_url,
            prov.member_since as provider_member_since,
            sp.published_at,
            case 
                when v_tsquery is not null then
                    ts_rank_cd(sp.search_vector, v_tsquery) + (similarity(sp.title, v_clean_query) * 0.5)
                else 0
            end as relevance_rank
        from public.service_packages sp
        join public.countries country on country.code = sp.country_code and country.is_active = true
        join public.public_provider_profiles prov on prov.id = sp.provider_id
        join public.service_categories cat on cat.id = sp.category_id and cat.is_active = true
        left join public.service_category_translations ct 
            on ct.category_id = cat.id and ct.locale = p_locale
        left join public.locations city on city.id = sp.city_id
        left join public.locations area on area.id = sp.area_id
        where sp.status = 'published'
          and sp.country_code = p_country_code
          and (
              p_category_id is null
              or sp.category_id = p_category_id
              or sp.category_id in (select id from public.service_categories where parent_id = p_category_id)
          )
          and (
              p_seeking_category_id is null
              or exists (
                  select 1 from public.service_package_seeking_categories spsc
                  where spsc.package_id = sp.id
                    and (
                        spsc.category_id = p_seeking_category_id
                        or spsc.category_id in (select id from public.service_categories where parent_id = p_seeking_category_id)
                    )
              )
          )
          and (p_delivery_mode is null or sp.delivery_mode = p_delivery_mode)
          and (
              p_area_id is null
              or sp.area_id = p_area_id
              or (sp.delivery_mode = 'remote' and (sp.city_id = p_city_id or p_city_id is null))
          )
          and (
              p_city_id is null
              or sp.city_id = p_city_id
              or sp.delivery_mode = 'remote'
          )
          and (
              v_tsquery is null
              or sp.search_vector @@ v_tsquery
              or sp.title % v_clean_query
          )
          and (
              p_cursor_published_at is null
              or (sp.published_at, sp.id) < (p_cursor_published_at, p_cursor_id)
          )
        order by
            case when v_tsquery is not null then relevance_rank else 0 end desc,
            sp.published_at desc,
            sp.id desc
        limit v_limit + 1
    ),
    counted as (
        select *, count(*) over() as total_fetched from raw_results
    )
    select
        r.id,
        r.title,
        r.summary,
        r.category_id,
        r.category_slug,
        r.category_name,
        r.delivery_mode,
        r.country_code,
        r.city_id,
        r.city_name,
        r.area_id,
        r.area_name,
        r.turnaround_days,
        r.capacity_per_month,
        r.indicative_value_minor,
        r.currency_code,
        r.deliverables,
        r.exclusions,
        r.seeking_categories,
        r.provider_id,
        r.provider_display_name,
        r.provider_business_name,
        r.provider_avatar_url,
        r.provider_member_since,
        r.published_at,
        (r.total_fetched > v_limit) as has_next_page
    from counted r
    limit v_limit;
end;
$$;

grant execute on function public.publish_service_package(uuid) to authenticated;
grant execute on function public.set_service_package_status(uuid, public.package_status) to authenticated;
grant execute on function public.delete_service_package(uuid) to authenticated;
grant execute on function public.search_service_packages(text, text, uuid, uuid, uuid, uuid, public.delivery_mode, text, timestamptz, uuid, integer) to anon, authenticated;

-- 18. RLS POLICIES FOR PHASE 2
alter table public.service_categories enable row level security;
alter table public.service_category_translations enable row level security;
alter table public.service_packages enable row level security;
alter table public.service_package_seeking_categories enable row level security;
alter table public.service_package_versions enable row level security;
alter table public.domain_events enable row level security;

create policy "Allow read access to service categories"
    on public.service_categories for select to authenticated, anon
    using (true);

create policy "Allow read access to category translations"
    on public.service_category_translations for select to authenticated, anon
    using (true);

create policy "Allow read access to published packages or own packages"
    on public.service_packages for select to authenticated, anon
    using (status = 'published' or (select auth.uid()) = provider_id);

create policy "Providers can insert own draft packages"
    on public.service_packages for insert to authenticated
    with check (provider_id = (select auth.uid()) and status = 'draft');

create policy "Providers can update own packages"
    on public.service_packages for update to authenticated
    using (provider_id = (select auth.uid()))
    with check (provider_id = (select auth.uid()) and (status <> 'published' or (select status from public.service_packages where id = service_packages.id) = 'published'));

create policy "Providers can delete own draft packages"
    on public.service_packages for delete to authenticated
    using (provider_id = (select auth.uid()) and status = 'draft');

create policy "Allow read seeking categories for published or own packages"
    on public.service_package_seeking_categories for select to authenticated, anon
    using (exists (select 1 from public.service_packages sp where sp.id = service_package_seeking_categories.package_id and (sp.status = 'published' or sp.provider_id = (select auth.uid()))));

create policy "Providers can manage seeking categories for own packages"
    on public.service_package_seeking_categories for all to authenticated
    using (exists (select 1 from public.service_packages sp where sp.id = service_package_seeking_categories.package_id and sp.provider_id = (select auth.uid())))
    with check (exists (select 1 from public.service_packages sp where sp.id = service_package_seeking_categories.package_id and sp.provider_id = (select auth.uid())));

create policy "Allow read access to versions of published or own packages"
    on public.service_package_versions for select to authenticated, anon
    using (exists (select 1 from public.service_packages sp where sp.id = service_package_versions.package_id and (sp.status = 'published' or sp.provider_id = (select auth.uid()))));

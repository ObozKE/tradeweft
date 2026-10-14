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
#variable_conflict use_column
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
              or sp.category_id in (select sub_cat.id from public.service_categories sub_cat where sub_cat.parent_id = p_category_id)
          )
          and (
              p_seeking_category_id is null
              or exists (
                  select 1 from public.service_package_seeking_categories spsc
                  where spsc.package_id = sp.id
                    and (
                        spsc.category_id = p_seeking_category_id
                        or spsc.category_id in (select sub_seek_cat.id from public.service_categories sub_seek_cat where sub_seek_cat.parent_id = p_seeking_category_id)
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
    with check (provider_id = (select auth.uid()));

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


-- ==============================================================================
-- PHASE 3: BARTER AGREEMENTS & NEGOTIATION ENGINE
-- ==============================================================================

-- Migration 20261013000001: Phase 3 Barter Agreements - Enums and Tables
-- Creates tables for barter agreements, immutable revisions, lines, fulfilment,
-- contract audit events, private contacts, contact shares, and in-app notifications.

-- 1. Enums
do $$ begin
    create type public.agreement_status as enum (
        'proposed',
        'active',
        'completed',
        'declined',
        'withdrawn',
        'expired',
        'cancelled',
        'disputed'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.agreement_side as enum (
        'proposer_gives',
        'recipient_gives'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.contact_channel as enum (
        'phone',
        'whatsapp',
        'email'
    );
exception when duplicate_object then null;
end $$;

-- 2. Core Agreements Table
create table if not exists public.agreements (
    id uuid primary key default gen_random_uuid(),
    country_code text not null references public.countries(code),
    proposer_id uuid not null references public.profiles(id),
    recipient_id uuid not null references public.profiles(id),
    status public.agreement_status not null default 'proposed',
    current_revision_no integer not null default 1,
    turn_user_id uuid not null references public.profiles(id),
    expires_at timestamptz not null default (now() + interval '7 days'),
    accepted_revision_id uuid, -- Reference set on acceptance
    terms_hash text,           -- SHA-256 tamper-evident digest computed on acceptance
    trade_terms_version text not null default '2026-10-v1',
    accepted_at timestamptz,
    completed_at timestamptz,
    cancellation_requested_by uuid references public.profiles(id),
    cancellation_reason text,
    cancelled_at timestamptz,
    disputed_by uuid references public.profiles(id),
    dispute_reason text,
    disputed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_proposer_recipient_diff check (proposer_id <> recipient_id)
);

-- 3. Immutable Agreement Revisions
create table if not exists public.agreement_revisions (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    revision_no integer not null,
    authored_by uuid not null references public.profiles(id),
    note text,
    created_at timestamptz not null default now(),
    unique (agreement_id, revision_no)
);

-- Add deferred foreign key for accepted_revision_id
alter table public.agreements
    drop constraint if exists fk_agreements_accepted_revision;
alter table public.agreements
    add constraint fk_agreements_accepted_revision
    foreign key (accepted_revision_id) references public.agreement_revisions(id) on delete set null;

-- 4. Immutable Agreement Lines (Package versions & quantities)
create table if not exists public.agreement_lines (
    id uuid primary key default gen_random_uuid(),
    revision_id uuid not null references public.agreement_revisions(id) on delete cascade,
    side public.agreement_side not null,
    package_version_id uuid not null references public.service_package_versions(id) on delete restrict,
    quantity integer not null check (quantity >= 1 and quantity <= 99),
    created_at timestamptz not null default now()
);

-- 5. Fulfilment Milestones (Dual marking & confirmation per side)
create table if not exists public.agreement_fulfilment (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    side public.agreement_side not null,
    giving_user_id uuid not null references public.profiles(id),
    receiving_user_id uuid not null references public.profiles(id),
    delivered_marked_at timestamptz,
    delivered_marked_by uuid references public.profiles(id),
    receipt_confirmed_at timestamptz,
    receipt_confirmed_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    unique (agreement_id, side)
);

-- 6. Append-Only Agreement Audit Events Ledger
create table if not exists public.agreement_events (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    actor_id uuid references public.profiles(id),
    event_type text not null,
    from_status public.agreement_status,
    to_status public.agreement_status,
    revision_no integer,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 7. Profile Contacts (Owner-only private contact details)
create table if not exists public.profile_contacts (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    phone_e164 text not null,
    whatsapp boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 8. Agreement Contact Shares (Consented communication channels per trade)
create table if not exists public.agreement_contact_shares (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    user_id uuid not null references public.profiles(id),
    channels text[] not null check (array_length(channels, 1) > 0),
    consented_at timestamptz not null default now(),
    unique (agreement_id, user_id)
);

-- 9. In-App Notifications Queue
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    payload jsonb not null default '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

-- 10. Idempotency Keys (Deduplication for mobile network retries)
create table if not exists public.idempotency_keys (
    key text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    action text not null,
    response jsonb not null,
    created_at timestamptz not null default now()
);


-- Migration 20261013000002: Phase 3 Barter Agreements - Integrity Triggers & Indexes
-- Enforces immutability, line constraints, turn validation, and scale-optimized indexes.

-- 1. Updated At Triggers
drop trigger if exists tr_agreements_updated_at on public.agreements;
create trigger tr_agreements_updated_at
    before update on public.agreements
    for each row
    execute function public.handle_updated_at();

drop trigger if exists tr_profile_contacts_updated_at on public.profile_contacts;
create trigger tr_profile_contacts_updated_at
    before update on public.profile_contacts
    for each row
    execute function public.handle_updated_at();

-- 2. Partial Unique Index & Query Indexes
-- Exactly one open negotiation per user pair (canonicalized least/greatest)
create unique index if not exists idx_unique_open_negotiation_pair 
    on public.agreements (least(proposer_id, recipient_id), greatest(proposer_id, recipient_id))
    where status = 'proposed';

-- Hot query paths for dashboard tabs
create index if not exists idx_agreements_proposer_status 
    on public.agreements (proposer_id, status, updated_at desc);

create index if not exists idx_agreements_recipient_status 
    on public.agreements (recipient_id, status, updated_at desc);

-- Expiry sweep index (partial for proposed agreements)
create index if not exists idx_agreements_expires_at 
    on public.agreements (expires_at) 
    where status = 'proposed';

-- Revisions and Lines
create index if not exists idx_agreement_revisions_lookup 
    on public.agreement_revisions (agreement_id, revision_no desc);

create index if not exists idx_agreement_lines_revision 
    on public.agreement_lines (revision_id);

create index if not exists idx_agreement_lines_pkg_version 
    on public.agreement_lines (package_version_id);

-- Events and Notifications
create index if not exists idx_agreement_events_timeline 
    on public.agreement_events (agreement_id, created_at asc);

create index if not exists idx_notifications_user_inbox 
    on public.notifications (user_id, read_at, created_at desc);

-- 3. Immutability Triggers (Block UPDATE & DELETE on revisions, lines, events)
create or replace function public.prevent_agreement_revisions_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement revisions are strictly immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_revisions_mutation on public.agreement_revisions;
create trigger tr_block_agreement_revisions_mutation
    before update or delete on public.agreement_revisions
    for each row
    execute function public.prevent_agreement_revisions_mutation();

create or replace function public.prevent_agreement_lines_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement lines are strictly immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_lines_mutation on public.agreement_lines;
create trigger tr_block_agreement_lines_mutation
    before update or delete on public.agreement_lines
    for each row
    execute function public.prevent_agreement_lines_mutation();

create or replace function public.prevent_agreement_events_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement audit events are append-only and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_events_mutation on public.agreement_events;
create trigger tr_block_agreement_events_mutation
    before update or delete on public.agreement_events
    for each row
    execute function public.prevent_agreement_events_mutation();

-- 4. Line Integrity Trigger (Ownership, capacity, line count & same country)
create or replace function public.validate_agreement_line_integrity()
returns trigger
language plpgsql
as $$
declare
    v_agr record;
    v_pkg_ver record;
    v_line_count integer;
    v_expected_provider uuid;
begin
    -- 1. Fetch parent agreement details
    select a.id, a.country_code, a.proposer_id, a.recipient_id, a.status
    into v_agr
    from public.agreement_revisions r
    join public.agreements a on a.id = r.agreement_id
    where r.id = new.revision_id;

    if v_agr.id is null then
        raise exception 'INVALID_REVISION: Agreement revision not found';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Lines can only be created for proposed agreements';
    end if;

    -- 2. Determine expected provider based on side
    if new.side = 'proposer_gives' then
        v_expected_provider := v_agr.proposer_id;
    elsif new.side = 'recipient_gives' then
        v_expected_provider := v_agr.recipient_id;
    else
        raise exception 'INVALID_SIDE: Unknown agreement side %', new.side;
    end if;

    -- 3. Fetch referenced service package version
    select spv.id, spv.package_id, spv.snapshot
    into v_pkg_ver
    from public.service_package_versions spv
    where spv.id = new.package_version_id;

    if v_pkg_ver.id is null then
        raise exception 'VERSION_NOT_FOUND: Referenced service package version does not exist';
    end if;

    -- 4. Ownership verification: version must belong to the giving side's provider
    if (v_pkg_ver.snapshot->>'provider_id')::uuid <> v_expected_provider then
        raise exception 'PROVIDER_MISMATCH: Service package version does not belong to giving party';
    end if;

    -- 5. Country verification: package country must match agreement country
    if (v_pkg_ver.snapshot->>'country_code') <> v_agr.country_code then
        raise exception 'COUNTRY_MISMATCH: Package country % does not match agreement country %',
            (v_pkg_ver.snapshot->>'country_code'), v_agr.country_code;
    end if;

    -- 6. Capacity verification (if package has capacity_per_month defined)
    if (v_pkg_ver.snapshot->>'capacity_per_month') is not null then
        if new.quantity > (v_pkg_ver.snapshot->>'capacity_per_month')::integer then
            raise exception 'CAPACITY_EXCEEDED: Quantity % exceeds monthly package capacity %',
                new.quantity, (v_pkg_ver.snapshot->>'capacity_per_month')::integer;
        end if;
    end if;

    -- 7. Line count cap: At most 3 lines per side for this revision
    select count(*) into v_line_count
    from public.agreement_lines
    where revision_id = new.revision_id
      and side = new.side;

    if v_line_count >= 3 then
        raise exception 'LINE_LIMIT_EXCEEDED: At most 3 lines allowed per side';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_agreement_line on public.agreement_lines;
create trigger tr_validate_agreement_line
    before insert on public.agreement_lines
    for each row
    execute function public.validate_agreement_line_integrity();


-- Migration 20261013000003: Phase 3 Barter Agreements - Security Definer RPC Functions
-- Enforces atomic state transitions, tamper-evident terms hashing, and zero IDOR.

-- 1. Helper: Lazy Expiry Checker
create or replace function public.internal_lazy_check_agreement_expiry(
    p_agr_id uuid
)
returns public.agreement_status
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_status public.agreement_status;
    v_expires_at timestamptz;
begin
    select status, expires_at into v_status, v_expires_at
    from public.agreements
    where id = p_agr_id
    for update;

    if v_status = 'proposed' and now() > v_expires_at then
        update public.agreements
        set status = 'expired', updated_at = now()
        where id = p_agr_id;

        insert into public.agreement_events (agreement_id, event_type, from_status, to_status)
        values (p_agr_id, 'agreement_expired', 'proposed', 'expired');

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        values ('agreement', p_agr_id, 'agreement.expired', jsonb_build_object('reason', 'lazy_expiry'));

        return 'expired';
    end if;

    return v_status;
end;
$$;

-- 2. Propose Agreement
create or replace function public.propose_agreement(
    p_recipient_id uuid,
    p_proposer_lines jsonb,
    p_recipient_lines jsonb,
    p_note text default null,
    p_consented_channels text[] default array['email'::text],
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_proposer_profile record;
    v_recipient_profile record;
    v_open_count integer;
    v_agr_id uuid;
    v_rev_id uuid;
    v_line record;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if v_user_id = p_recipient_id then
        raise exception 'SELF_PROPOSAL_FORBIDDEN: You cannot propose a trade to yourself';
    end if;

    -- Idempotency check
    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'propose_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Verify profiles & onboarding
    select * into v_proposer_profile from public.profiles where id = v_user_id;
    if v_proposer_profile.id is null or v_proposer_profile.onboarding_completed_at is null then
        raise exception 'ONBOARDING_REQUIRED: Complete your profile before proposing trades';
    end if;

    select * into v_recipient_profile from public.profiles where id = p_recipient_id;
    if v_recipient_profile.id is null or v_recipient_profile.onboarding_completed_at is null then
        raise exception 'RECIPIENT_NOT_ONBOARDED: Recipient has not completed profile onboarding';
    end if;

    -- Same country verification
    if v_proposer_profile.country_code <> v_recipient_profile.country_code then
        raise exception 'COUNTRY_MISMATCH: Barter trades are currently restricted to parties in the same country';
    end if;

    -- Outgoing open proposals cap (max 20)
    select count(*) into v_open_count
    from public.agreements
    where proposer_id = v_user_id and status = 'proposed';

    if v_open_count >= 20 then
        raise exception 'LIMIT_EXCEEDED: You have reached the maximum of 20 open proposals. Await responses or withdraw existing proposals.';
    end if;

    -- Validate line counts (1 to 3 lines per side)
    if jsonb_array_length(p_proposer_lines) < 1 or jsonb_array_length(p_proposer_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Proposer side must specify between 1 and 3 package offerings';
    end if;
    if jsonb_array_length(p_recipient_lines) < 1 or jsonb_array_length(p_recipient_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Recipient side must specify between 1 and 3 package requests';
    end if;

    -- Insert agreement
    insert into public.agreements (
        country_code,
        proposer_id,
        recipient_id,
        status,
        current_revision_no,
        turn_user_id,
        expires_at
    ) values (
        v_proposer_profile.country_code,
        v_user_id,
        p_recipient_id,
        'proposed',
        1,
        p_recipient_id, -- Turn is with recipient to review, counter, or accept
        now() + interval '7 days'
    ) returning id into v_agr_id;

    -- Insert Revision 1
    insert into public.agreement_revisions (
        agreement_id,
        revision_no,
        authored_by,
        note
    ) values (
        v_agr_id,
        1,
        v_user_id,
        nullif(trim(p_note), '')
    ) returning id into v_rev_id;

    -- Insert Proposer Lines
    for v_line in select * from jsonb_to_recordset(p_proposer_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'proposer_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Insert Recipient Lines
    for v_line in select * from jsonb_to_recordset(p_recipient_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'recipient_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Insert Proposer Contact Share
    if p_consented_channels is not null and array_length(p_consented_channels, 1) > 0 then
        insert into public.agreement_contact_shares (agreement_id, user_id, channels)
        values (v_agr_id, v_user_id, p_consented_channels)
        on conflict (agreement_id, user_id) do update set channels = p_consented_channels;
    end if;

    -- Audit & Domain Events
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        v_agr_id, v_user_id, 'proposal_created', null, 'proposed', 1,
        jsonb_build_object('recipient_id', p_recipient_id)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', v_agr_id, 'agreement.proposed', v_user_id,
        jsonb_build_object('recipient_id', p_recipient_id, 'revision_no', 1)
    );

    -- In-app notification for recipient
    insert into public.notifications (user_id, type, payload)
    values (
        p_recipient_id,
        'trade.proposed',
        jsonb_build_object('agreement_id', v_agr_id, 'proposer_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', v_agr_id,
        'revision_no', 1,
        'status', 'proposed'
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'propose_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 3. Counter Agreement
create or replace function public.counter_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
    p_proposer_lines jsonb,
    p_recipient_lines jsonb,
    p_note text default null,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_new_rev_no integer;
    v_rev_id uuid;
    v_line record;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'counter_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Lock agreement
    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Party check
    if v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Turn check
    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to counter this proposal';
    end if;

    -- Expiry check
    if v_agr.status <> 'proposed' or now() > v_agr.expires_at then
        update public.agreements set status = 'expired', updated_at = now() where id = p_agreement_id;
        raise exception 'EXPIRED: Proposal has expired';
    end if;

    -- Stale revision check
    if v_agr.current_revision_no <> p_expected_revision_no then
        raise exception 'STALE_REVISION: The proposal terms have changed. Please review the latest revision before countering.';
    end if;

    -- Validate lines
    if jsonb_array_length(p_proposer_lines) < 1 or jsonb_array_length(p_proposer_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Proposer side must specify between 1 and 3 package offerings';
    end if;
    if jsonb_array_length(p_recipient_lines) < 1 or jsonb_array_length(p_recipient_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Recipient side must specify between 1 and 3 package requests';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;
    v_new_rev_no := v_agr.current_revision_no + 1;

    -- Insert new revision
    insert into public.agreement_revisions (
        agreement_id, revision_no, authored_by, note
    ) values (
        p_agreement_id, v_new_rev_no, v_user_id, nullif(trim(p_note), '')
    ) returning id into v_rev_id;

    -- Insert lines
    for v_line in select * from jsonb_to_recordset(p_proposer_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'proposer_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    for v_line in select * from jsonb_to_recordset(p_recipient_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'recipient_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Update agreement turn and reset 7-day expiry
    update public.agreements
    set current_revision_no = v_new_rev_no,
        turn_user_id = v_other_party,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = p_agreement_id;

    -- Events & Notifications
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        p_agreement_id, v_user_id, 'counter_created', 'proposed', 'proposed', v_new_rev_no,
        jsonb_build_object('turn_user_id', v_other_party)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.countered', v_user_id,
        jsonb_build_object('revision_no', v_new_rev_no, 'counterparty_id', v_other_party)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.countered',
        jsonb_build_object('agreement_id', p_agreement_id, 'revision_no', v_new_rev_no, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'revision_no', v_new_rev_no,
        'status', 'proposed'
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'counter_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 4. Accept Agreement
create or replace function public.accept_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
    p_consented_channels text[] default array['email'::text],
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_rev record;
    v_other_party uuid;
    v_lines_json jsonb;
    v_terms_hash text;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'accept_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Lock agreement
    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Party check
    if v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Turn check
    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to accept this proposal';
    end if;

    -- Expiry check
    if v_agr.status <> 'proposed' or now() > v_agr.expires_at then
        update public.agreements set status = 'expired', updated_at = now() where id = p_agreement_id;
        raise exception 'EXPIRED: Proposal has expired';
    end if;

    -- Stale revision check
    if v_agr.current_revision_no <> p_expected_revision_no then
        raise exception 'STALE_REVISION: The proposal terms have changed. Please review the latest revision before accepting.';
    end if;

    -- Fetch current revision
    select * into v_rev
    from public.agreement_revisions
    where agreement_id = p_agreement_id and revision_no = v_agr.current_revision_no;

    -- Collect canonical serialized lines for tamper-evidence hash
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'side', l.side,
                'package_version_id', l.package_version_id,
                'quantity', l.quantity
            ) order by l.side, l.package_version_id
        ), '[]'::jsonb
    ) into v_lines_json
    from public.agreement_lines l
    where l.revision_id = v_rev.id;

    -- Compute SHA-256 terms_hash
    v_terms_hash := encode(
        digest(
            v_agr.id::text || '|' ||
            v_rev.id::text || '|' ||
            v_agr.proposer_id::text || '|' ||
            v_agr.recipient_id::text || '|' ||
            v_lines_json::text || '|' ||
            v_agr.trade_terms_version,
            'sha256'
        ), 'hex'
    );

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    -- Update agreement to active
    update public.agreements
    set status = 'active',
        accepted_revision_id = v_rev.id,
        terms_hash = v_terms_hash,
        accepted_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    -- Save acceptor contact share
    if p_consented_channels is not null and array_length(p_consented_channels, 1) > 0 then
        insert into public.agreement_contact_shares (agreement_id, user_id, channels)
        values (p_agreement_id, v_user_id, p_consented_channels)
        on conflict (agreement_id, user_id) do update set channels = p_consented_channels;
    end if;

    -- Create fulfilment milestones for both sides
    insert into public.agreement_fulfilment (
        agreement_id, side, giving_user_id, receiving_user_id
    ) values
        (p_agreement_id, 'proposer_gives', v_agr.proposer_id, v_agr.recipient_id),
        (p_agreement_id, 'recipient_gives', v_agr.recipient_id, v_agr.proposer_id)
    on conflict (agreement_id, side) do nothing;

    -- Events & Notifications
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        p_agreement_id, v_user_id, 'agreement_accepted', 'proposed', 'active', v_agr.current_revision_no,
        jsonb_build_object('terms_hash', v_terms_hash)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.accepted', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no, 'terms_hash', v_terms_hash)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.accepted',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'status', 'active',
        'terms_hash', v_terms_hash
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'accept_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 5. Decline Agreement
create or replace function public.decline_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'decline_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to decline this proposal';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Only open proposals can be declined';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements set status = 'declined', updated_at = now() where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no
    ) values (
        p_agreement_id, v_user_id, 'proposal_declined', 'proposed', 'declined', v_agr.current_revision_no
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.declined', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.declined',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'declined');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'decline_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 6. Withdraw Agreement
create or replace function public.withdraw_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'withdraw_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Only the non-turn party can withdraw (the party waiting on the other)
    if v_user_id = v_agr.turn_user_id then
        raise exception 'CANNOT_WITHDRAW_ON_YOUR_TURN: You currently hold the turn to accept, counter, or decline';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Only open proposals can be withdrawn';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements set status = 'withdrawn', updated_at = now() where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no
    ) values (
        p_agreement_id, v_user_id, 'proposal_withdrawn', 'proposed', 'withdrawn', v_agr.current_revision_no
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.withdrawn', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.withdrawn',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'withdrawn');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'withdraw_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 7. Mark Delivered
create or replace function public.mark_delivered(
    p_agreement_id uuid,
    p_side public.agreement_side,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_fulfilment record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'mark_delivered';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Deliverables can only be marked on active agreements';
    end if;

    select * into v_fulfilment
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and side = p_side
    for update;

    if v_fulfilment.giving_user_id <> v_user_id then
        raise exception 'FORBIDDEN: You can only mark delivery for your own services';
    end if;

    if v_fulfilment.delivered_marked_at is not null then
        raise exception 'ALREADY_MARKED: Delivery has already been marked for this side';
    end if;

    update public.agreement_fulfilment
    set delivered_marked_at = now(),
        delivered_marked_by = v_user_id
    where id = v_fulfilment.id;

    v_other_party := v_fulfilment.receiving_user_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'delivery_marked', 'active', 'active',
        jsonb_build_object('side', p_side)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.delivered',
        jsonb_build_object('agreement_id', p_agreement_id, 'side', p_side, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'side', p_side);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'mark_delivered', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 8. Confirm Receipt & Auto-Complete
create or replace function public.confirm_receipt(
    p_agreement_id uuid,
    p_side public.agreement_side,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_fulfilment record;
    v_unconfirmed_count integer;
    v_is_completed boolean := false;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'confirm_receipt';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Receipt can only be confirmed on active agreements';
    end if;

    select * into v_fulfilment
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and side = p_side
    for update;

    if v_fulfilment.receiving_user_id <> v_user_id then
        raise exception 'FORBIDDEN: Only the receiving party can confirm receipt of this service';
    end if;

    if v_fulfilment.delivered_marked_at is null then
        raise exception 'NOT_YET_DELIVERED: Delivery has not yet been marked by the providing party';
    end if;

    if v_fulfilment.receipt_confirmed_at is not null then
        raise exception 'ALREADY_CONFIRMED: Receipt has already been confirmed';
    end if;

    update public.agreement_fulfilment
    set receipt_confirmed_at = now(),
        receipt_confirmed_by = v_user_id
    where id = v_fulfilment.id;

    -- Check if both sides are now confirmed
    select count(*) into v_unconfirmed_count
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and receipt_confirmed_at is null;

    if v_unconfirmed_count = 0 then
        v_is_completed := true;
        update public.agreements
        set status = 'completed', completed_at = now(), updated_at = now()
        where id = p_agreement_id;

        insert into public.agreement_events (
            agreement_id, actor_id, event_type, from_status, to_status
        ) values (
            p_agreement_id, v_user_id, 'agreement_completed', 'active', 'completed'
        );

        insert into public.domain_events (
            aggregate_type, aggregate_id, event_type, actor_id, payload
        ) values (
            'agreement', p_agreement_id, 'agreement.completed', v_user_id,
            jsonb_build_object('terms_hash', v_agr.terms_hash)
        );

        insert into public.notifications (user_id, type, payload)
        values
            (v_agr.proposer_id, 'trade.completed', jsonb_build_object('agreement_id', p_agreement_id)),
            (v_agr.recipient_id, 'trade.completed', jsonb_build_object('agreement_id', p_agreement_id));
    else
        insert into public.agreement_events (
            agreement_id, actor_id, event_type, from_status, to_status, payload
        ) values (
            p_agreement_id, v_user_id, 'receipt_confirmed', 'active', 'active',
            jsonb_build_object('side', p_side)
        );

        insert into public.notifications (user_id, type, payload)
        values (
            v_fulfilment.giving_user_id,
            'trade.receipt_confirmed',
            jsonb_build_object('agreement_id', p_agreement_id, 'side', p_side, 'actor_id', v_user_id)
        );
    end if;

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'side', p_side,
        'is_completed', v_is_completed
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'confirm_receipt', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 9. Cancellation: Request & Accept
create or replace function public.request_cancellation(
    p_agreement_id uuid,
    p_reason text,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'request_cancellation';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Cancellation can only be requested on active agreements';
    end if;

    if v_agr.cancellation_requested_by is not null then
        raise exception 'ALREADY_REQUESTED: A cancellation request is already pending for this trade';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements
    set cancellation_requested_by = v_user_id,
        cancellation_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'cancellation_requested', 'active', 'active',
        jsonb_build_object('reason', p_reason)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.cancellation_requested',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'cancellation_requested', true);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'request_cancellation', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.accept_cancellation(
    p_agreement_id uuid,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'accept_cancellation';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Only active agreements can be cancelled';
    end if;

    if v_agr.cancellation_requested_by is null then
        raise exception 'NO_CANCELLATION_REQUEST: No cancellation request is pending for this agreement';
    end if;

    if v_agr.cancellation_requested_by = v_user_id then
        raise exception 'CANNOT_ACCEPT_OWN_REQUEST: You cannot accept your own cancellation request';
    end if;

    v_other_party := v_agr.cancellation_requested_by;

    update public.agreements
    set status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status
    ) values (
        p_agreement_id, v_user_id, 'agreement_cancelled', 'active', 'cancelled'
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.cancelled', v_user_id,
        jsonb_build_object('cancellation_reason', v_agr.cancellation_reason)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.cancelled',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'cancelled');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'accept_cancellation', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 10. Open Dispute
create or replace function public.open_dispute(
    p_agreement_id uuid,
    p_reason text,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'open_dispute';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    if p_reason is null or length(trim(p_reason)) < 5 or length(trim(p_reason)) > 1000 then
        raise exception 'INVALID_REASON: Dispute reason must be between 5 and 1000 characters';
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Disputes can only be opened on active agreements';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements
    set status = 'disputed',
        disputed_by = v_user_id,
        dispute_reason = trim(p_reason),
        disputed_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'dispute_opened', 'active', 'disputed',
        jsonb_build_object('reason', trim(p_reason))
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.disputed', v_user_id,
        jsonb_build_object('dispute_reason', trim(p_reason))
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.disputed',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'disputed');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'open_dispute', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 11. Get Counterparty Contact (Privacy-Preserving Contact Reveal)
create or replace function public.get_counterparty_contact(
    p_agreement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_shares record;
    v_contact record;
    v_auth_user record;
    v_res jsonb := jsonb_build_object('revealed', false);
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Contact reveal is strictly permitted ONLY while active, completed, or disputed
    if v_agr.status not in ('active', 'completed', 'disputed') then
        return jsonb_build_object('revealed', false, 'reason', 'TRADE_NOT_ACTIVE');
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    -- Fetch counterparty's consented channels
    select * into v_shares
    from public.agreement_contact_shares
    where agreement_id = p_agreement_id and user_id = v_other_party;

    if v_shares.id is null then
        return jsonb_build_object('revealed', false, 'reason', 'NO_CONSENT_RECORDED');
    end if;

    -- Fetch profile contacts
    select * into v_contact from public.profile_contacts where user_id = v_other_party;

    -- Fetch email from auth.users (if consented)
    select email into v_auth_user from auth.users where id = v_other_party;

    v_res := jsonb_build_object(
        'revealed', true,
        'user_id', v_other_party,
        'channels', v_shares.channels,
        'phone', case when 'phone' = any(v_shares.channels) then v_contact.phone_e164 else null end,
        'whatsapp', case when 'whatsapp' = any(v_shares.channels) and coalesce(v_contact.whatsapp, false) then v_contact.phone_e164 else null end,
        'email', case when 'email' = any(v_shares.channels) then v_auth_user.email else null end
    );

    return v_res;
end;
$$;

-- 12. Mark Notifications Read
create or replace function public.mark_notifications_read(
    p_notification_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    update public.notifications
    set read_at = now()
    where id = any(p_notification_ids) and user_id = v_user_id;
end;
$$;

-- 13. Mutual Matchmaking Algorithm
create or replace function public.suggest_mutual_matches(
    p_limit int default 20,
    p_cursor_score int default null,
    p_cursor_user_id uuid default null
)
returns table (
    counterparty_id uuid,
    display_name text,
    business_name text,
    avatar_url text,
    city_name text,
    area_name text,
    match_strength int,
    my_matching_packages jsonb,
    their_matching_packages jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_country text;
    v_max_limit int := least(coalesce(p_limit, 20), 50);
begin
    if v_user_id is null then
        return;
    end if;

    select country_code into v_country from public.profiles where id = v_user_id;
    if v_country is null then
        return;
    end if;

    return query
    with my_packages as (
        select sp.id as package_id, sp.category_id
        from public.service_packages sp
        where sp.provider_id = v_user_id and sp.status = 'published' and sp.country_code = v_country
    ),
    my_seeking as (
        select distinct spsc.category_id
        from my_packages mp
        join public.service_package_seeking_categories spsc on spsc.package_id = mp.package_id
    ),
    candidate_matches as (
        select
            their_pkg.provider_id as other_id,
            count(distinct their_pkg.category_id) as overlap_count,
            jsonb_agg(
                distinct jsonb_build_object('id', my_pkg.package_id, 'category_id', my_pkg.category_id)
            ) as my_pkgs,
            jsonb_agg(
                distinct jsonb_build_object('id', their_pkg.id, 'title', their_pkg.title, 'category_id', their_pkg.category_id)
            ) as their_pkgs
        from public.service_packages their_pkg
        join public.service_package_seeking_categories their_seeking
            on their_seeking.package_id = their_pkg.id
        join my_packages my_pkg
            on my_pkg.category_id = their_seeking.category_id
        where their_pkg.provider_id <> v_user_id
          and their_pkg.status = 'published'
          and their_pkg.country_code = v_country
          and their_pkg.category_id in (select category_id from my_seeking)
          -- Exclude if open negotiation already exists
          and not exists (
              select 1 from public.agreements a
              where a.status = 'proposed'
                and (
                    (a.proposer_id = v_user_id and a.recipient_id = their_pkg.provider_id)
                    or (a.proposer_id = their_pkg.provider_id and a.recipient_id = v_user_id)
                )
          )
        group by their_pkg.provider_id
    )
    select
        cm.other_id as counterparty_id,
        prov.display_name,
        prov.business_name,
        prov.avatar_url,
        city.name as city_name,
        area.name as area_name,
        cm.overlap_count::int as match_strength,
        cm.my_pkgs as my_matching_packages,
        cm.their_pkgs as their_matching_packages
    from candidate_matches cm
    join public.public_provider_profiles prov on prov.id = cm.other_id
    left join public.profiles p on p.id = cm.other_id
    left join public.locations city on city.id = p.city_id
    left join public.locations area on area.id = p.area_id
    where (
        p_cursor_score is null
        or (cm.overlap_count, cm.other_id) < (p_cursor_score, p_cursor_user_id)
    )
    order by cm.overlap_count desc, cm.other_id desc
    limit v_max_limit;
end;
$$;


-- Migration 20261013000004: Phase 3 Barter Agreements - Row Level Security (RLS) Policies
-- Zero IDOR: Non-parties receive empty rows (not found), never forbidden or existence leaks.
-- All mutations are routed through Security Definer RPCs; direct client mutations are disallowed.

-- 1. Enable RLS on all Phase 3 tables
alter table public.agreements enable row level security;
alter table public.agreement_revisions enable row level security;
alter table public.agreement_lines enable row level security;
alter table public.agreement_fulfilment enable row level security;
alter table public.agreement_events enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.agreement_contact_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_keys enable row level security;

-- 2. Agreements Policies
-- Non-parties cannot see or detect agreements
create policy "Parties can read own agreements"
    on public.agreements
    for select
    to authenticated
    using ((select auth.uid()) in (proposer_id, recipient_id));

-- Direct mutation is blocked for clients (RPC only)
-- No INSERT, UPDATE, DELETE policies granted to authenticated/anon

-- 3. Agreement Revisions Policies
create policy "Parties can read agreement revisions"
    on public.agreement_revisions
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_revisions.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 4. Agreement Lines Policies
create policy "Parties can read agreement lines"
    on public.agreement_lines
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreement_revisions r
            join public.agreements a on a.id = r.agreement_id
            where r.id = agreement_lines.revision_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 5. Fulfilment Policies
create policy "Parties can read fulfilment milestones"
    on public.agreement_fulfilment
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_fulfilment.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 6. Audit Events Policies
create policy "Parties can read agreement audit events"
    on public.agreement_events
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_events.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 7. Profile Contacts Policies (Owner only)
create policy "Users can read own profile contact"
    on public.profile_contacts
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can insert own profile contact"
    on public.profile_contacts
    for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users can update own profile contact"
    on public.profile_contacts
    for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users can delete own profile contact"
    on public.profile_contacts
    for delete
    to authenticated
    using (user_id = (select auth.uid()));

-- 8. Agreement Contact Shares Policies
create policy "Parties can read agreement contact shares"
    on public.agreement_contact_shares
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_contact_shares.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 9. Notifications Policies (Owner only)
create policy "Users can read own notifications"
    on public.notifications
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can update own notifications"
    on public.notifications
    for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- 10. Idempotency Keys Policies (Owner only)
create policy "Users can manage own idempotency keys"
    on public.idempotency_keys
    for all
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- 11. RPC Execution Grants
grant execute on function public.propose_agreement(uuid, jsonb, jsonb, text, text[], text) to authenticated;
grant execute on function public.counter_agreement(uuid, int, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.accept_agreement(uuid, int, text[], text) to authenticated;
grant execute on function public.decline_agreement(uuid, int, text) to authenticated;
grant execute on function public.withdraw_agreement(uuid, int, text) to authenticated;
grant execute on function public.mark_delivered(uuid, public.agreement_side, text) to authenticated;
grant execute on function public.confirm_receipt(uuid, public.agreement_side, text) to authenticated;
grant execute on function public.request_cancellation(uuid, text, text) to authenticated;
grant execute on function public.accept_cancellation(uuid, text) to authenticated;
grant execute on function public.open_dispute(uuid, text, text) to authenticated;
grant execute on function public.get_counterparty_contact(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.suggest_mutual_matches(int, int, uuid) to authenticated;

-- Phase 4 Consolidated Migration: Reviews & The Public Trust Ledger
-- Combines migrations 20261014000001 through 20261014000006 for single-step execution in Supabase SQL Editor.

-- ============================================================================
-- PART 1: ENUMS AND TABLES
-- ============================================================================

do $$ begin
    create type public.review_status as enum (
        'submitted',
        'revealed',
        'hidden_by_moderation'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.report_reason as enum (
        'abusive',
        'off_topic',
        'false_claim',
        'other'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.report_status as enum (
        'pending',
        'reviewed',
        'dismissed'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.reputation_tier as enum (
        'new',
        'building',
        'established'
    );
exception when duplicate_object then null;
end $$;

create table if not exists public.trade_terms_versions (
    version text primary key,
    includes_public_ledger boolean not null default false,
    disclosure_text text not null,
    effective_at timestamptz not null default now()
);

insert into public.trade_terms_versions (version, includes_public_ledger, disclosure_text, effective_at)
values 
    ('2026-10-v1', false, 'Standard Barter Agreement Terms v1. Trades and reviews are private between participants.', '2026-10-01 00:00:00+00'),
    ('2026-10-v2', true, 'Trade Weft Terms v2. Completed trades (deliverables and quantities) and double-blind reviews will be published to the Public Trust Ledger to build your verified reputation. Notes and monetary values are never disclosed.', '2026-10-14 00:00:00+00')
on conflict (version) do update set 
    includes_public_ledger = excluded.includes_public_ledger,
    disclosure_text = excluded.disclosure_text;

alter table public.agreements 
    alter column trade_terms_version set default '2026-10-v2';

create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete restrict,
    reviewer_id uuid not null references public.profiles(id),
    reviewee_id uuid not null references public.profiles(id),
    overall_rating integer not null check (overall_rating >= 1 and overall_rating <= 5),
    quality_rating integer not null check (quality_rating >= 1 and quality_rating <= 5),
    communication_rating integer not null check (communication_rating >= 1 and communication_rating <= 5),
    timeliness_rating integer not null check (timeliness_rating >= 1 and timeliness_rating <= 5),
    would_trade_again boolean not null default true,
    body text check (body is null or length(body) <= 1000),
    content_locale text not null default 'en',
    status public.review_status not null default 'submitted',
    submitted_at timestamptz not null default now(),
    edit_until timestamptz not null default (now() + interval '1 hour'),
    revealed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_reviewer_reviewee_diff check (reviewer_id <> reviewee_id),
    unique (agreement_id, reviewer_id)
);

create table if not exists public.review_replies (
    review_id uuid primary key references public.reviews(id) on delete cascade,
    author_id uuid not null references public.profiles(id),
    body text not null check (length(trim(body)) >= 1 and length(body) <= 500),
    created_at timestamptz not null default now()
);

create table if not exists public.review_reports (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.reviews(id) on delete cascade,
    reporter_id uuid not null references public.profiles(id),
    reason public.report_reason not null,
    detail text check (detail is null or length(detail) <= 500),
    status public.report_status not null default 'pending',
    created_at timestamptz not null default now(),
    unique (review_id, reporter_id)
);

create table if not exists public.ledger_entries (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references public.agreements(id) on delete cascade,
    provider_id uuid not null references public.profiles(id),
    counterparty_id uuid not null references public.profiles(id),
    gave jsonb not null default '[]'::jsonb,
    received jsonb not null default '[]'::jsonb,
    completed_month date not null,
    contract_ref text not null,
    country_code text not null references public.countries(code),
    created_at timestamptz not null default now(),
    unique (agreement_id, provider_id)
);

create table if not exists public.provider_reputation (
    provider_id uuid primary key references public.profiles(id) on delete cascade,
    score numeric(5,2),
    tier public.reputation_tier not null default 'new',
    review_count integer not null default 0,
    distinct_partners integer not null default 0,
    completed_trades integer not null default 0,
    avg_overall numeric(3,2),
    avg_quality numeric(3,2),
    avg_communication numeric(3,2),
    avg_timeliness numeric(3,2),
    would_trade_again_pct numeric(5,2),
    score_version text not null default '2026-10-v1',
    computed_at timestamptz not null default now()
);

create table if not exists public.reputation_flags (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references public.profiles(id),
    reason text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.review_moderation_log (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.reviews(id),
    admin_id uuid not null references auth.users(id),
    action text not null check (action in ('hide', 'restore')),
    reason text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.domain_event_deliveries (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.domain_events(id) on delete cascade,
    consumer text not null,
    status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'dead_letter')),
    attempts integer not null default 0,
    last_error text,
    next_attempt_at timestamptz not null default now(),
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (event_id, consumer)
);

create index if not exists idx_reviews_reviewee 
    on public.reviews (reviewee_id, status, revealed_at desc, id desc);

create index if not exists idx_reviews_reviewer 
    on public.reviews (reviewer_id);

create index if not exists idx_reviews_agreement 
    on public.reviews (agreement_id);

create index if not exists idx_ledger_entries_provider 
    on public.ledger_entries (provider_id, completed_month desc, id desc);

create index if not exists idx_domain_event_deliveries_queue 
    on public.domain_event_deliveries (consumer, status, next_attempt_at);

create index if not exists idx_review_reports_status 
    on public.review_reports (status, created_at);

create index if not exists idx_reputation_flags_provider 
    on public.reputation_flags (provider_id, created_at desc);

-- ============================================================================
-- PART 2: INTEGRITY TRIGGERS & PROFILES VIEW EXPANSION
-- ============================================================================

drop trigger if exists tr_reviews_updated_at on public.reviews;
create trigger tr_reviews_updated_at
    before update on public.reviews
    for each row
    execute function public.handle_updated_at();

create or replace function public.prevent_ledger_entries_mutation()
returns trigger language plpgsql as $$
begin
    raise exception 'Ledger entries are strictly insert-only and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_ledger_entries_mutation on public.ledger_entries;
create trigger tr_block_ledger_entries_mutation
    before update or delete on public.ledger_entries
    for each row
    execute function public.prevent_ledger_entries_mutation();

create or replace function public.prevent_review_replies_mutation()
returns trigger language plpgsql as $$
begin
    raise exception 'Review replies are strictly immutable once posted.';
end;
$$;

drop trigger if exists tr_block_review_replies_mutation on public.review_replies;
create trigger tr_block_review_replies_mutation
    before update or delete on public.review_replies
    for each row
    execute function public.prevent_review_replies_mutation();

create or replace function public.validate_review_submission()
returns trigger language plpgsql as $$
declare
    v_agr record;
begin
    select id, proposer_id, recipient_id, status, completed_at
    into v_agr from public.agreements where id = new.agreement_id;

    if v_agr.id is null then
        raise exception 'AGREEMENT_NOT_FOUND: Referenced barter agreement does not exist';
    end if;

    if v_agr.status <> 'completed' or v_agr.completed_at is null then
        raise exception 'AGREEMENT_NOT_COMPLETED: Reviews can only be submitted for completed barter trades';
    end if;

    if new.reviewer_id not in (v_agr.proposer_id, v_agr.recipient_id) then
        raise exception 'NOT_A_PARTY: Only confirmed participants of the agreement can submit a review';
    end if;

    if new.reviewer_id = v_agr.proposer_id and new.reviewee_id <> v_agr.recipient_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;
    if new.reviewer_id = v_agr.recipient_id and new.reviewee_id <> v_agr.proposer_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;

    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_review_submission on public.reviews;
create trigger tr_validate_review_submission
    before insert on public.reviews
    for each row
    execute function public.validate_review_submission();

create or replace function public.validate_review_reply()
returns trigger language plpgsql as $$
declare
    v_rev record;
begin
    select id, reviewee_id, status into v_rev from public.reviews where id = new.review_id;
    if v_rev.id is null then raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist'; end if;
    if v_rev.status <> 'revealed' then raise exception 'REVIEW_NOT_REVEALED: Replies can only be posted to publicly revealed reviews'; end if;
    if new.author_id <> v_rev.reviewee_id then raise exception 'FORBIDDEN: Only the recipient (reviewee) of a review can post a public reply'; end if;
    return new;
end;
$$;

drop trigger if exists tr_validate_review_reply on public.review_replies;
create trigger tr_validate_review_reply
    before insert on public.review_replies
    for each row
    execute function public.validate_review_reply();

create or replace function public.validate_review_report()
returns trigger language plpgsql as $$
declare
    v_rev record;
begin
    select id, reviewee_id into v_rev from public.reviews where id = new.review_id;
    if v_rev.id is null then raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist'; end if;
    if new.reporter_id <> v_rev.reviewee_id then raise exception 'FORBIDDEN: Only the reviewee can report a review for moderation'; end if;
    return new;
end;
$$;

drop trigger if exists tr_validate_review_report on public.review_reports;
create trigger tr_validate_review_report
    before insert on public.review_reports
    for each row
    execute function public.validate_review_report();

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
)
or exists (
    select 1
    from public.ledger_entries le
    where le.provider_id = p.id
);

grant select on public.public_provider_profiles to anon, authenticated;

-- ============================================================================
-- PART 3: REPUTATION COMPUTATION ENGINE
-- ============================================================================

create or replace function public.recompute_provider_reputation(
    p_provider_id uuid,
    p_as_of timestamptz default now()
)
returns public.provider_reputation
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_distinct_partners integer := 0;
    v_completed_trades integer := 0;
    v_review_count integer := 0;
    v_weighted_sum numeric := 0;
    v_total_weight numeric := 0;
    v_prior_confidence numeric := 5.0;
    v_prior_mean numeric := 80.0;
    v_raw_score numeric;
    v_final_score numeric;
    v_tier public.reputation_tier := 'new';
    v_avg_overall numeric;
    v_avg_quality numeric;
    v_avg_communication numeric;
    v_avg_timeliness numeric;
    v_would_trade_pct numeric;
    v_rep record;
    v_profile_created_at timestamptz;
begin
    select created_at into v_profile_created_at from public.profiles where id = p_provider_id;

    select count(*) into v_completed_trades
    from public.agreements
    where status = 'completed'
      and (proposer_id = p_provider_id or recipient_id = p_provider_id);

    with review_stream as (
        select
            r.id,
            r.reviewer_id,
            r.overall_rating,
            r.quality_rating,
            r.communication_rating,
            r.timeliness_rating,
            r.would_trade_again,
            r.revealed_at,
            row_number() over (partition by r.reviewer_id order by r.revealed_at asc, r.id asc) as partner_trade_order,
            greatest(0, extract(epoch from (p_as_of - coalesce(r.revealed_at, r.created_at))) / 86400.0) as days_ago
        from public.reviews r
        where r.reviewee_id = p_provider_id and r.status = 'revealed'
    ),
    scored_reviews as (
        select
            id,
            reviewer_id,
            overall_rating,
            quality_rating,
            communication_rating,
            timeliness_rating,
            would_trade_again,
            (
                (
                    (0.50 * overall_rating) +
                    (0.20 * case when would_trade_again then 5.0 else 1.0 end) +
                    (0.15 * timeliness_rating) +
                    (0.15 * communication_rating)
                    - 1.0
                ) / 4.0
            ) * 100.0 as review_score,
            (1.0 / partner_trade_order::numeric) as pair_weight,
            power(0.5, (days_ago / 365.0)::numeric) as recency_weight
        from review_stream
    ),
    weighted_reviews as (
        select
            id,
            reviewer_id,
            overall_rating,
            quality_rating,
            communication_rating,
            timeliness_rating,
            would_trade_again,
            review_score,
            (pair_weight * recency_weight) as effective_weight
        from scored_reviews
    )
    select
        count(*),
        count(distinct reviewer_id),
        coalesce(sum(review_score * effective_weight), 0),
        coalesce(sum(effective_weight), 0),
        avg(overall_rating),
        avg(quality_rating),
        avg(communication_rating),
        avg(timeliness_rating),
        coalesce((count(*) filter (where would_trade_again)::numeric / nullif(count(*), 0)) * 100.0, 100.0)
    into
        v_review_count,
        v_distinct_partners,
        v_weighted_sum,
        v_total_weight,
        v_avg_overall,
        v_avg_quality,
        v_avg_communication,
        v_avg_timeliness,
        v_would_trade_pct
    from weighted_reviews;

    if v_distinct_partners >= 10 then
        v_tier := 'established';
    elsif v_distinct_partners >= 3 then
        v_tier := 'building';
    else
        v_tier := 'new';
    end if;

    if v_distinct_partners >= 3 and (v_total_weight + v_prior_confidence) > 0 then
        v_raw_score := (v_weighted_sum + (v_prior_confidence * v_prior_mean)) / (v_total_weight + v_prior_confidence);
        v_final_score := round(least(100.0, greatest(0.0, v_raw_score)), 1);
    else
        v_final_score := null;
    end if;

    insert into public.provider_reputation (
        provider_id, score, tier, review_count, distinct_partners, completed_trades,
        avg_overall, avg_quality, avg_communication, avg_timeliness, would_trade_again_pct,
        score_version, computed_at
    ) values (
        p_provider_id, v_final_score, v_tier, v_review_count, v_distinct_partners, v_completed_trades,
        round(v_avg_overall, 2), round(v_avg_quality, 2), round(v_avg_communication, 2), round(v_avg_timeliness, 2), round(v_would_trade_pct, 1),
        '2026-10-v1', now()
    )
    on conflict (provider_id) do update set
        score = excluded.score, tier = excluded.tier, review_count = excluded.review_count,
        distinct_partners = excluded.distinct_partners, completed_trades = excluded.completed_trades,
        avg_overall = excluded.avg_overall, avg_quality = excluded.avg_quality,
        avg_communication = excluded.avg_communication, avg_timeliness = excluded.avg_timeliness,
        would_trade_again_pct = excluded.would_trade_again_pct, score_version = excluded.score_version,
        computed_at = excluded.computed_at
    returning * into v_rep;

    insert into public.reputation_flags (provider_id, reason, payload)
    select 
        p_provider_id, 'PAIR_VELOCITY_ANOMALY',
        jsonb_build_object('partner_id', sub.partner_id, 'trades_in_30d', sub.trade_count)
    from (
        select 
            case when proposer_id = p_provider_id then recipient_id else proposer_id end as partner_id,
            count(*) as trade_count
        from public.agreements
        where status = 'completed' and (proposer_id = p_provider_id or recipient_id = p_provider_id) and completed_at >= (now() - interval '30 days')
        group by 1 having count(*) > 3
    ) sub
    where not exists (
        select 1 from public.reputation_flags rf 
        where rf.provider_id = p_provider_id and rf.reason = 'PAIR_VELOCITY_ANOMALY'
          and (rf.payload->>'partner_id')::uuid = sub.partner_id and rf.created_at >= (now() - interval '7 days')
    );

    if v_profile_created_at is not null and v_profile_created_at >= (now() - interval '7 days') and v_completed_trades >= 3 then
        if not exists (select 1 from public.reputation_flags where provider_id = p_provider_id and reason = 'NEW_ACCOUNT_RAPID_TRADES') then
            insert into public.reputation_flags (provider_id, reason, payload)
            values (p_provider_id, 'NEW_ACCOUNT_RAPID_TRADES', jsonb_build_object('account_age_days', extract(day from (now() - v_profile_created_at)), 'completed_trades', v_completed_trades));
        end if;
    end if;

    insert into public.reputation_flags (provider_id, reason, payload)
    select p_provider_id, 'RECIPROCAL_5_STAR_BURST', jsonb_build_object('reviewer_id', r1.reviewer_id, 'agreement_id', r1.agreement_id)
    from public.reviews r1
    join public.reviews r2 on r2.reviewer_id = p_provider_id and r2.reviewee_id = r1.reviewer_id
    where r1.reviewee_id = p_provider_id and r1.overall_rating = 5 and r2.overall_rating = 5
      and abs(extract(epoch from (r1.revealed_at - r2.revealed_at))) <= 86400
      and not exists (select 1 from public.reputation_flags rf where rf.provider_id = p_provider_id and rf.reason = 'RECIPROCAL_5_STAR_BURST' and (rf.payload->>'agreement_id')::uuid = r1.agreement_id);

    return v_rep;
end;
$$;

-- ============================================================================
-- PART 4: EVENT DISPATCHER & CONSUMER INFRASTRUCTURE
-- ============================================================================

create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_enqueued integer := 0;
begin
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'trust_ledger')
    on conflict (event_id, consumer) do nothing;

    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'reviews_reputation')
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
end;
$$;

create or replace function public.process_agreement_completed_event(p_event_id uuid, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
    v_agr_id uuid;
    v_agr record;
    v_terms_ver record;
    v_proposer_lines jsonb;
    v_recipient_lines jsonb;
    v_contract_ref text;
    v_completed_month date;
begin
    v_agr_id := (p_payload->>'agreement_id')::uuid;
    if v_agr_id is null then select aggregate_id into v_agr_id from public.domain_events where id = p_event_id; end if;
    if v_agr_id is null then raise exception 'INVALID_PAYLOAD: Missing agreement_id'; end if;

    select * into v_agr from public.agreements where id = v_agr_id;
    if v_agr.id is null then raise exception 'AGREEMENT_NOT_FOUND: %', v_agr_id; end if;

    select * into v_terms_ver from public.trade_terms_versions where version = v_agr.trade_terms_version;

    if v_terms_ver.includes_public_ledger = true and v_agr.accepted_revision_id is not null then
        v_contract_ref := substr(coalesce(v_agr.terms_hash, md5(v_agr.id::text)), 1, 12);
        v_completed_month := date_trunc('month', coalesce(v_agr.completed_at, now()))::date;

        select coalesce(jsonb_agg(jsonb_build_object('title', coalesce(spv.snapshot->>'title', 'Service Package'), 'quantity', al.quantity) order by al.id), '[]'::jsonb)
        into v_proposer_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id and al.side = 'proposer_gives';

        select coalesce(jsonb_agg(jsonb_build_object('title', coalesce(spv.snapshot->>'title', 'Service Package'), 'quantity', al.quantity) order by al.id), '[]'::jsonb)
        into v_recipient_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id and al.side = 'recipient_gives';

        insert into public.ledger_entries (agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code)
        values (v_agr.id, v_agr.proposer_id, v_agr.recipient_id, v_proposer_lines, v_recipient_lines, v_completed_month, v_contract_ref, v_agr.country_code)
        on conflict (agreement_id, provider_id) do nothing;

        insert into public.ledger_entries (agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code)
        values (v_agr.id, v_agr.recipient_id, v_agr.proposer_id, v_recipient_lines, v_proposer_lines, v_completed_month, v_contract_ref, v_agr.country_code)
        on conflict (agreement_id, provider_id) do nothing;
    end if;

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values 
        (v_agr.proposer_id, v_agr.id, 'review.requested', 'Trade Completed — Leave a Review', 'Your trade has been completed. Leave a double-blind review for your partner within 14 days.', '/dashboard/reviews'),
        (v_agr.recipient_id, v_agr.id, 'review.requested', 'Trade Completed — Leave a Review', 'Your trade has been completed. Leave a double-blind review for your partner within 14 days.', '/dashboard/reviews');

    return true;
end;
$$;

create or replace function public.process_review_events(p_event_id uuid, p_event_type text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_reviewee_id uuid;
begin
    v_reviewee_id := (p_payload->>'reviewee_id')::uuid;
    if v_reviewee_id is not null then perform public.recompute_provider_reputation(v_reviewee_id); end if;
    return true;
end;
$$;

create or replace function public.dispatch_domain_events(p_batch_size integer default 20)
returns table (processed_count integer, failed_count integer, dead_letter_count integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_processed integer := 0; v_failed integer := 0; v_dead_letter integer := 0;
    v_row record; v_de record; v_err text;
begin
    perform public.enqueue_pending_domain_event_deliveries();

    for v_row in 
        select ded.* from public.domain_event_deliveries ded
        where ded.status in ('pending', 'processing') and ded.next_attempt_at <= now()
        order by ded.next_attempt_at asc limit least(coalesce(p_batch_size, 20), 100)
        for update skip locked
    loop
        select * into v_de from public.domain_events where id = v_row.event_id;

        begin
            if v_row.consumer = 'trust_ledger' and v_de.event_type = 'agreement.completed' then
                perform public.process_agreement_completed_event(v_de.id, v_de.payload);
            elsif v_row.consumer = 'reviews_reputation' and v_de.event_type in ('review.revealed', 'review.moderated') then
                perform public.process_review_events(v_de.id, v_de.event_type, v_de.payload);
            end if;

            update public.domain_event_deliveries
            set status = 'delivered', attempts = attempts + 1, last_error = null, processed_at = now()
            where id = v_row.id;
            v_processed := v_processed + 1;
        exception when others then
            v_err := SQLERRM;
            v_failed := v_failed + 1;
            if (v_row.attempts + 1) >= 5 then
                update public.domain_event_deliveries
                set status = 'dead_letter', attempts = attempts + 1, last_error = v_err, processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                update public.domain_event_deliveries
                set status = 'pending', attempts = attempts + 1, last_error = v_err, next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempts))
                where id = v_row.id;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;

create or replace function public.check_review_windows_and_reveal()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_count integer := 0; v_rev record;
begin
    for v_rev in
        select r.id, r.reviewee_id, r.reviewer_id, r.agreement_id
        from public.reviews r join public.agreements a on a.id = r.agreement_id
        where r.status = 'submitted' and now() > (a.completed_at + interval '14 days')
    loop
        update public.reviews
        set status = 'revealed', revealed_at = now(), updated_at = now()
        where id = v_rev.id;

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        values ('review', v_rev.id, 'review.revealed', jsonb_build_object('review_id', v_rev.id, 'reviewee_id', v_rev.reviewee_id, 'reason', 'window_expired'));

        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values (v_rev.reviewee_id, v_rev.agreement_id, 'review.revealed', 'Review Revealed', 'The 14-day review window closed. Your trading partner''s review is now visible.', '/dashboard/reviews');

        perform public.recompute_provider_reputation(v_rev.reviewee_id);
        v_count := v_count + 1;
    end loop;

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    select party.user_id, a.id, 'review.reminder', 'Review Window Reminder', 'You have 7 days left to submit a review for your recently completed barter trade.', '/dashboard/reviews'
    from public.agreements a cross join lateral (values (a.proposer_id), (a.recipient_id)) as party(user_id)
    where a.status = 'completed' and now() >= (a.completed_at + interval '7 days') and now() < (a.completed_at + interval '8 days')
      and not exists (select 1 from public.reviews r where r.agreement_id = a.id and r.reviewer_id = party.user_id)
      and not exists (select 1 from public.notifications n where n.agreement_id = a.id and n.user_id = party.user_id and n.event_type = 'review.reminder');

    return v_count;
end;
$$;

-- ============================================================================
-- PART 5: REVIEW RPC FUNCTIONS
-- ============================================================================

create or replace function public.submit_review(
    p_agreement_id uuid,
    p_overall integer,
    p_quality integer,
    p_communication integer,
    p_timeliness integer,
    p_would_trade_again boolean,
    p_body text default null,
    p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_reviewee_id uuid;
    v_rev_id uuid;
    v_cached_response jsonb;
    v_counter_rev record;
    v_is_revealed boolean := false;
    v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;

    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'submit_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id;
    if v_agr.id is null then raise exception 'NOT_FOUND: Barter agreement not found'; end if;
    if v_agr.status <> 'completed' or v_agr.completed_at is null then raise exception 'INVALID_STATE: Reviews can only be submitted for completed agreements'; end if;

    if v_user_id = v_agr.proposer_id then
        v_reviewee_id := v_agr.recipient_id;
    elsif v_user_id = v_agr.recipient_id then
        v_reviewee_id := v_agr.proposer_id;
    else
        raise exception 'NOT_A_PARTY: You are not a participant in this agreement';
    end if;

    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    if exists (select 1 from public.reviews where agreement_id = p_agreement_id and reviewer_id = v_user_id) then
        raise exception 'ALREADY_REVIEWED: You have already submitted a review for this barter agreement';
    end if;

    insert into public.reviews (
        agreement_id, reviewer_id, reviewee_id, overall_rating, quality_rating, communication_rating, timeliness_rating,
        would_trade_again, body, status, submitted_at, edit_until
    ) values (
        p_agreement_id, v_user_id, v_reviewee_id, p_overall, p_quality, p_communication, p_timeliness,
        p_would_trade_again, nullif(trim(p_body), ''), 'submitted', now(), now() + interval '1 hour'
    ) returning id into v_rev_id;

    select * into v_counter_rev from public.reviews
    where agreement_id = p_agreement_id and reviewer_id = v_reviewee_id and status = 'submitted';

    if v_counter_rev.id is not null then
        update public.reviews
        set status = 'revealed', revealed_at = now(), edit_until = now(), updated_at = now()
        where id in (v_rev_id, v_counter_rev.id);

        v_is_revealed := true;

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
        values 
            ('review', v_rev_id, 'review.revealed', v_user_id, jsonb_build_object('review_id', v_rev_id, 'reviewee_id', v_reviewee_id, 'agreement_id', p_agreement_id)),
            ('review', v_counter_rev.id, 'review.revealed', v_reviewee_id, jsonb_build_object('review_id', v_counter_rev.id, 'reviewee_id', v_user_id, 'agreement_id', p_agreement_id));

        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values
            (v_reviewee_id, p_agreement_id, 'review.revealed', 'New Review Revealed', 'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.', '/dashboard/reviews'),
            (v_user_id, p_agreement_id, 'review.revealed', 'New Review Revealed', 'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.', '/dashboard/reviews');

        perform public.recompute_provider_reputation(v_reviewee_id);
        perform public.recompute_provider_reputation(v_user_id);
    else
        insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
        values ('review', v_rev_id, 'review.submitted', v_user_id, jsonb_build_object('review_id', v_rev_id, 'agreement_id', p_agreement_id));
    end if;

    v_res := jsonb_build_object(
        'review_id', v_rev_id,
        'status', case when v_is_revealed then 'revealed' else 'submitted' end,
        'revealed', v_is_revealed
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'submit_review', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.edit_review(
    p_review_id uuid,
    p_overall integer,
    p_quality integer,
    p_communication integer,
    p_timeliness integer,
    p_would_trade_again boolean,
    p_body text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user_id uuid := (select auth.uid()); v_rev record;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewer_id <> v_user_id then raise exception 'FORBIDDEN: You can only edit your own review'; end if;
    if v_rev.status <> 'submitted' then raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be modified'; end if;
    if now() > v_rev.edit_until then raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour editing grace period has expired'; end if;

    update public.reviews
    set overall_rating = p_overall, quality_rating = p_quality, communication_rating = p_communication,
        timeliness_rating = p_timeliness, would_trade_again = p_would_trade_again, body = nullif(trim(p_body), ''), updated_at = now()
    where id = p_review_id;

    return jsonb_build_object('success', true, 'review_id', p_review_id);
end;
$$;

create or replace function public.withdraw_review(p_review_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user_id uuid := (select auth.uid()); v_rev record;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewer_id <> v_user_id then raise exception 'FORBIDDEN: You can only withdraw your own review'; end if;
    if v_rev.status <> 'submitted' then raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be withdrawn'; end if;
    if now() > v_rev.edit_until then raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour withdrawal grace period has expired'; end if;

    delete from public.reviews where id = p_review_id;
    return jsonb_build_object('success', true, 'withdrawn_id', p_review_id);
end;
$$;

create or replace function public.reply_to_review(p_review_id uuid, p_body text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record; v_clean_body text := trim(p_body);
    v_cached_response jsonb; v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys where key = p_idempotency_key and user_id = v_user_id and action = 'reply_to_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    if length(v_clean_body) < 1 or length(v_clean_body) > 500 then raise exception 'INVALID_LENGTH: Reply must be between 1 and 500 characters'; end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewee_id <> v_user_id then raise exception 'FORBIDDEN: Only the reviewee can post a public reply'; end if;
    if v_rev.status <> 'revealed' then raise exception 'NOT_REVEALED: Replies can only be posted after the review is publicly revealed'; end if;
    if exists (select 1 from public.review_replies where review_id = p_review_id) then raise exception 'ALREADY_REPLIED: You have already posted a reply'; end if;

    insert into public.review_replies (review_id, author_id, body)
    values (p_review_id, v_user_id, v_clean_body);

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values (v_rev.reviewer_id, v_rev.agreement_id, 'review.reply', 'Partner Replied to Your Review', 'Your trade partner posted a response to your review.', '/dashboard/reviews');

    v_res := jsonb_build_object('success', true, 'review_id', p_review_id);
    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response) values (p_idempotency_key, v_user_id, 'reply_to_review', v_res) on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.report_review(p_review_id uuid, p_reason public.report_reason, p_detail text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record; v_rep_id uuid; v_cached_response jsonb; v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys where key = p_idempotency_key and user_id = v_user_id and action = 'report_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewee_id <> v_user_id then raise exception 'FORBIDDEN: Only the reviewee can report a review'; end if;
    if exists (select 1 from public.review_reports where review_id = p_review_id and reporter_id = v_user_id) then raise exception 'ALREADY_REPORTED: You have already reported this review'; end if;

    insert into public.review_reports (review_id, reporter_id, reason, detail)
    values (p_review_id, v_user_id, p_reason, nullif(trim(p_detail), ''))
    returning id into v_rep_id;

    v_res := jsonb_build_object('success', true, 'report_id', v_rep_id);
    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response) values (p_idempotency_key, v_user_id, 'report_review', v_res) on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.moderate_review(p_review_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid := (select auth.uid());
    v_rev record; v_target_status public.review_status;
begin
    if v_admin_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if not exists (select 1 from public.user_roles where user_id = v_admin_id and role = 'admin') then
        raise exception 'FORBIDDEN: Admin privileges required for moderation';
    end if;

    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;

    if p_action = 'hide' then v_target_status := 'hidden_by_moderation';
    elsif p_action = 'restore' then v_target_status := 'revealed';
    else raise exception 'INVALID_ACTION: Moderation action must be "hide" or "restore"'; end if;

    update public.reviews set status = v_target_status, updated_at = now() where id = p_review_id;
    insert into public.review_moderation_log (review_id, admin_id, action, reason) values (p_review_id, v_admin_id, p_action, p_reason);
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values ('review', p_review_id, 'review.moderated', v_admin_id, jsonb_build_object('review_id', p_review_id, 'action', p_action, 'reviewee_id', v_rev.reviewee_id));

    perform public.recompute_provider_reputation(v_rev.reviewee_id);
    return jsonb_build_object('success', true, 'review_id', p_review_id, 'status', v_target_status);
end;
$$;

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY POLICIES
-- ============================================================================

alter table public.trade_terms_versions enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.review_reports enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.provider_reputation enable row level security;
alter table public.reputation_flags enable row level security;
alter table public.review_moderation_log enable row level security;
alter table public.domain_event_deliveries enable row level security;

create policy "Public can read trade terms versions" on public.trade_terms_versions for select to anon, authenticated using (true);
create policy "Double-blind reviews select policy" on public.reviews for select to anon, authenticated using (reviewer_id = (select auth.uid()) or status = 'revealed');
create policy "Public can view review replies" on public.review_replies for select to anon, authenticated using (true);
create policy "Reporters and admins can read reports" on public.review_reports for select to authenticated using (reporter_id = (select auth.uid()) or exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Public can view trust ledger entries" on public.ledger_entries for select to anon, authenticated using (true);
create policy "Public can view provider reputation" on public.provider_reputation for select to anon, authenticated using (true);
create policy "Admins can view reputation anomaly flags" on public.reputation_flags for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Admins can view review moderation log" on public.review_moderation_log for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Admins can view domain event deliveries" on public.domain_event_deliveries for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));

grant execute on function public.submit_review(uuid, int, int, int, int, boolean, text, text) to authenticated;
grant execute on function public.edit_review(uuid, int, int, int, int, boolean, text) to authenticated;
grant execute on function public.withdraw_review(uuid) to authenticated;
grant execute on function public.reply_to_review(uuid, text, text) to authenticated;
grant execute on function public.report_review(uuid, public.report_reason, text, text) to authenticated;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;
grant execute on function public.recompute_provider_reputation(uuid, timestamptz) to authenticated;
grant execute on function public.dispatch_domain_events(int) to authenticated, service_role;
grant execute on function public.check_review_windows_and_reveal() to authenticated, service_role;
-- ============================================================================
-- Trade Weft — Phase 5: Verification & Proof of Work Consolidated Migration
-- Run this migration in your Supabase SQL Editor to apply Phase 5 schema.
-- ============================================================================

-- 1. Enums
do $$ begin
    if not exists (select 1 from pg_type where typname = 'verification_method') then
        create type public.verification_method as enum ('oauth', 'domain', 'manual');
    end if;
    if not exists (select 1 from pg_type where typname = 'verification_status') then
        create type public.verification_status as enum (
            'submitted',
            'awaiting_proof',
            'pending_review',
            'verified',
            'rejected',
            'revoked',
            'expired'
        );
    end if;
    if not exists (select 1 from pg_type where typname = 'provider_verification_aggregate_status') then
        create type public.provider_verification_aggregate_status as enum ('none', 'pending', 'verified');
    end if;
    if not exists (select 1 from pg_type where typname = 'media_kind') then
        create type public.media_kind as enum ('package_cover', 'package_gallery', 'evidence');
    end if;
    if not exists (select 1 from pg_type where typname = 'media_status') then
        create type public.media_status as enum ('pending', 'processing', 'ready', 'rejected', 'deleted');
    end if;
    if not exists (select 1 from pg_type where typname = 'publish_gate_mode') then
        create type public.publish_gate_mode as enum ('none', 'link_pending_or_verified', 'verified');
    end if;
end $$;

-- Add 'verifier' role to app_role enum if not already present
alter type public.app_role add value if not exists 'verifier';

-- Add publish_gate to countries table if not present
alter table public.countries
add column if not exists publish_gate public.publish_gate_mode not null default 'link_pending_or_verified';

-- 2. Media Assets Table
create table if not exists public.media_assets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    kind public.media_kind not null,
    bucket text not null,
    path text not null,
    status public.media_status not null default 'pending',
    mime text not null,
    bytes bigint not null,
    width integer,
    height integer,
    sha256 text,
    blur_data_url text,
    variants jsonb default '{}'::jsonb,
    rejection_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.media_assets is 'Verified media assets processed via the Sharp image pipeline.';

-- 3. Portfolio Links Table
create table if not exists public.portfolio_links (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider_key text not null,
    url text not null,
    canonical_url text not null,
    external_account_id text,
    handle text,
    method public.verification_method not null,
    status public.verification_status not null default 'submitted',
    challenge_code text,
    challenge_expires_at timestamptz,
    evidence_asset_id uuid references public.media_assets(id) on delete set null,
    reviewed_by uuid references public.profiles(id) on delete set null,
    reject_reason text,
    reject_note text check (reject_note is null or length(reject_note) <= 300),
    verified_at timestamptz,
    last_checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.portfolio_links is 'External portfolio and profile links with ownership verification.';

create unique index if not exists idx_portfolio_links_unique_verified
    on public.portfolio_links (provider_key, external_account_id)
    where status = 'verified' and external_account_id is not null;

create index if not exists idx_portfolio_links_user_status
    on public.portfolio_links (user_id, status);

create index if not exists idx_portfolio_links_pending_review
    on public.portfolio_links (created_at asc)
    where status = 'pending_review';

-- 4. OAuth States Table (single-use, 10-minute expiry)
create table if not exists public.oauth_states (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider_key text not null,
    state_hash text not null unique,
    code_verifier text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

comment on table public.oauth_states is 'Short-lived cryptographic state parameters for standalone OAuth verification.';

-- 5. Provider Verification Aggregate
create table if not exists public.provider_verification (
    provider_id uuid primary key references public.profiles(id) on delete cascade,
    status public.provider_verification_aggregate_status not null default 'none',
    verified_link_count integer not null default 0,
    verified_since timestamptz,
    updated_at timestamptz not null default now()
);

comment on table public.provider_verification is 'Materialized aggregate of verified portfolio links per provider.';

-- 6. Verification Audit Log (Append-only)
create table if not exists public.verification_audit_log (
    id uuid primary key default gen_random_uuid(),
    link_id uuid not null references public.portfolio_links(id) on delete cascade,
    actor_id uuid not null references public.profiles(id),
    action text not null,
    from_status public.verification_status,
    to_status public.verification_status not null,
    reason text,
    note text,
    created_at timestamptz not null default now()
);

comment on table public.verification_audit_log is 'Append-only audit trail for all verification approvals, rejections, and revocations.';

-- 7. Package Media Table
create table if not exists public.package_media (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    asset_id uuid not null references public.media_assets(id) on delete cascade,
    position smallint not null default 0,
    alt_text text not null check (length(alt_text) <= 150),
    is_cover boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (package_id, asset_id)
);

comment on table public.package_media is 'Mapping between published service packages and processed media assets.';

create unique index if not exists idx_package_media_unique_cover
    on public.package_media (package_id)
    where is_cover = true;

create index if not exists idx_package_media_order
    on public.package_media (package_id, position asc);

create index if not exists idx_media_assets_owner_status
    on public.media_assets (owner_id, status);

create index if not exists idx_media_assets_sweep
    on public.media_assets (created_at asc)
    where status in ('pending', 'processing');

-- 8. Provision Storage Buckets (Idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('quarantine', 'quarantine', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('public-media', 'public-media', true, 5242880, array['image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 9. Limits & Trigger Functions
create or replace function public.enforce_portfolio_link_limits()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_link_count integer;
begin
    select count(*) into v_link_count from public.portfolio_links where user_id = new.user_id;
    if v_link_count >= 10 then
        raise exception 'LINK_LIMIT_EXCEEDED: You cannot register more than 10 portfolio links.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_portfolio_link_limits on public.portfolio_links;
create trigger trg_enforce_portfolio_link_limits
    before insert on public.portfolio_links
    for each row execute function public.enforce_portfolio_link_limits();

create or replace function public.enforce_media_asset_limits()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_asset_count integer;
    v_total_bytes bigint;
begin
    select count(*), coalesce(sum(bytes), 0) into v_asset_count, v_total_bytes
    from public.media_assets where owner_id = new.owner_id and status != 'deleted';
    if v_asset_count >= 100 then
        raise exception 'MEDIA_LIMIT_EXCEEDED: You cannot exceed 100 media assets.';
    end if;
    if (v_total_bytes + new.bytes) > 209715200 then
        raise exception 'STORAGE_QUOTA_EXCEEDED: You cannot exceed 200 MB of total media storage.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_media_asset_limits on public.media_assets;
create trigger trg_enforce_media_asset_limits
    before insert on public.media_assets
    for each row execute function public.enforce_media_asset_limits();

create or replace function public.prevent_audit_log_modification()
returns trigger language plpgsql as $$
begin
    raise exception 'FORBIDDEN: verification_audit_log is append-only.';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.verification_audit_log;
create trigger trg_prevent_audit_log_modification
    before update or delete on public.verification_audit_log
    for each row execute function public.prevent_audit_log_modification();

-- 10. Provider Verification Recompute & Triggers
create or replace function public.recompute_provider_verification(p_provider_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_verified_count integer;
    v_pending_count integer;
    v_first_verified timestamptz;
    v_old_status public.provider_verification_aggregate_status := 'none';
    v_new_status public.provider_verification_aggregate_status := 'none';
begin
    select status into v_old_status from public.provider_verification where provider_id = p_provider_id;
    select count(*), min(verified_at) into v_verified_count, v_first_verified
    from public.portfolio_links where user_id = p_provider_id and status = 'verified';
    select count(*) into v_pending_count
    from public.portfolio_links where user_id = p_provider_id and status in ('submitted', 'awaiting_proof', 'pending_review');

    if v_verified_count > 0 then
        v_new_status := 'verified';
    elsif v_pending_count > 0 then
        v_new_status := 'pending';
    else
        v_new_status := 'none';
    end if;

    insert into public.provider_verification (provider_id, status, verified_link_count, verified_since, updated_at)
    values (
        p_provider_id,
        v_new_status,
        v_verified_count,
        case when v_verified_count > 0 then coalesce(v_first_verified, now()) else null end,
        now()
    )
    on conflict (provider_id) do update set
        status = excluded.status,
        verified_link_count = excluded.verified_link_count,
        verified_since = case
            when excluded.verified_link_count > 0 then coalesce(public.provider_verification.verified_since, excluded.verified_since)
            else null
        end,
        updated_at = now();

    if v_old_status = 'verified' and v_new_status != 'verified' then
        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.status.changed',
            'provider',
            p_provider_id,
            jsonb_build_object(
                'provider_id', p_provider_id,
                'from_status', v_old_status,
                'to_status', v_new_status,
                'verified_link_count', v_verified_count
            )
        );
    end if;

    return jsonb_build_object('provider_id', p_provider_id, 'status', v_new_status, 'verified_link_count', v_verified_count);
end;
$$;

create or replace function public.trg_sync_provider_verification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid;
begin
    v_user_id := coalesce(new.user_id, old.user_id);
    perform public.recompute_provider_verification(v_user_id);
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_provider_verification on public.portfolio_links;
create trigger trg_sync_provider_verification
    after insert or update of status, external_account_id or delete on public.portfolio_links
    for each row execute function public.trg_sync_provider_verification();

-- 11. Views
create or replace view public.public_verified_portfolio_links as
select
    id,
    user_id,
    provider_key,
    canonical_url,
    handle,
    verified_at
from public.portfolio_links
where status = 'verified';

create or replace view public.public_provider_profiles as
select 
    p.id,
    p.display_name,
    p.business_name,
    p.avatar_url,
    p.city_id,
    p.area_id,
    p.created_at as member_since,
    pr.score as reliability_score,
    coalesce(pr.tier, 'new'::public.reputation_tier) as reputation_tier,
    coalesce(pr.completed_trades, 0) as completed_trades_count,
    coalesce(pr.distinct_partners, 0) as distinct_partners_count,
    pr.avg_overall as avg_overall_rating,
    pr.would_trade_again_pct,
    pr.avg_quality as avg_quality_rating,
    pr.avg_communication as avg_communication_rating,
    pr.avg_timeliness as avg_timeliness_rating,
    (coalesce(pr.distinct_partners, 0) >= 3 and pr.score is not null) as is_score_visible,
    coalesce(pv.status, 'none'::public.provider_verification_aggregate_status) as verification_status,
    coalesce(pv.verified_link_count, 0) as verified_link_count,
    pv.verified_since
from public.profiles p
left join public.provider_reputation pr on pr.provider_id = p.id
left join public.provider_verification pv on pv.provider_id = p.id;

-- 12. RPC Functions
create or replace function public.is_verifier_or_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role::text in ('verifier', 'admin')
    );
$$;

create or replace function public.create_portfolio_link(
    p_provider_key text,
    p_url text,
    p_canonical_url text,
    p_handle text default null,
    p_method public.verification_method default 'manual'
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid;
    v_link_id uuid;
    v_challenge_code text;
    v_initial_status public.verification_status;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'UNAUTHORIZED: Authentication required.';
    end if;

    v_challenge_code := 'tw-verify-' || lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

    if p_method = 'oauth' or p_method = 'domain' then
        v_initial_status := 'awaiting_proof';
    else
        v_initial_status := 'submitted';
    end if;

    insert into public.portfolio_links (
        user_id,
        provider_key,
        url,
        canonical_url,
        handle,
        method,
        status,
        challenge_code,
        challenge_expires_at
    )
    values (
        v_user_id,
        p_provider_key,
        p_url,
        p_canonical_url,
        p_handle,
        p_method,
        v_initial_status,
        v_challenge_code,
        now() + interval '7 days'
    )
    returning id into v_link_id;

    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
        'verification.link.submitted',
        'portfolio_link',
        v_link_id,
        jsonb_build_object('link_id', v_link_id, 'user_id', v_user_id, 'provider_key', p_provider_key, 'method', p_method, 'status', v_initial_status)
    );

    return jsonb_build_object(
        'link_id', v_link_id,
        'challenge_code', v_challenge_code,
        'challenge_expires_at', (now() + interval '7 days'),
        'status', v_initial_status
    );
end;
$$;

create or replace function public.submit_manual_evidence(
    p_link_id uuid,
    p_evidence_asset_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid;
    v_link record;
    v_asset record;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'UNAUTHORIZED: Authentication required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id and user_id = v_user_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found or unauthorized.';
    end if;

    if v_link.status not in ('submitted', 'rejected') then
        raise exception 'INVALID_STATE: Evidence can only be submitted for links awaiting proof or resubmission.';
    end if;

    select * into v_asset from public.media_assets where id = p_evidence_asset_id and owner_id = v_user_id;
    if not found then
        raise exception 'ASSET_NOT_FOUND: Evidence media asset not found or unauthorized.';
    end if;

    if v_asset.kind != 'evidence' then
        raise exception 'INVALID_ASSET_KIND: Uploaded file is not marked as verification evidence.';
    end if;

    update public.portfolio_links
    set evidence_asset_id = p_evidence_asset_id,
        status = 'pending_review',
        updated_at = now()
    where id = p_link_id;

    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, note)
    values (p_link_id, v_user_id, 'submit_evidence', v_link.status, 'pending_review', 'Evidence uploaded by provider');

    return jsonb_build_object('success', true, 'status', 'pending_review');
end;
$$;

create or replace function public.admin_review_link(
    p_link_id uuid,
    p_decision text,
    p_reject_reason text default null,
    p_reject_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid;
    v_link record;
    v_new_status public.verification_status;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    if p_decision = 'approve' then
        v_new_status := 'verified';

        if v_link.external_account_id is not null and exists (
            select 1 from public.portfolio_links
            where provider_key = v_link.provider_key
              and external_account_id = v_link.external_account_id
              and status = 'verified'
              and id != p_link_id
        ) then
            raise exception 'ACCOUNT_ALREADY_VERIFIED: This external account is already verified by another provider.';
        end if;

        update public.portfolio_links
        set status = 'verified',
            verified_at = now(),
            reviewed_by = v_admin_id,
            reject_reason = null,
            reject_note = null,
            updated_at = now()
        where id = p_link_id;

        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status)
        values (p_link_id, v_admin_id, 'approve', v_link.status, 'verified');

        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.approved',
            'Portfolio Link Verified',
            'Your ' || v_link.provider_key || ' link has been approved and verified.',
            jsonb_build_object('link_id', p_link_id, 'provider_key', v_link.provider_key)
        );

        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.link.verified',
            'portfolio_link',
            p_link_id,
            jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'provider_key', v_link.provider_key)
        );

    elsif p_decision = 'reject' then
        v_new_status := 'rejected';

        update public.portfolio_links
        set status = 'rejected',
            reject_reason = p_reject_reason,
            reject_note = p_reject_note,
            reviewed_by = v_admin_id,
            updated_at = now()
        where id = p_link_id;

        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason, note)
        values (p_link_id, v_admin_id, 'reject', v_link.status, 'rejected', p_reject_reason, p_reject_note);

        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.rejected',
            'Portfolio Verification Update',
            'Your ' || v_link.provider_key || ' verification could not be approved: ' || coalesce(p_reject_note, p_reject_reason, 'Verification criteria not met.'),
            jsonb_build_object('link_id', p_link_id, 'reason', p_reject_reason, 'note', p_reject_note)
        );

        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.link.rejected',
            'portfolio_link',
            p_link_id,
            jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'reason', p_reject_reason)
        );
    else
        raise exception 'INVALID_DECISION: Decision must be approve or reject.';
    end if;

    return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

create or replace function public.admin_revoke_link(
    p_link_id uuid,
    p_reason text
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid;
    v_link record;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    update public.portfolio_links
    set status = 'revoked',
        reject_reason = p_reason,
        reviewed_by = v_admin_id,
        updated_at = now()
    where id = p_link_id;

    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason)
    values (p_link_id, v_admin_id, 'revoke', v_link.status, 'revoked', p_reason);

    insert into public.notifications (user_id, type, title, body, data)
    values (
        v_link.user_id,
        'verification.revoked',
        'Portfolio Link Revoked',
        'Your verified ' || v_link.provider_key || ' link was revoked: ' || p_reason,
        jsonb_build_object('link_id', p_link_id, 'reason', p_reason)
    );

    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
        'verification.link.revoked',
        'portfolio_link',
        p_link_id,
        jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'reason', p_reason)
    );

    return jsonb_build_object('success', true, 'status', 'revoked');
end;
$$;

create or replace function public.system_pause_packages_for_unverified(
    p_provider_id uuid
)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_country_code text;
    v_gate public.publish_gate_mode;
    v_current_status public.provider_verification_aggregate_status;
    v_paused_count integer := 0;
begin
    select country_code into v_country_code from public.profiles where id = p_provider_id;
    select publish_gate into v_gate from public.countries where code = v_country_code;
    v_gate := coalesce(v_gate, 'link_pending_or_verified');

    if v_gate = 'none' then
        return 0;
    end if;

    select status into v_current_status from public.provider_verification where provider_id = p_provider_id;
    v_current_status := coalesce(v_current_status, 'none');

    if (v_gate = 'verified' and v_current_status != 'verified') or
       (v_gate = 'link_pending_or_verified' and v_current_status = 'none') then

        update public.service_packages
        set status = 'paused',
            updated_at = now()
        where provider_id = p_provider_id
          and status = 'published';

        get diagnostics v_paused_count = row_count;

        if v_paused_count > 0 then
            insert into public.notifications (user_id, type, title, body, data)
            values (
                p_provider_id,
                'verification.revoked',
                'Service Listings Paused',
                'Your active service packages have been paused because your portfolio verification status changed. Please verify your portfolio links to republish.',
                jsonb_build_object('paused_count', v_paused_count, 'gate', v_gate)
            );
        end if;
    end if;

    return v_paused_count;
end;
$$;

create or replace function public.grant_verifier_role(p_user_email text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
    v_uid uuid;
begin
    select id into v_uid from auth.users where email = p_user_email;
    if not found then
        raise exception 'USER_NOT_FOUND: User with specified email does not exist.';
    end if;
    insert into public.user_roles (user_id, role) values (v_uid, 'verifier')
    on conflict (user_id, role) do nothing;
    return true;
end;
$$;

-- 13. RLS Policies
alter table public.portfolio_links enable row level security;
alter table public.oauth_states enable row level security;
alter table public.provider_verification enable row level security;
alter table public.verification_audit_log enable row level security;
alter table public.media_assets enable row level security;
alter table public.package_media enable row level security;

create policy "Owners and verifiers can view portfolio links"
    on public.portfolio_links for select to authenticated
    using (user_id = auth.uid() or public.is_verifier_or_admin());

create policy "Users can insert own portfolio links"
    on public.portfolio_links for insert to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own unverified portfolio links"
    on public.portfolio_links for update to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'))
    with check (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

create policy "Users can delete own unverified portfolio links"
    on public.portfolio_links for delete to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

create policy "Users can manage own oauth states"
    on public.oauth_states for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Public can view provider verification aggregates"
    on public.provider_verification for select to anon, authenticated
    using (true);

create policy "Verifiers can view audit logs"
    on public.verification_audit_log for select to authenticated
    using (public.is_verifier_or_admin());

create policy "Users and verifiers can view media assets"
    on public.media_assets for select to authenticated
    using (owner_id = auth.uid() or public.is_verifier_or_admin() or bucket = 'public-media');

create policy "Users can insert own media asset records"
    on public.media_assets for insert to authenticated
    with check (owner_id = auth.uid());

create policy "Users can update own media asset records"
    on public.media_assets for update to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Users can delete own media assets"
    on public.media_assets for delete to authenticated
    using (owner_id = auth.uid());

create policy "Public can view package media"
    on public.package_media for select to anon, authenticated
    using (true);

create policy "Package owners can manage package media"
    on public.package_media for all to authenticated
    using (exists (select 1 from public.service_packages sp where sp.id = package_id and sp.provider_id = auth.uid()))
    with check (exists (select 1 from public.service_packages sp where sp.id = package_id and sp.provider_id = auth.uid()));

-- Storage Policies
drop policy if exists "Authenticated users can upload to quarantine own folder" on storage.objects;
create policy "Authenticated users can upload to quarantine own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read own quarantine objects" on storage.objects;
create policy "Users can read own quarantine objects"
    on storage.objects for select to authenticated
    using (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own quarantine objects" on storage.objects;
create policy "Users can delete own quarantine objects"
    on storage.objects for delete to authenticated
    using (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload to evidence own folder" on storage.objects;
create policy "Users can upload to evidence own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners and verifiers can view evidence objects" on storage.objects;
create policy "Owners and verifiers can view evidence objects"
    on storage.objects for select to authenticated
    using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_verifier_or_admin()));

drop policy if exists "Public read for public-media" on storage.objects;
create policy "Public read for public-media"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'public-media');

-- Grants
grant select on public.public_verified_portfolio_links to anon, authenticated;
grant select on public.provider_verification to anon, authenticated;
grant select on public.package_media to anon, authenticated;
grant execute on function public.create_portfolio_link(text, text, text, text, public.verification_method) to authenticated;
grant execute on function public.submit_manual_evidence(uuid, uuid) to authenticated;
grant execute on function public.admin_review_link(uuid, text, text, text) to authenticated;
grant execute on function public.admin_revoke_link(uuid, text) to authenticated;
-- ============================================================================
-- Trade Weft — Phase 5: Verification Auto-Pause Event Consumer
-- Wires verification.status.changed events to auto-pause service packages
-- when a provider drops below their country's publish gate requirement.
-- ============================================================================

create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_enqueued integer := 0;
begin
    -- 1. Trust ledger consumer for completed agreements
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'trust_ledger')
    on conflict (event_id, consumer) do nothing;

    -- 2. Reviews reputation consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'reviews_reputation')
    on conflict (event_id, consumer) do nothing;

    -- 3. Verification auto-pause consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'verification_auto_pause', 'pending', now()
    from public.domain_events de
    where de.event_type = 'verification.status.changed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'verification_auto_pause')
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
end;
$$;

create or replace function public.dispatch_domain_events(p_batch_size integer default 20)
returns table (processed_count integer, failed_count integer, dead_letter_count integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_processed integer := 0; v_failed integer := 0; v_dead_letter integer := 0;
    v_row record; v_de record; v_err text;
begin
    perform public.enqueue_pending_domain_event_deliveries();

    for v_row in 
        select ded.* from public.domain_event_deliveries ded
        where ded.status in ('pending', 'processing') and ded.next_attempt_at <= now()
        order by ded.next_attempt_at asc limit least(coalesce(p_batch_size, 20), 100)
        for update skip locked
    loop
        select * into v_de from public.domain_events where id = v_row.event_id;

        begin
            if v_row.consumer = 'trust_ledger' and v_de.event_type = 'agreement.completed' then
                perform public.process_agreement_completed_event(v_de.id, v_de.payload);
            elsif v_row.consumer = 'reviews_reputation' and v_de.event_type in ('review.revealed', 'review.moderated') then
                perform public.process_review_events(v_de.id, v_de.event_type, v_de.payload);
            elsif v_row.consumer = 'verification_auto_pause' and v_de.event_type = 'verification.status.changed' then
                perform public.system_pause_packages_for_unverified(v_de.aggregate_id);
            end if;

            update public.domain_event_deliveries
            set status = 'delivered', attempts = attempts + 1, last_error = null, processed_at = now()
            where id = v_row.id;
            v_processed := v_processed + 1;
        exception when others then
            v_err := SQLERRM;
            if v_row.attempts + 1 >= 5 then
                update public.domain_event_deliveries
                set status = 'dead_letter', attempts = attempts + 1, last_error = v_err, processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                update public.domain_event_deliveries
                set status = 'pending', attempts = attempts + 1, last_error = v_err,
                    next_attempt_at = now() + (power(2, v_row.attempts) * interval '30 seconds')
                where id = v_row.id;
                v_failed := v_failed + 1;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;
-- Migration 20261016000001: Monetization Enums and Tables
-- Payments, append-only ledger, price book, plans, ad products, subscriptions, promotions, and analytics

-- 1. Enums
do $$
begin
    if not exists (select 1 from pg_type where typname = 'payment_provider_code') then
        create type public.payment_provider_code as enum ('mpesa_daraja', 'airtel_money', 'mtn_momo');
    end if;

    if not exists (select 1 from pg_type where typname = 'payment_status') then
        create type public.payment_status as enum ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'timed_out');
    end if;

    if not exists (select 1 from pg_type where typname = 'payment_purpose') then
        create type public.payment_purpose as enum ('top_ad', 'boost_period');
    end if;

    if not exists (select 1 from pg_type where typname = 'ledger_entry_type') then
        create type public.ledger_entry_type as enum ('charge', 'refund', 'adjustment');
    end if;

    if not exists (select 1 from pg_type where typname = 'promotion_status') then
        create type public.promotion_status as enum ('held', 'active', 'expired', 'cancelled');
    end if;

    if not exists (select 1 from pg_type where typname = 'subscription_status') then
        create type public.subscription_status as enum ('pending', 'active', 'grace', 'expired', 'cancelled');
    end if;

    if not exists (select 1 from pg_type where typname = 'billing_mode') then
        create type public.billing_mode as enum ('prepaid_stk', 'standing_order');
    end if;
end $$;

-- 2. Add 'finance' role to app_role enum
alter type public.app_role add value if not exists 'finance';

-- 3. Payment Providers Table
create table if not exists public.payment_providers (
    code public.payment_provider_code primary key,
    name text not null,
    country_code text not null references public.countries(code) on delete cascade,
    is_enabled boolean not null default true,
    amount_granularity_minor integer not null default 100 check (amount_granularity_minor > 0),
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 4. Ad Products Catalog
create table if not exists public.ad_products (
    id text primary key,
    duration_days integer not null check (duration_days in (7, 14, 30)),
    name text not null,
    description text,
    created_at timestamptz not null default now()
);

-- 5. Boost Plans Catalog
create table if not exists public.plans (
    id text primary key,
    name text not null,
    description text,
    billing_cycle_days integer not null default 30 check (billing_cycle_days = 30),
    entitlements jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 6. Country-Scoped Price Book
create table if not exists public.price_book (
    id uuid primary key default gen_random_uuid(),
    product_id text not null,
    product_type text not null check (product_type in ('ad_product', 'plan')),
    country_code text not null references public.countries(code) on delete cascade,
    currency_code text not null,
    amount_minor bigint not null check (amount_minor >= 0),
    tax_rate_bps integer not null default 1600 check (tax_rate_bps >= 0),
    tax_inclusive boolean not null default true,
    effective_from timestamptz not null default now(),
    effective_to timestamptz,
    created_at timestamptz not null default now(),
    constraint check_effective_window check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_price_book_lookup 
on public.price_book (country_code, product_id, effective_from desc);

-- 7. Payments Table
create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    payer_id uuid not null references public.profiles(id) on delete restrict,
    purpose public.payment_purpose not null,
    target_id uuid not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency_code text not null,
    provider public.payment_provider_code not null,
    status public.payment_status not null default 'created',
    merchant_request_id text,
    checkout_request_id text,
    receipt_number text,
    msisdn text not null,
    idempotency_key text not null,
    failure_code text,
    failure_reason text,
    attempts integer not null default 0 check (attempts >= 0),
    price_book_id uuid references public.price_book(id) on delete set null,
    tax_amount_minor bigint not null default 0 check (tax_amount_minor >= 0),
    price_snapshot jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_payments_payer_idempotency unique (payer_id, idempotency_key)
);

create unique index if not exists idx_payments_provider_checkout
on public.payments (provider, checkout_request_id)
where checkout_request_id is not null;

create index if not exists idx_payments_payer_created
on public.payments (payer_id, created_at desc);

create index if not exists idx_payments_pending_poll
on public.payments (status, created_at)
where status = 'pending';

-- 8. Raw Ingested Payment Events (Restricted/Append-only audit)
create table if not exists public.payment_events_raw (
    id uuid primary key default gen_random_uuid(),
    provider public.payment_provider_code not null,
    event_type text not null,
    checkout_request_id text,
    payload jsonb not null,
    received_at timestamptz not null default now(),
    is_redacted boolean not null default false,
    redacted_at timestamptz
);

create index if not exists idx_payment_events_raw_checkout
on public.payment_events_raw (checkout_request_id)
where checkout_request_id is not null;

-- 9. Append-Only Payment Ledger
create table if not exists public.payment_ledger (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id) on delete restrict,
    payer_id uuid not null references public.profiles(id) on delete restrict,
    entry_type public.ledger_entry_type not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency_code text not null,
    reference_note text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_ledger_payment
on public.payment_ledger (payment_id);

create index if not exists idx_payment_ledger_payer
on public.payment_ledger (payer_id, created_at desc);

-- 10. Listing Promotions Table (Top Ads)
create table if not exists public.listing_promotions (
    id uuid primary key default gen_random_uuid(),
    package_id uuid not null references public.service_packages(id) on delete cascade,
    provider_id uuid not null references public.profiles(id) on delete cascade,
    country_code text not null references public.countries(code) on delete cascade,
    city_id uuid not null references public.locations(id) on delete cascade,
    category_id uuid not null references public.service_categories(id) on delete cascade,
    slot_no integer not null check (slot_no between 1 and 3),
    period tstzrange not null,
    status public.promotion_status not null default 'held',
    payment_id uuid references public.payments(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_listing_promotions_active_lookup
on public.listing_promotions (country_code, city_id, category_id, status)
where status = 'active';

create index if not exists idx_listing_promotions_provider
on public.listing_promotions (provider_id, created_at desc);

-- 11. Subscriptions Table (Boost Packages)
create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id text not null references public.plans(id) on delete restrict,
    status public.subscription_status not null default 'pending',
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    grace_period_end timestamptz not null,
    cancel_at_period_end boolean not null default false,
    billing_mode public.billing_mode not null default 'prepaid_stk',
    mandate_ref text,
    latest_payment_id uuid references public.payments(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint check_subscription_period check (current_period_end > current_period_start),
    constraint check_subscription_grace check (grace_period_end >= current_period_end)
);

create unique index if not exists idx_subscriptions_user_active
on public.subscriptions (user_id)
where status in ('active', 'grace', 'pending');

-- 12. Subscription Invoices Table
create table if not exists public.subscription_invoices (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.subscriptions(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id text not null references public.plans(id) on delete restrict,
    period_start timestamptz not null,
    period_end timestamptz not null,
    amount_minor bigint not null check (amount_minor >= 0),
    currency_code text not null,
    status text not null check (status in ('pending', 'paid', 'void', 'overdue')),
    payment_id uuid references public.payments(id) on delete set null,
    due_at timestamptz not null,
    paid_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_subscription_invoices_user
on public.subscription_invoices (user_id, created_at desc);

-- 13. Privacy-First Daily Analytics Stats Tables
create table if not exists public.package_daily_stats (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    date date not null default current_date,
    impressions integer not null default 0 check (impressions >= 0),
    views integer not null default 0 check (views >= 0),
    proposal_starts integer not null default 0 check (proposal_starts >= 0),
    primary key (package_id, date)
);

create table if not exists public.promotion_daily_stats (
    promotion_id uuid not null references public.listing_promotions(id) on delete cascade,
    date date not null default current_date,
    impressions integer not null default 0 check (impressions >= 0),
    clicks integer not null default 0 check (clicks >= 0),
    primary key (promotion_id, date)
);

-- 14. Financial Audit Trail
create table if not exists public.payment_audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.profiles(id) on delete restrict,
    action text not null,
    target_type text not null,
    target_id text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_audit_log_target
on public.payment_audit_log (target_type, target_id);
-- Migration 20261016000002: Monetization Constraints, Integrity Triggers, and Append-Only Defenses

-- 1. Enable btree_gist for multi-column exclusion constraints
create extension if not exists btree_gist;

-- 2. Exclusion Constraint on listing_promotions (Overbooking Prevention)
-- Guarantees that at the database level, no two held or active promotions
-- can ever overlap on the same (country, city, category, slot_no) period.
alter table public.listing_promotions
drop constraint if exists no_overlapping_promoted_slots;

alter table public.listing_promotions
add constraint no_overlapping_promoted_slots
exclude using gist (
    country_code with =,
    city_id with =,
    category_id with =,
    slot_no with =,
    period with &&
) where (status in ('held', 'active'));

-- 3. Append-Only Trigger on payment_ledger
create or replace function public.prevent_payment_ledger_mutation()
returns trigger
language plpgsql
security definer
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_ledger cannot be updated or deleted';
end;
$$;

drop trigger if exists tr_payment_ledger_append_only on public.payment_ledger;
create trigger tr_payment_ledger_append_only
before update or delete on public.payment_ledger
for each row
execute function public.prevent_payment_ledger_mutation();

-- 4. Append-Only Trigger on payment_audit_log
create or replace function public.prevent_payment_audit_mutation()
returns trigger
language plpgsql
security definer
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_audit_log cannot be updated or deleted';
end;
$$;

drop trigger if exists tr_payment_audit_append_only on public.payment_audit_log;
create trigger tr_payment_audit_append_only
before update or delete on public.payment_audit_log
for each row
execute function public.prevent_payment_audit_mutation();

-- 5. Updated_At Triggers for Stateful Tables
drop trigger if exists tr_payments_updated_at on public.payments;
create trigger tr_payments_updated_at
before update on public.payments
for each row
execute function public.handle_updated_at();

drop trigger if exists tr_listing_promotions_updated_at on public.listing_promotions;
create trigger tr_listing_promotions_updated_at
before update on public.listing_promotions
for each row
execute function public.handle_updated_at();

drop trigger if exists tr_subscriptions_updated_at on public.subscriptions;
create trigger tr_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.handle_updated_at();
-- Migration 20261016000003: Entitlements Engine and Publish Gate Integration

-- 1. Get Entitlements SQL Function
-- Single source of truth for user caps and feature access.
create or replace function public.get_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_sub record;
    v_rank_bonus integer := 0;
    v_max_active integer := 10;
    v_max_top_ads integer := 1;
    v_analytics text := 'basic';
    v_csv_export boolean := false;
    v_plan_id text := 'free';
    v_status text := 'none';
    v_is_subscribed boolean := false;
    v_in_grace boolean := false;
begin
    if p_user_id is null then
        return jsonb_build_object(
            'plan_id', 'free',
            'is_subscribed', false,
            'in_grace', false,
            'status', 'none',
            'rank_bonus_days', 0,
            'max_active_packages', 10,
            'max_concurrent_top_ads', 1,
            'analytics_level', 'basic',
            'csv_export', false
        );
    end if;

    -- Query active or grace subscription
    select s.plan_id, s.status, p.entitlements
    into v_sub
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.user_id = p_user_id
      and s.status in ('active', 'grace')
      and clock_timestamp() <= s.grace_period_end
    order by s.created_at desc
    limit 1;

    if v_sub.plan_id is not null then
        v_plan_id := v_sub.plan_id;
        v_status := v_sub.status;
        v_is_subscribed := true;
        v_in_grace := (v_sub.status = 'grace');

        -- Overlay entitlements from plans table
        v_rank_bonus := coalesce((v_sub.entitlements->>'rank_bonus_days')::integer, 0);
        v_max_active := coalesce((v_sub.entitlements->>'max_active_packages')::integer, 10);
        v_max_top_ads := coalesce((v_sub.entitlements->>'max_concurrent_top_ads')::integer, 1);
        v_analytics := coalesce(v_sub.entitlements->>'analytics_level', 'basic');
        v_csv_export := coalesce((v_sub.entitlements->>'csv_export')::boolean, false);
    end if;

    return jsonb_build_object(
        'plan_id', v_plan_id,
        'is_subscribed', v_is_subscribed,
        'in_grace', v_in_grace,
        'status', v_status,
        'rank_bonus_days', v_rank_bonus,
        'max_active_packages', v_max_active,
        'max_concurrent_top_ads', v_max_top_ads,
        'analytics_level', v_analytics,
        'csv_export', v_csv_export
    );
end;
$$;

grant execute on function public.get_entitlements(uuid) to anon, authenticated;

-- 2. Update publish_service_package to evaluate entitlements dynamically
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
    v_max_allowed integer;
    v_next_ver integer;
    v_snapshot jsonb;
    v_version_id uuid;
    v_seeking_categories jsonb;
    v_entitlements jsonb;
    v_rank_bonus integer;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    -- Fetch package
    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    -- Strict Server Ownership Check (No IDOR)
    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if v_pkg.status = 'archived' or v_pkg.status = 'removed' then
        raise exception 'INVALID_STATE: Archived or removed packages cannot be published directly';
    end if;

    -- Verify Provider Onboarding Completion
    select onboarding_completed_at into v_onboarding from public.profiles where id = v_user_id;
    if v_onboarding is null then
        raise exception 'ONBOARDING_REQUIRED: Profile onboarding must be completed before publishing';
    end if;

    -- Dynamic Entitlement Check for Active Packages Limit
    v_entitlements := public.get_entitlements(v_user_id);
    v_max_allowed := coalesce((v_entitlements->>'max_active_packages')::integer, 10);
    v_rank_bonus := coalesce((v_entitlements->>'rank_bonus_days')::integer, 0);

    select count(*) into v_active_count
    from public.service_packages
    where provider_id = v_user_id
      and status in ('published', 'paused')
      and id <> p_package_id;

    if v_active_count >= v_max_allowed then
        raise exception 'LIMIT_EXCEEDED: Active package limit reached (maximum % allowed)', v_max_allowed;
    end if;

    -- Collect Seeking Categories for Snapshot
    select coalesce(jsonb_agg(jsonb_build_object('category_id', sc.category_id)), '[]'::jsonb)
    into v_seeking_categories
    from public.service_package_seeking_categories sc
    where sc.package_id = p_package_id;

    -- Calculate Next Version Number
    select coalesce(max(version_number), 0) + 1 into v_next_ver
    from public.service_package_versions
    where package_id = p_package_id;

    -- Create Immutable Snapshot
    v_snapshot := jsonb_build_object(
        'package_id', v_pkg.id,
        'title', v_pkg.title,
        'summary', v_pkg.summary,
        'description', v_pkg.description,
        'category_id', v_pkg.category_id,
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
        'seeking_categories', v_seeking_categories
    );

    -- Insert Immutable Version
    insert into public.service_package_versions (
        package_id,
        version_number,
        snapshot
    ) values (
        p_package_id,
        v_next_ver,
        v_snapshot
    ) returning id into v_version_id;

    -- Update Service Package State
    update public.service_packages
    set status = 'published',
        current_version_id = v_version_id,
        published_at = coalesce(published_at, clock_timestamp()),
        rank_ts = coalesce(published_at, clock_timestamp()) + (v_rank_bonus || ' days')::interval,
        updated_at = clock_timestamp()
    where id = p_package_id;

    -- Insert Domain Event into Outbox
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'package.published',
        'service_package',
        p_package_id,
        jsonb_build_object(
            'package_id', p_package_id,
            'provider_id', v_user_id,
            'version_id', v_version_id,
            'version_number', v_next_ver,
            'country_code', v_pkg.country_code
        )
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'version_id', v_version_id,
        'version_number', v_next_ver
    );
end;
$$;

-- 3. Recompute Ranking for a Provider (Triggered on Subscription changes)
create or replace function public.sync_provider_rank_ts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rank_bonus integer;
begin
    v_rank_bonus := coalesce((public.get_entitlements(p_user_id)->>'rank_bonus_days')::integer, 0);

    update public.service_packages
    set rank_ts = published_at + (v_rank_bonus || ' days')::interval
    where provider_id = p_user_id
      and status = 'published'
      and published_at is not null;
end;
$$;
-- Migration 20261016000004: Ranking and Promotions Migration
-- Expand/contract ranking schema, partial indexing, and promoted search block integration

-- 1. Add rank_ts to service_packages with backward-compatible default
alter table public.service_packages
add column if not exists rank_ts timestamptz not null default now();

-- 2. Backfill existing published packages
update public.service_packages
set rank_ts = published_at
where status = 'published' and published_at is not null;

-- 3. High-Performance Keyset Index on rank_ts
create index if not exists idx_packages_browse_hot
on public.service_packages (country_code, city_id, area_id, category_id, rank_ts desc, id desc)
where status = 'published';

-- 4. Update search_service_packages RPC
drop function if exists public.search_service_packages(text,text,uuid,uuid,uuid,uuid,public.delivery_mode,text,timestamp with time zone,uuid,integer);
drop function if exists public.search_service_packages cascade;

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
    has_next_page boolean,
    is_promoted boolean,
    promoted_slot integer,
    rank_ts timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
    v_limit integer := least(coalesce(p_page_size, 20), 50);
    v_clean_query text := nullif(trim(p_query), '');
    v_tsquery tsquery := null;
    v_is_first_page boolean := (p_cursor_published_at is null);
begin
    if v_clean_query is not null then
        v_tsquery := plainto_tsquery('simple', v_clean_query);
    end if;

    return query
    with promoted_results as (
        -- Pinned Top Ads: displayed on first page only when browsing a category & city
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
            false as has_next_page,
            true as is_promoted,
            lp.slot_no as promoted_slot,
            sp.rank_ts,
            lp.slot_no as sort_order_promoted
        from public.listing_promotions lp
        join public.service_packages sp on sp.id = lp.package_id
        join public.countries country on country.code = sp.country_code and country.is_active = true
        join public.public_provider_profiles prov on prov.id = sp.provider_id
        join public.service_categories cat on cat.id = sp.category_id and cat.is_active = true
        left join public.service_category_translations ct 
            on ct.category_id = cat.id and ct.locale = p_locale
        left join public.locations city on city.id = sp.city_id
        left join public.locations area on area.id = sp.area_id
        where v_is_first_page
          and lp.status = 'active'
          and clock_timestamp() <@ lp.period
          and sp.status = 'published'
          and sp.country_code = p_country_code
          and (p_category_id is null or lp.category_id = p_category_id)
          and (p_city_id is null or lp.city_id = p_city_id)
        order by lp.slot_no asc
        limit 3
    ),
    organic_results as (
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
            end as relevance_rank,
            false as is_promoted,
            null::integer as promoted_slot,
            sp.rank_ts
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
          -- Exclude any package already shown in promoted block on page 1
          and (
              not v_is_first_page
              or sp.id not in (select pr.id from promoted_results pr)
          )
          -- Category filtering (inclusive of child categories)
          and (
              p_category_id is null
              or sp.category_id = p_category_id
              or sp.category_id in (select sub_cat.id from public.service_categories sub_cat where sub_cat.parent_id = p_category_id)
          )
          -- Seeking Category filtering
          and (
              p_seeking_category_id is null
              or exists (
                  select 1 from public.service_package_seeking_categories spsc
                  where spsc.package_id = sp.id
                    and (
                        spsc.category_id = p_seeking_category_id
                        or spsc.category_id in (select sub_seek_cat.id from public.service_categories sub_seek_cat where sub_seek_cat.parent_id = p_seeking_category_id)
                    )
              )
          )
          -- Delivery Mode filter
          and (p_delivery_mode is null or sp.delivery_mode = p_delivery_mode)
          -- Location matching rules
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
          -- Text Query matching
          and (
              v_tsquery is null
              or sp.search_vector @@ v_tsquery
              or sp.title % v_clean_query
          )
          -- Keyset pagination cursor on (rank_ts, id)
          and (
              p_cursor_published_at is null
              or (sp.rank_ts, sp.id) < (p_cursor_published_at, p_cursor_id)
          )
        order by
            case when v_tsquery is not null then relevance_rank else 0 end desc,
            sp.rank_ts desc,
            sp.id desc
        limit v_limit + 1
    ),
    organic_counted as (
        select 
            o.*, 
            count(*) over() as total_organic_fetched
        from organic_results o
    )
    -- Union: Promoted results first (slot_no 1..3), then organic results
    select
        pr.id,
        pr.title,
        pr.summary,
        pr.category_id,
        pr.category_slug,
        pr.category_name,
        pr.delivery_mode,
        pr.country_code,
        pr.city_id,
        pr.city_name,
        pr.area_id,
        pr.area_name,
        pr.turnaround_days,
        pr.capacity_per_month,
        pr.indicative_value_minor,
        pr.currency_code,
        pr.deliverables,
        pr.exclusions,
        pr.seeking_categories,
        pr.provider_id,
        pr.provider_display_name,
        pr.provider_business_name,
        pr.provider_avatar_url,
        pr.provider_member_since,
        pr.published_at,
        false as has_next_page,
        pr.is_promoted,
        pr.promoted_slot,
        pr.rank_ts
    from promoted_results pr

    union all

    select
        oc.id,
        oc.title,
        oc.summary,
        oc.category_id,
        oc.category_slug,
        oc.category_name,
        oc.delivery_mode,
        oc.country_code,
        oc.city_id,
        oc.city_name,
        oc.area_id,
        oc.area_name,
        oc.turnaround_days,
        oc.capacity_per_month,
        oc.indicative_value_minor,
        oc.currency_code,
        oc.deliverables,
        oc.exclusions,
        oc.seeking_categories,
        oc.provider_id,
        oc.provider_display_name,
        oc.provider_business_name,
        oc.provider_avatar_url,
        oc.provider_member_since,
        oc.published_at,
        (oc.total_organic_fetched > v_limit) as has_next_page,
        false as is_promoted,
        null::integer as promoted_slot,
        oc.rank_ts
    from organic_counted oc
    limit case 
        when v_is_first_page then v_limit + (select count(*) from promoted_results)
        else v_limit
    end;
end;
$$;

grant execute on function public.search_service_packages(text, text, uuid, uuid, uuid, uuid, public.delivery_mode, text, timestamptz, uuid, integer) to anon, authenticated;
-- Migration 20261016000005: Monetization Row Level Security Policies
-- Strict isolation for payments, ledger, subscriptions, promotions, and analytics

-- 1. Helper function for finance or admin role check
create or replace function public.is_finance_or_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role::text in ('finance', 'admin')
    );
$$;

grant execute on function public.is_finance_or_admin() to authenticated;

-- 2. Enable RLS on all monetization tables
alter table public.payment_providers enable row level security;
alter table public.ad_products enable row level security;
alter table public.plans enable row level security;
alter table public.price_book enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events_raw enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.listing_promotions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.package_daily_stats enable row level security;
alter table public.promotion_daily_stats enable row level security;
alter table public.payment_audit_log enable row level security;

-- 3. Catalog and Provider read policies (Public readable for catalog)
create policy "payment_providers_select_policy"
on public.payment_providers for select
to anon, authenticated
using (is_enabled = true or public.is_finance_or_admin());

create policy "ad_products_select_policy"
on public.ad_products for select
to anon, authenticated
using (true);

create policy "plans_select_policy"
on public.plans for select
to anon, authenticated
using (true);

create policy "price_book_select_policy"
on public.price_book for select
to anon, authenticated
using (
    (effective_from <= clock_timestamp() and (effective_to is null or effective_to > clock_timestamp()))
    or public.is_finance_or_admin()
);

-- 4. Payments Policies (Owner or Finance read; NO client write)
create policy "payments_select_policy"
on public.payments for select
to authenticated
using (payer_id = auth.uid() or public.is_finance_or_admin());

-- 5. Payment Events Raw (Finance/Service-role only)
create policy "payment_events_raw_select_policy"
on public.payment_events_raw for select
to authenticated
using (public.is_finance_or_admin());

-- 6. Payment Ledger (Owner or Finance read; NO client write)
create policy "payment_ledger_select_policy"
on public.payment_ledger for select
to authenticated
using (payer_id = auth.uid() or public.is_finance_or_admin());

-- 7. Listing Promotions (Public reads active; Provider or Finance reads own)
create policy "listing_promotions_select_policy"
on public.listing_promotions for select
to anon, authenticated
using (
    status = 'active'
    or provider_id = auth.uid()
    or public.is_finance_or_admin()
);

-- 8. Subscriptions (Owner or Finance read; NO client write)
create policy "subscriptions_select_policy"
on public.subscriptions for select
to authenticated
using (user_id = auth.uid() or public.is_finance_or_admin());

-- 9. Subscription Invoices (Owner or Finance read)
create policy "subscription_invoices_select_policy"
on public.subscription_invoices for select
to authenticated
using (user_id = auth.uid() or public.is_finance_or_admin());

-- 10. Analytics Stats (Package owner reads own; Finance reads all)
create policy "package_daily_stats_select_policy"
on public.package_daily_stats for select
to authenticated
using (
    exists (
        select 1 from public.service_packages sp
        where sp.id = package_daily_stats.package_id
          and sp.provider_id = auth.uid()
    )
    or public.is_finance_or_admin()
);

create policy "promotion_daily_stats_select_policy"
on public.promotion_daily_stats for select
to authenticated
using (
    exists (
        select 1 from public.listing_promotions lp
        where lp.id = promotion_daily_stats.promotion_id
          and lp.provider_id = auth.uid()
    )
    or public.is_finance_or_admin()
);

-- 11. Payment Audit Log (Finance only)
create policy "payment_audit_log_select_policy"
on public.payment_audit_log for select
to authenticated
using (public.is_finance_or_admin());
-- Migration 20261016000006: Seed Default Payment Providers, Ad Products, Plans, and PLACEHOLDER Price Book

-- 1. Default Payment Provider for Kenya
insert into public.payment_providers (code, name, country_code, is_enabled, amount_granularity_minor, config)
values (
    'mpesa_daraja',
    'Safaricom M-Pesa Express (STK Push)',
    'KE',
    true,
    100, -- 100 minor units = 1 whole KES
    jsonb_build_object(
        'shortcode', '174379',
        'env', 'sandbox',
        'currency', 'KES'
    )
)
on conflict (code) do update set
    name = excluded.name,
    is_enabled = excluded.is_enabled,
    amount_granularity_minor = excluded.amount_granularity_minor,
    config = excluded.config;

-- 2. Ad Products Catalog (Top Ads)
insert into public.ad_products (id, duration_days, name, description)
values
    ('top_ad_7d', 7, '7-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 7 consecutive days.'),
    ('top_ad_14d', 14, '14-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 14 consecutive days.'),
    ('top_ad_30d', 30, '30-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 30 consecutive days.')
on conflict (id) do update set
    name = excluded.name,
    duration_days = excluded.duration_days,
    description = excluded.description;

-- 3. Boost Plans Catalog
insert into public.plans (id, name, description, billing_cycle_days, entitlements)
values
    (
        'basic',
        'Boost Basic',
        'Enhanced visibility and higher package listing capacity for growing providers.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 3,
            'max_active_packages', 15,
            'max_concurrent_top_ads', 2,
            'analytics_level', 'basic',
            'csv_export', false
        )
    ),
    (
        'pro',
        'Boost Pro',
        'Prime freshness boost, generous listing capacity, and 90-day daily analytics performance trends.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 7,
            'max_active_packages', 25,
            'max_concurrent_top_ads', 3,
            'analytics_level', 'pro',
            'csv_export', false
        )
    ),
    (
        'enterprise',
        'Boost Enterprise',
        'Maximum freshness boost, catalog-wide scale, and full CSV analytics export for power agencies.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 14,
            'max_active_packages', 50,
            'max_concurrent_top_ads', 5,
            'analytics_level', 'enterprise',
            'csv_export', true
        )
    )
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    entitlements = excluded.entitlements;

-- 4. Country-Scoped Price Book (Kenya - KES)
-- NOTE: ALL PRICES BELOW ARE CLEARLY MARKED PLACEHOLDERS PER OPERATIONAL SPECIFICATIONS
insert into public.price_book (product_id, product_type, country_code, currency_code, amount_minor, tax_rate_bps, tax_inclusive, effective_from)
values
    -- Top Ads (PLACEHOLDER PRICES)
    ('top_ad_7d', 'ad_product', 'KE', 'KES', 50000, 1600, true, now()),    -- KES 500.00 (PLACEHOLDER)
    ('top_ad_14d', 'ad_product', 'KE', 'KES', 90000, 1600, true, now()),   -- KES 900.00 (PLACEHOLDER)
    ('top_ad_30d', 'ad_product', 'KE', 'KES', 150000, 1600, true, now()),  -- KES 1,500.00 (PLACEHOLDER)
    -- Boost Plans (PLACEHOLDER PRICES)
    ('basic', 'plan', 'KE', 'KES', 100000, 1600, true, now()),             -- KES 1,000.00 / month (PLACEHOLDER)
    ('pro', 'plan', 'KE', 'KES', 250000, 1600, true, now()),               -- KES 2,500.00 / month (PLACEHOLDER)
    ('enterprise', 'plan', 'KE', 'KES', 500000, 1600, true, now())         -- KES 5,000.00 / month (PLACEHOLDER)
on conflict do nothing;
-- Migration 20261016000007: Payment Engine Atomic Settlement and Failure RPC Functions
-- Enforces row-level locks, ledger entry insertion, entitlement sync, and notification dispatch in one atomic transaction.

-- 1. Atomic Settlement RPC Function
create or replace function public.settle_payment_transaction(
    p_payment_id uuid,
    p_checkout_request_id text,
    p_receipt_number text,
    p_verified_amount_minor bigint,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
    v_promo record;
    v_sub record;
    v_duration_days integer := 7;
begin
    -- 1. Lock payment row
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    -- Idempotency: If already succeeded, return immediately with success
    if v_payment.status = 'succeeded' then
        return jsonb_build_object(
            'success', true,
            'payment_id', v_payment.id,
            'status', 'succeeded',
            'already_settled', true
        );
    end if;

    if v_payment.status not in ('created', 'pending') then
        raise exception 'INVALID_STATE: Payment status is % and cannot be settled', v_payment.status;
    end if;

    -- Strict Amount Verification (Match what was invoiced vs what provider debited)
    if v_payment.amount_minor <> p_verified_amount_minor then
        raise exception 'AMOUNT_MISMATCH: Invoiced amount (%) does not match provider verified amount (%)',
            v_payment.amount_minor, p_verified_amount_minor;
    end if;

    -- 2. Transition Payment to Succeeded
    update public.payments
    set status = 'succeeded',
        receipt_number = p_receipt_number,
        checkout_request_id = coalesce(checkout_request_id, p_checkout_request_id),
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- 3. Insert Append-Only Ledger Entry
    insert into public.payment_ledger (
        payment_id,
        payer_id,
        entry_type,
        amount_minor,
        currency_code,
        reference_note
    ) values (
        v_payment.id,
        v_payment.payer_id,
        'charge',
        v_payment.amount_minor,
        v_payment.currency_code,
        coalesce(p_note, 'M-Pesa Receipt: ' || p_receipt_number)
    );

    -- 4. Product Fulfillment based on purpose
    if v_payment.purpose = 'top_ad' then
        -- Find promotion record by target_id or payment_id
        select lp.*, ap.duration_days
        into v_promo
        from public.listing_promotions lp
        left join public.ad_products ap on ap.id = (v_payment.price_snapshot->>'product_id')
        where lp.id = v_payment.target_id or lp.payment_id = v_payment.id
        limit 1;

        if v_promo.id is not null then
            v_duration_days := coalesce(v_promo.duration_days, 7);

            -- Activate promotion and extend period to exact duration
            update public.listing_promotions
            set status = 'active',
                payment_id = v_payment.id,
                period = tstzrange(clock_timestamp(), clock_timestamp() + (v_duration_days || ' days')::interval),
                updated_at = clock_timestamp()
            where id = v_promo.id;

            -- In-app notification
            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'promotion.started',
                jsonb_build_object(
                    'promotion_id', v_promo.id,
                    'package_id', v_promo.package_id,
                    'receipt_number', p_receipt_number,
                    'duration_days', v_duration_days
                )
            );
        end if;

    elsif v_payment.purpose = 'boost_period' then
        -- Find subscription by user_id or target_id
        select * into v_sub
        from public.subscriptions
        where id = v_payment.target_id or user_id = v_payment.payer_id
        order by created_at desc
        limit 1;

        if v_sub.id is not null then
            update public.subscriptions
            set status = 'active',
                current_period_start = clock_timestamp(),
                current_period_end = clock_timestamp() + interval '30 days',
                grace_period_end = clock_timestamp() + interval '33 days',
                latest_payment_id = v_payment.id,
                updated_at = clock_timestamp()
            where id = v_sub.id;

            -- Update subscription invoice if present
            update public.subscription_invoices
            set status = 'paid',
                payment_id = v_payment.id,
                paid_at = clock_timestamp()
            where subscription_id = v_sub.id and status = 'pending';

            -- Synchronize freshness bonus on provider's packages
            perform public.sync_provider_rank_ts(v_payment.payer_id);

            -- In-app notification
            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'subscription.renewed',
                jsonb_build_object(
                    'subscription_id', v_sub.id,
                    'plan_id', v_sub.plan_id,
                    'receipt_number', p_receipt_number
                )
            );
        end if;
    end if;

    -- 5. Outbox Domain Event
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'payment.succeeded',
        'payment',
        v_payment.id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'purpose', v_payment.purpose,
            'amount_minor', v_payment.amount_minor,
            'receipt_number', p_receipt_number
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', 'succeeded',
        'receipt_number', p_receipt_number
    );
end;
$$;

-- 2. Atomic Failure / Cancellation RPC Function
create or replace function public.fail_payment_transaction(
    p_payment_id uuid,
    p_failure_code text,
    p_failure_reason text,
    p_terminal_status public.payment_status default 'failed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
begin
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    -- If already finalized as succeeded, cannot fail
    if v_payment.status = 'succeeded' then
        raise exception 'INVALID_STATE: Cannot fail an already settled payment';
    end if;

    update public.payments
    set status = p_terminal_status,
        failure_code = p_failure_code,
        failure_reason = p_failure_reason,
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- If Top Ad was held, release hold
    if v_payment.purpose = 'top_ad' then
        update public.listing_promotions
        set status = 'cancelled',
            updated_at = clock_timestamp()
        where (id = v_payment.target_id or payment_id = v_payment.id)
          and status = 'held';
    end if;

    -- In-app notification
    insert into public.notifications (
        user_id,
        type,
        payload
    ) values (
        v_payment.payer_id,
        'payment.failed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'purpose', v_payment.purpose,
            'reason', p_failure_reason
        )
    );

    -- Domain Event
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'payment.failed',
        'payment',
        v_payment.id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'failure_code', p_failure_code,
            'status', p_terminal_status
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', p_terminal_status
    );
end;
$$;


-- >>> 20261016000008_analytics_and_admin_rpc.sql <<<
-- ============================================================================
-- Migration: 20261016000008_analytics_and_admin_rpc.sql
-- Description: Atomic analytics counters and admin finance reconciliation RPCs
-- ============================================================================

-- Ensure payment_status enum contains 'refunded'
alter type public.payment_status add value if not exists 'refunded';

-- 1. Atomic Package Daily Stats Upsert
create or replace function public.record_package_analytics(
    p_package_id uuid,
    p_impressions integer default 0,
    p_views integer default 0,
    p_proposal_starts integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_today date := current_date;
begin
    insert into public.package_daily_stats (
        package_id,
        date,
        impressions,
        views,
        proposal_starts
    ) values (
        p_package_id,
        v_today,
        greatest(0, p_impressions),
        greatest(0, p_views),
        greatest(0, p_proposal_starts)
    )
    on conflict (package_id, date) do update
    set impressions = public.package_daily_stats.impressions + greatest(0, p_impressions),
        views = public.package_daily_stats.views + greatest(0, p_views),
        proposal_starts = public.package_daily_stats.proposal_starts + greatest(0, p_proposal_starts);
end;
$$;

-- 2. Atomic Promotion Daily Stats Upsert
create or replace function public.record_promotion_analytics(
    p_promotion_id uuid,
    p_impressions integer default 0,
    p_clicks integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_today date := current_date;
begin
    insert into public.promotion_daily_stats (
        promotion_id,
        date,
        impressions,
        clicks
    ) values (
        p_promotion_id,
        v_today,
        greatest(0, p_impressions),
        greatest(0, p_clicks)
    )
    on conflict (promotion_id, date) do update
    set impressions = public.promotion_daily_stats.impressions + greatest(0, p_impressions),
        clicks = public.promotion_daily_stats.clicks + greatest(0, p_clicks);
end;
$$;

-- 3. Admin Financial Manual Refund / Adjustment
create or replace function public.admin_record_refund(
    p_payment_id uuid,
    p_actor_id uuid,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
begin
    -- Verify actor has finance or admin role
    if not exists (
        select 1 from public.user_roles
        where user_id = p_actor_id and role::text in ('finance', 'admin')
    ) then
        raise exception 'FORBIDDEN: Caller lacks finance or admin role';
    end if;

    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'NOT_FOUND: Payment % not found', p_payment_id;
    end if;

    if v_payment.status <> 'succeeded' then
        raise exception 'INVALID_STATE: Only succeeded payments can be refunded';
    end if;

    -- Update status
    update public.payments
    set status = 'refunded',
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- Append refund to ledger
    insert into public.payment_ledger (
        payment_id,
        payer_id,
        entry_type,
        amount_minor,
        currency_code,
        reference_note,
        created_by
    ) values (
        v_payment.id,
        v_payment.payer_id,
        'refund',
        v_payment.amount_minor,
        v_payment.currency_code,
        coalesce(p_reason, 'Admin Manual Refund'),
        p_actor_id
    );

    -- Log to financial audit log
    insert into public.payment_audit_log (
        actor_id,
        action,
        target_type,
        target_id,
        details
    ) values (
        p_actor_id,
        'payment.refunded',
        'payment',
        v_payment.id::text,
        jsonb_build_object(
            'amount_minor', v_payment.amount_minor,
            'currency_code', v_payment.currency_code,
            'reason', p_reason
        )
    );

    -- If Top Ad was active, cancel promotion
    if v_payment.purpose = 'top_ad' then
        update public.listing_promotions
        set status = 'cancelled',
            updated_at = clock_timestamp()
        where id = v_payment.target_id;
    end if;

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', 'refunded'
    );
end;
$$;

-- 4. Financial Revenue Metrics Aggregate Function
create or replace function public.get_revenue_metrics(
    p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_total_revenue bigint := 0;
    v_boost_mrr bigint := 0;
    v_top_ad_revenue bigint := 0;
    v_active_subscribers integer := 0;
    v_active_promotions integer := 0;
    v_failed_payments integer := 0;
begin
    -- Role check
    if not exists (
        select 1 from public.user_roles
        where user_id = p_actor_id and role::text in ('finance', 'admin')
    ) then
        raise exception 'FORBIDDEN: Caller lacks finance or admin role';
    end if;

    -- Total Succeeded Revenue
    select coalesce(sum(amount_minor), 0)
    into v_total_revenue
    from public.payments
    where status = 'succeeded';

    -- Monthly Boost MRR (Active Subscriptions)
    select coalesce(sum(p.amount_minor), 0)
    into v_boost_mrr
    from public.payments p
    join public.subscriptions s on s.latest_payment_id = p.id
    where s.status = 'active';

    -- Top Ad Lifetime Revenue
    select coalesce(sum(amount_minor), 0)
    into v_top_ad_revenue
    from public.payments
    where status = 'succeeded' and purpose = 'top_ad';

    -- Counts
    select count(*) into v_active_subscribers
    from public.subscriptions where status = 'active';

    select count(*) into v_active_promotions
    from public.listing_promotions where status = 'active';

    select count(*) into v_failed_payments
    from public.payments where status in ('failed', 'cancelled', 'timed_out');

    return jsonb_build_object(
        'total_revenue_minor', v_total_revenue,
        'boost_mrr_minor', v_boost_mrr,
        'top_ad_revenue_minor', v_top_ad_revenue,
        'active_subscribers', v_active_subscribers,
        'active_promotions', v_active_promotions,
        'failed_payments', v_failed_payments
    );
end;
$$;

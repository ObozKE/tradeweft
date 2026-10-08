-- Migration 20261008000002: Service Packages, Seeking Categories, Immutable Versions, Domain Events
-- Enables strictly scoped B2B barter service packages and immutable audit snapshots

-- 1. Helper function for UUIDv7 generation (with RFC 9562 time-ordered bit layout)
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

-- 2. Enums
do $$ begin
    create type public.package_status as enum ('draft', 'published', 'paused', 'archived', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.delivery_mode as enum ('in_person', 'remote', 'hybrid');
exception when duplicate_object then null;
end $$;

-- 3. Required Extensions
create extension if not exists pg_trgm;

-- 4. Validation Functions for Delivery Mode & Location Hierarchy
create or replace function public.validate_service_package_integrity()
returns trigger
language plpgsql
as $$
declare
    v_country_curr text;
    v_city_country text;
    v_area_parent uuid;
begin
    -- 1. Check currency code matches country
    select currency_code into v_country_curr from public.countries where code = new.country_code;
    if v_country_curr is null then
        raise exception 'Invalid country_code %', new.country_code;
    end if;
    if new.currency_code is distinct from v_country_curr then
        raise exception 'Currency code % does not match country currency %', new.currency_code, v_country_curr;
    end if;

    -- 2. Delivery mode location requirements
    if new.delivery_mode in ('in_person', 'hybrid') then
        if new.city_id is null or new.area_id is null then
            raise exception 'In-person and hybrid packages require both city_id and area_id';
        end if;
    elsif new.delivery_mode = 'remote' then
        if new.city_id is null then
            raise exception 'Remote delivery packages require at least city_id';
        end if;
    end if;

    -- 3. Location hierarchy consistency
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

    -- 4. Status transition validation
    if tg_op = 'UPDATE' then
        if old.status = 'archived' and new.status = 'published' then
            raise exception 'Archived packages cannot directly transition to published. Create a new package or draft.';
        end if;
        if old.status = 'removed' and new.status <> 'removed' then
            raise exception 'Removed packages cannot be restored by users.';
        end if;
    end if;

    -- 5. Deliverables & Exclusions array length validation
    if jsonb_typeof(new.deliverables) <> 'array' or jsonb_array_length(new.deliverables) < 1 or jsonb_array_length(new.deliverables) > 10 then
        raise exception 'Deliverables must be an array of 1 to 10 items';
    end if;

    if jsonb_typeof(new.exclusions) <> 'array' or jsonb_array_length(new.exclusions) > 10 then
        raise exception 'Exclusions must be an array of at most 10 items';
    end if;

    return new;
end;
$$;

-- 5. Service Packages Table
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

-- Integrity trigger on service packages
drop trigger if exists tr_service_packages_integrity on public.service_packages;
create trigger tr_service_packages_integrity
    before insert or update on public.service_packages
    for each row
    execute function public.validate_service_package_integrity();

-- Updated_at trigger
drop trigger if exists tr_service_packages_updated_at on public.service_packages;
create trigger tr_service_packages_updated_at
    before update on public.service_packages
    for each row
    execute function public.handle_updated_at();

-- 6. Seeking Categories (The "What I'd like in return" side for matchmaking)
create table if not exists public.service_package_seeking_categories (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    category_id uuid not null references public.service_categories(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (package_id, category_id)
);

-- 7. Service Package Versions (Immutable historical snapshots)
create table if not exists public.service_package_versions (
    id uuid primary key default gen_random_uuid(),
    package_id uuid not null references public.service_packages(id) on delete cascade,
    version_number integer not null,
    snapshot jsonb not null,
    created_at timestamptz not null default now(),
    unique (package_id, version_number)
);

-- Trigger to enforce complete immutability on versions (Block UPDATE & DELETE)
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

-- 8. Domain Events Outbox
create table if not exists public.domain_events (
    id uuid primary key default gen_random_uuid(),
    aggregate_type text not null,
    aggregate_id uuid not null,
    event_type text not null,
    actor_id uuid references auth.users(id) on delete set null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Block direct mutations on domain events
drop trigger if exists tr_block_domain_event_mutation on public.domain_events;
create trigger tr_block_domain_event_mutation
    before update or delete on public.domain_events
    for each row
    execute function public.prevent_immutable_mutation();

-- 9. Indexes
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

create index if not exists idx_domain_events_aggregate 
    on public.domain_events (aggregate_type, aggregate_id, created_at desc);

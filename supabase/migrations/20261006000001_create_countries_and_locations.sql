-- Migration 1: Multi-country and Hierarchical Locations Schema
-- Designed for seamless pan-African expansion (Kenya first, then Nigeria, South Africa, etc.)

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

-- Locations: Self-referential hierarchy (e.g., Kenya -> Nairobi Region -> Nairobi City -> Westlands)
create type public.location_level as enum ('region', 'city', 'area');

create table if not exists public.locations (
    id uuid primary key default gen_random_uuid(),
    country_code text not null references public.countries(code) on delete cascade,
    parent_id uuid references public.locations(id) on delete cascade,
    level public.location_level not null,
    name text not null,
    slug text not null,
    created_at timestamptz not null default now()
);

-- Unique constraint: Unique slug per parent location
create unique index if not exists idx_locations_parent_slug 
    on public.locations (parent_id, slug);

-- Hot indexes for location querying
create index if not exists idx_locations_hierarchy 
    on public.locations (country_code, level, parent_id);

create index if not exists idx_locations_parent 
    on public.locations (parent_id);

comment on table public.countries is 'Supported countries driving multi-currency, timezone, and phone conventions.';
comment on table public.locations is 'Hierarchical location tree (region -> city -> area) for exact matching without GPS.';

-- Migration 2: Profiles and Separate Role System
-- Kept separate to prevent privilege escalation (no user-facing write policies on user_roles)

create type public.account_type as enum ('freelancer', 'business');
create type public.app_role as enum ('user', 'admin', 'support');

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

-- Separate role table with zero user-facing write policies
create table if not exists public.user_roles (
    user_id uuid not null references auth.users(id) on delete cascade,
    role public.app_role not null default 'user',
    created_at timestamptz not null default now(),
    primary key (user_id, role)
);

-- Targeted indexes for location filtering and user search
create index if not exists idx_profiles_location 
    on public.profiles (country_code, city_id, area_id);

create index if not exists idx_profiles_onboarding 
    on public.profiles (id, onboarding_completed_at);

comment on table public.profiles is 'Public profile information linked 1:1 with auth.users.';
comment on table public.user_roles is 'Application roles isolated from profiles to eliminate client privilege escalation.';

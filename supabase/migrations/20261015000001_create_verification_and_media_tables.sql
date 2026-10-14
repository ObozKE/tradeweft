-- Migration: 20261015000001_create_verification_and_media_tables.sql
-- Phase 5: Verification & Proof of Work - Core Tables, Enums, and Storage Buckets

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

-- Partial unique index: exactly one verified link per external account per platform
create unique index if not exists idx_portfolio_links_unique_verified
    on public.portfolio_links (provider_key, external_account_id)
    where status = 'verified' and external_account_id is not null;

-- Hot path index for user lookups
create index if not exists idx_portfolio_links_user_status
    on public.portfolio_links (user_id, status);

-- Partial index for manual verifier review queue
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

-- Partial unique index: exactly one cover image per package
create unique index if not exists idx_package_media_unique_cover
    on public.package_media (package_id)
    where is_cover = true;

create index if not exists idx_package_media_order
    on public.package_media (package_id, position asc);

create index if not exists idx_media_assets_owner_status
    on public.media_assets (owner_id, status);

-- Index for cron cleanup sweeps
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

-- Migration 20261013000001: Phase 3 Barter Agreements - Enums and Tables
-- Creates tables for barter agreements, immutable revisions, lines, fulfilment,
-- contract audit events, private contacts, contact shares, and in-app notifications.

-- Extensions required for cryptographic terms hashing (terms_hash)
create extension if not exists pgcrypto with schema extensions;

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

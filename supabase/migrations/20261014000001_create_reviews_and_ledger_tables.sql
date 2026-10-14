-- Migration 20261014000001: Phase 4 Reviews & Public Trust Ledger - Enums and Tables
-- Creates tables for double-blind reviews, replies, reports, ledger entries,
-- reputation stats, anomaly flags, and the event delivery outbox.

-- 1. Enums
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

-- 2. Trade Terms Versions Table (Version governance for Public Ledger disclosure)
create table if not exists public.trade_terms_versions (
    version text primary key,
    includes_public_ledger boolean not null default false,
    disclosure_text text not null,
    effective_at timestamptz not null default now()
);

-- Seed existing v1 (non-public) and new v2 (public ledger disclosure)
insert into public.trade_terms_versions (version, includes_public_ledger, disclosure_text, effective_at)
values 
    ('2026-10-v1', false, 'Standard Barter Agreement Terms v1. Trades and reviews are private between participants.', '2026-10-01 00:00:00+00'),
    ('2026-10-v2', true, 'Trade Weft Terms v2. Completed trades (deliverables and quantities) and double-blind reviews will be published to the Public Trust Ledger to build your verified reputation. Notes and monetary values are never disclosed.', '2026-10-14 00:00:00+00')
on conflict (version) do update set 
    includes_public_ledger = excluded.includes_public_ledger,
    disclosure_text = excluded.disclosure_text;

-- Update default trade terms version on agreements to 2026-10-v2
alter table public.agreements 
    alter column trade_terms_version set default '2026-10-v2';

-- 3. Reviews Table
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

-- 4. Review Replies (One public reply by reviewee, immutable, after reveal)
create table if not exists public.review_replies (
    review_id uuid primary key references public.reviews(id) on delete cascade,
    author_id uuid not null references public.profiles(id),
    body text not null check (length(trim(body)) >= 1 and length(body) <= 500),
    created_at timestamptz not null default now()
);

-- 5. Review Reports (Flagging abusive/false reviews for moderation)
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

-- 6. Public Trust Ledger Entries (One perspective row per party per completed trade under Terms v2)
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

-- 7. Provider Reputation Table (Proof of Reliability score snapshot)
create table if not exists public.provider_reputation (
    provider_id uuid primary key references public.profiles(id) on delete cascade,
    score numeric(5,2), -- Nullable until threshold of 3 distinct trading partners
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

-- 8. Reputation Anomaly Flags (Human review log for collusion/burst patterns)
create table if not exists public.reputation_flags (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references public.profiles(id),
    reason text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 9. Review Moderation Log (Admin audit log)
create table if not exists public.review_moderation_log (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.reviews(id),
    admin_id uuid not null references auth.users(id),
    action text not null check (action in ('hide', 'restore')),
    reason text not null,
    created_at timestamptz not null default now()
);

-- 10. Domain Event Deliveries (Reliable, idempotent background consumer queue)
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

-- 11. Performance Indexes
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

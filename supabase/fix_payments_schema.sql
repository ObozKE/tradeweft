-- Fix Payments Schema and Companion Tables
-- Run this in Supabase SQL Editor

-- 1. Ensure Enums Exist
do $$
begin
    if not exists (select 1 from pg_type where typname = 'payment_provider_code') then
        create type public.payment_provider_code as enum ('mpesa_daraja', 'airtel_money', 'mtn_momo');
    end if;

    if not exists (select 1 from pg_type where typname = 'payment_status') then
        create type public.payment_status as enum ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'timed_out', 'refunded');
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

-- 2. Drop empty tables safely (all currently have 0 rows)
drop table if exists public.payment_ledger cascade;
drop table if exists public.subscription_invoices cascade;
drop table if exists public.listing_promotions cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.payment_events_raw cascade;
drop table if exists public.payments cascade;

-- 3. Payments Table
create table public.payments (
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

create unique index idx_payments_provider_checkout
on public.payments (provider, checkout_request_id)
where checkout_request_id is not null;

create index idx_payments_payer_created
on public.payments (payer_id, created_at desc);

create index idx_payments_pending_poll
on public.payments (status, created_at)
where status = 'pending';

-- 4. Listing Promotions Table (Top Ads)
create table public.listing_promotions (
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

create index idx_listing_promotions_active_lookup
on public.listing_promotions (country_code, city_id, category_id, status)
where status = 'active';

create index idx_listing_promotions_provider
on public.listing_promotions (provider_id, created_at desc);

-- 5. Subscriptions Table (Boost Packages)
create table public.subscriptions (
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

create unique index idx_subscriptions_user_active
on public.subscriptions (user_id)
where status in ('active', 'grace', 'pending');

-- 6. Subscription Invoices Table
create table public.subscription_invoices (
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

create index idx_subscription_invoices_user
on public.subscription_invoices (user_id, created_at desc);

-- 7. Raw Ingested Payment Events (Audit Store)
create table public.payment_events_raw (
    id uuid primary key default gen_random_uuid(),
    provider public.payment_provider_code not null,
    event_type text not null,
    checkout_request_id text,
    payload jsonb not null,
    received_at timestamptz not null default now(),
    is_redacted boolean not null default false,
    redacted_at timestamptz
);

create index idx_payment_events_raw_checkout
on public.payment_events_raw (checkout_request_id)
where checkout_request_id is not null;

-- 8. Append-Only Payment Ledger
create table public.payment_ledger (
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

create index idx_payment_ledger_payment
on public.payment_ledger (payment_id);

create index idx_payment_ledger_payer
on public.payment_ledger (payer_id, created_at desc);

-- 9. Row Level Security (RLS) & Policies
alter table public.payments enable row level security;
alter table public.listing_promotions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.payment_events_raw enable row level security;
alter table public.payment_ledger enable row level security;

-- Payer can view own payments
drop policy if exists payments_payer_select on public.payments;
create policy payments_payer_select on public.payments
    for select using (auth.uid() = payer_id);

-- Provider can view own promotions
drop policy if exists promotions_provider_select on public.listing_promotions;
create policy promotions_provider_select on public.listing_promotions
    for select using (auth.uid() = provider_id);

-- User can view own subscriptions
drop policy if exists subscriptions_user_select on public.subscriptions;
create policy subscriptions_user_select on public.subscriptions
    for select using (auth.uid() = user_id);

-- User can view own invoices
drop policy if exists invoices_user_select on public.subscription_invoices;
create policy invoices_user_select on public.subscription_invoices
    for select using (auth.uid() = user_id);

-- Payer can view own ledger entries
drop policy if exists ledger_payer_select on public.payment_ledger;
create policy ledger_payer_select on public.payment_ledger
    for select using (auth.uid() = payer_id);

-- 10. Refresh PostgREST Schema Cache
notify pgrst, 'reload schema';

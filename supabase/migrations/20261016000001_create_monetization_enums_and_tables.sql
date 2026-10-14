-- Migration 20261016000001: Monetization Enums and Tables
-- Payments, append-only ledger, price book, plans, ad products, subscriptions, promotions, and analytics

-- 1. Enums
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

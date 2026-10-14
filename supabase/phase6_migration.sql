-- ============================================================================
-- Trade Weft — Phase 6: Monetization Consolidated Migration
-- Run this in your Supabase SQL Editor to apply Phase 6 schema.
-- ============================================================================

-- >>> Start of supabase/migrations/20261016000001_create_monetization_enums_and_tables.sql <<<
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


-- >>> Start of supabase/migrations/20261016000002_monetization_constraints_and_triggers.sql <<<
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


-- >>> Start of supabase/migrations/20261016000003_entitlements_and_pricing_rpc.sql <<<
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


-- >>> Start of supabase/migrations/20261016000004_ranking_and_promotions_migration.sql <<<
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
-- Drop previous signature before recreating with expanded OUT parameters
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


-- >>> Start of supabase/migrations/20261016000005_monetization_rls_and_policies.sql <<<
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


-- >>> Start of supabase/migrations/20261016000006_seed_catalog_and_price_book.sql <<<
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


-- >>> Start of supabase/migrations/20261016000007_payment_engine_rpc.sql <<<
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


-- >>> Start of supabase/migrations/20261016000008_analytics_and_admin_rpc.sql <<<
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



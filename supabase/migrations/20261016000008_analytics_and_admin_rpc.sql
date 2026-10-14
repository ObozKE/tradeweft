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

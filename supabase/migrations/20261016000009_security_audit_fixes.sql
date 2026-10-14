-- Migration 20261016000009: Pre-Deployment Security Audit Fixes (P0, P1 & P2 Remediation)
-- Addresses:
-- 1. [SEC-P0-01] Prevents arbitrary competitor reputation score wiping by restricting
--    recompute_provider_reputation to service_role and fixing calculation time to now().
-- 2. [SEC-P0-02] Prevents actor parameter tampering / IDOR in admin_record_refund and
--    get_revenue_metrics by binding actor verification strictly to auth.uid().
-- 3. [SEC-P2-02] Hardens immutability triggers with explicit search_path = public, extensions.

-- ============================================================================
-- 1. Reputation Scoring Engine Hardening (SEC-P0-01)
-- ============================================================================

-- Recreate recompute_provider_reputation with locked time evaluation
create or replace function public.recompute_provider_reputation(
    p_provider_id uuid,
    p_as_of timestamptz default now()
)
returns public.provider_reputation
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_distinct_partners integer := 0;
    v_completed_trades integer := 0;
    v_review_count integer := 0;
    v_weighted_sum numeric := 0;
    v_total_weight numeric := 0;
    v_prior_confidence numeric := 5.0;
    v_prior_mean numeric := 80.0;
    v_raw_score numeric;
    v_final_score numeric;
    v_tier public.reputation_tier := 'new';
    v_avg_overall numeric;
    v_avg_quality numeric;
    v_avg_communication numeric;
    v_avg_timeliness numeric;
    v_would_trade_pct numeric;
    v_rep record;
    v_profile_created_at timestamptz;
    v_eval_time timestamptz := now(); -- Security lock: always calculate as of now()
begin
    -- 1. Fetch profile creation timestamp for anomaly detection
    select created_at into v_profile_created_at from public.profiles where id = p_provider_id;

    -- 2. Count distinct completed trades
    select count(*) into v_completed_trades
    from public.agreements
    where status = 'completed'
      and (proposer_id = p_provider_id or recipient_id = p_provider_id);

    -- 3. Calculate statistics and Bayesian weighted score over revealed reviews
    with review_stream as (
        select
            r.id,
            r.reviewer_id,
            r.overall_rating,
            r.quality_rating,
            r.communication_rating,
            r.timeliness_rating,
            r.would_trade_again,
            r.revealed_at,
            row_number() over (
                partition by r.reviewer_id 
                order by r.revealed_at asc, r.id asc
            ) as partner_trade_order,
            greatest(0, extract(epoch from (v_eval_time - coalesce(r.revealed_at, r.created_at))) / 86400.0) as days_ago
        from public.reviews r
        where r.reviewee_id = p_provider_id
          and r.status = 'revealed'
    ),
    scored_reviews as (
        select
            id,
            reviewer_id,
            overall_rating,
            quality_rating,
            communication_rating,
            timeliness_rating,
            would_trade_again,
            (
                (
                    (0.50 * overall_rating) +
                    (0.20 * case when would_trade_again then 5.0 else 1.0 end) +
                    (0.15 * timeliness_rating) +
                    (0.15 * communication_rating)
                    - 1.0
                ) / 4.0
            ) * 100.0 as review_score,
            (1.0 / partner_trade_order::numeric) as pair_weight,
            power(0.5, (days_ago / 365.0)::numeric) as recency_weight
        from review_stream
    ),
    weighted_reviews as (
        select
            id,
            reviewer_id,
            overall_rating,
            quality_rating,
            communication_rating,
            timeliness_rating,
            would_trade_again,
            review_score,
            (pair_weight * recency_weight) as effective_weight
        from scored_reviews
    )
    select
        count(*),
        count(distinct reviewer_id),
        coalesce(sum(review_score * effective_weight), 0),
        coalesce(sum(effective_weight), 0),
        avg(overall_rating),
        avg(quality_rating),
        avg(communication_rating),
        avg(timeliness_rating),
        coalesce((count(*) filter (where would_trade_again)::numeric / nullif(count(*), 0)) * 100.0, 100.0)
    into
        v_review_count,
        v_distinct_partners,
        v_weighted_sum,
        v_total_weight,
        v_avg_overall,
        v_avg_quality,
        v_avg_communication,
        v_avg_timeliness,
        v_would_trade_pct
    from weighted_reviews;

    -- 4. Tier & Bayesian Score Calculation
    if v_distinct_partners >= 10 then
        v_tier := 'established';
    elsif v_distinct_partners >= 3 then
        v_tier := 'building';
    else
        v_tier := 'new';
    end if;

    if v_distinct_partners >= 3 and (v_total_weight + v_prior_confidence) > 0 then
        v_raw_score := (v_weighted_sum + (v_prior_confidence * v_prior_mean)) / (v_total_weight + v_prior_confidence);
        v_final_score := round(least(100.0, greatest(0.0, v_raw_score)), 1);
    else
        v_final_score := null;
    end if;

    -- 5. Upsert into provider_reputation
    insert into public.provider_reputation (
        provider_id,
        score,
        tier,
        review_count,
        distinct_partners,
        completed_trades,
        avg_overall,
        avg_quality,
        avg_communication,
        avg_timeliness,
        would_trade_again_pct,
        score_version,
        computed_at
    ) values (
        p_provider_id,
        v_final_score,
        v_tier,
        v_review_count,
        v_distinct_partners,
        v_completed_trades,
        round(v_avg_overall, 2),
        round(v_avg_quality, 2),
        round(v_avg_communication, 2),
        round(v_avg_timeliness, 2),
        round(v_would_trade_pct, 1),
        '2026-10-v1',
        now()
    )
    on conflict (provider_id) do update set
        score = excluded.score,
        tier = excluded.tier,
        review_count = excluded.review_count,
        distinct_partners = excluded.distinct_partners,
        completed_trades = excluded.completed_trades,
        avg_overall = excluded.avg_overall,
        avg_quality = excluded.avg_quality,
        avg_communication = excluded.avg_communication,
        avg_timeliness = excluded.avg_timeliness,
        would_trade_again_pct = excluded.would_trade_again_pct,
        score_version = excluded.score_version,
        computed_at = excluded.computed_at
    returning * into v_rep;

    -- 6. Anomaly Detection Heuristics
    insert into public.reputation_flags (provider_id, reason, payload)
    select 
        p_provider_id,
        'PAIR_VELOCITY_ANOMALY',
        jsonb_build_object('partner_id', sub.partner_id, 'trades_in_30d', sub.trade_count)
    from (
        select 
            case when proposer_id = p_provider_id then recipient_id else proposer_id end as partner_id,
            count(*) as trade_count
        from public.agreements
        where status = 'completed'
          and (proposer_id = p_provider_id or recipient_id = p_provider_id)
          and completed_at >= (now() - interval '30 days')
        group by 1
        having count(*) > 3
    ) sub
    where not exists (
        select 1 from public.reputation_flags rf 
        where rf.provider_id = p_provider_id 
          and rf.reason = 'PAIR_VELOCITY_ANOMALY'
          and (rf.payload->>'partner_id')::uuid = sub.partner_id
          and rf.created_at >= (now() - interval '7 days')
    );

    return v_rep;
end;
$$;

-- REVOKE execute from authenticated and public; GRANT exclusively to service_role
revoke execute on function public.recompute_provider_reputation(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.recompute_provider_reputation(uuid, timestamptz) to service_role;


-- ============================================================================
-- 2. Financial Admin RPC Hardening & Zero-IDOR (SEC-P0-02)
-- ============================================================================

-- Admin Financial Manual Refund / Adjustment
create or replace function public.admin_record_refund(
    p_payment_id uuid,
    p_actor_id uuid,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_payment record;
    v_actor_id uuid;
begin
    -- Bind actor strictly to authenticated caller session
    v_actor_id := auth.uid();
    if v_actor_id is null then
        -- Allow service_role execution if auth.uid() is null but actor was passed
        if current_user = 'service_role' or current_user = 'postgres' then
            v_actor_id := p_actor_id;
        else
            raise exception 'AUTH_REQUIRED: Authenticated session required';
        end if;
    end if;

    -- Verify actor has finance or admin role
    if not exists (
        select 1 from public.user_roles
        where user_id = v_actor_id and role::text in ('finance', 'admin')
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

    -- Write append-only debit ledger entry
    insert into public.payment_ledger (
        payment_id,
        payer_id,
        entry_type,
        amount_minor,
        currency_code,
        balance_after_minor,
        description,
        metadata
    ) values (
        v_payment.id,
        v_payment.payer_id,
        'refund',
        v_payment.amount_minor,
        v_payment.currency_code,
        0,
        concat('Admin refund: ', coalesce(p_reason, 'No reason provided')),
        jsonb_build_object(
            'actor_id', v_actor_id,
            'refunded_at', clock_timestamp(),
            'original_checkout_id', v_payment.checkout_request_id
        )
    );

    -- Log to payment_audit_log
    insert into public.payment_audit_log (
        action,
        payment_id,
        actor_id,
        payload
    ) values (
        'admin_refund',
        v_payment.id,
        v_actor_id,
        jsonb_build_object(
            'amount_minor', v_payment.amount_minor,
            'currency_code', v_payment.currency_code,
            'reason', p_reason
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', 'refunded'
    );
end;
$$;

revoke execute on function public.admin_record_refund(uuid, uuid, text) from public, anon;
grant execute on function public.admin_record_refund(uuid, uuid, text) to authenticated, service_role;


-- Admin Revenue Analytics Aggregate
create or replace function public.get_revenue_metrics(
    p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor_id uuid;
    v_total_revenue bigint := 0;
    v_boost_mrr bigint := 0;
    v_top_ad_revenue bigint := 0;
    v_active_subscribers integer := 0;
    v_active_promotions integer := 0;
    v_failed_payments integer := 0;
begin
    -- Bind actor strictly to authenticated caller session
    v_actor_id := auth.uid();
    if v_actor_id is null then
        if current_user = 'service_role' or current_user = 'postgres' then
            v_actor_id := p_actor_id;
        else
            raise exception 'AUTH_REQUIRED: Authenticated session required';
        end if;
    end if;

    -- Strict role check
    if not exists (
        select 1 from public.user_roles
        where user_id = v_actor_id and role::text in ('finance', 'admin')
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

revoke execute on function public.get_revenue_metrics(uuid) from public, anon;
grant execute on function public.get_revenue_metrics(uuid) to authenticated, service_role;


-- ============================================================================
-- 3. Search Path Hardening on Immutability Triggers (SEC-P2-02)
-- ============================================================================

create or replace function public.prevent_payment_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_ledger cannot be updated or deleted';
end;
$$;

create or replace function public.prevent_payment_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_audit_log cannot be updated or deleted';
end;
$$;


-- ============================================================================
-- 4. Fix Infinite Recursion in Service Packages Update Policy
-- ============================================================================

drop policy if exists "Providers can update own packages" on public.service_packages;

create policy "Providers can update own packages"
    on public.service_packages
    for update
    to authenticated
    using (provider_id = (select auth.uid()))
    with check (provider_id = (select auth.uid()));

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
        if old.status = 'draft' and new.status = 'published' and (new.current_version_id is null or new.current_version_id = old.current_version_id) then
            raise exception 'Draft packages must be published via publish_service_package RPC.';
        end if;
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


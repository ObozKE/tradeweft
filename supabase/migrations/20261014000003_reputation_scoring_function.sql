-- Migration 20261014000003: Phase 4 Reviews & Public Trust Ledger - Reputation Engine
-- Implements the Proof of Reliability scoring algorithm, Bayesian smoothing,
-- recency decay, pair dampening, and anomaly flag heuristics in pure PostgreSQL.

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
begin
    -- 1. Fetch profile creation timestamp for anomaly detection
    select created_at into v_profile_created_at from public.profiles where id = p_provider_id;

    -- 2. Count distinct completed trades (from agreements where user was a confirmed party)
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
            -- Chronological ranking of review per partner to apply pair dampening (1/k)
            row_number() over (
                partition by r.reviewer_id 
                order by r.revealed_at asc, r.id asc
            ) as partner_trade_order,
            -- Recency delta in days
            greatest(0, extract(epoch from (p_as_of - coalesce(r.revealed_at, r.created_at))) / 86400.0) as days_ago
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
            -- Normalized trade score on scale 0-100:
            -- Weights: 50% overall, 20% would_trade_again, 15% timeliness, 15% communication
            (
                (
                    (0.50 * overall_rating) +
                    (0.20 * case when would_trade_again then 5.0 else 1.0 end) +
                    (0.15 * timeliness_rating) +
                    (0.15 * communication_rating)
                    - 1.0
                ) / 4.0
            ) * 100.0 as review_score,
            -- Pair dampening: 1/k
            (1.0 / partner_trade_order::numeric) as pair_weight,
            -- Recency decay: 12-month (365 days) half-life: 0.5 ^ (days / 365)
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
    -- Tiers are driven strictly by distinct trading partners
    if v_distinct_partners >= 10 then
        v_tier := 'established';
    elsif v_distinct_partners >= 3 then
        v_tier := 'building';
    else
        v_tier := 'new';
    end if;

    if v_distinct_partners >= 3 and (v_total_weight + v_prior_confidence) > 0 then
        -- Bayesian smoothing with prior m=5, C=80.0
        v_raw_score := (v_weighted_sum + (v_prior_confidence * v_prior_mean)) / (v_total_weight + v_prior_confidence);
        -- Clamp to [0, 100] and round to 1 decimal place
        v_final_score := round(least(100.0, greatest(0.0, v_raw_score)), 1);
    else
        -- Pre-threshold: score remains null to protect against single-trade distortion
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

    -- 6. Anomaly Detection Heuristics (Flags only, never auto-penalizes)
    -- Heuristic A: Pair velocity anomaly (more than 3 mutual trades with same partner in 30 days)
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

    -- Heuristic B: Rapid volume for new account (account < 7 days old with >= 3 completed trades)
    if v_profile_created_at is not null and v_profile_created_at >= (now() - interval '7 days') and v_completed_trades >= 3 then
        if not exists (
            select 1 from public.reputation_flags 
            where provider_id = p_provider_id and reason = 'NEW_ACCOUNT_RAPID_TRADES'
        ) then
            insert into public.reputation_flags (provider_id, reason, payload)
            values (
                p_provider_id,
                'NEW_ACCOUNT_RAPID_TRADES',
                jsonb_build_object('account_age_days', extract(day from (now() - v_profile_created_at)), 'completed_trades', v_completed_trades)
            );
        end if;
    end if;

    -- Heuristic C: Reciprocal 5-star review burst within 24 hours
    insert into public.reputation_flags (provider_id, reason, payload)
    select 
        p_provider_id,
        'RECIPROCAL_5_STAR_BURST',
        jsonb_build_object('reviewer_id', r1.reviewer_id, 'agreement_id', r1.agreement_id)
    from public.reviews r1
    join public.reviews r2 on r2.reviewer_id = p_provider_id and r2.reviewee_id = r1.reviewer_id
    where r1.reviewee_id = p_provider_id
      and r1.overall_rating = 5
      and r2.overall_rating = 5
      and abs(extract(epoch from (r1.revealed_at - r2.revealed_at))) <= 86400
      and not exists (
          select 1 from public.reputation_flags rf
          where rf.provider_id = p_provider_id
            and rf.reason = 'RECIPROCAL_5_STAR_BURST'
            and (rf.payload->>'agreement_id')::uuid = r1.agreement_id
      );

    return v_rep;
end;
$$;

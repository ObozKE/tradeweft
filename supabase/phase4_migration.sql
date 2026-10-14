-- Phase 4 Consolidated Migration: Reviews & The Public Trust Ledger
-- Combines migrations 20261014000001 through 20261014000006 for single-step execution in Supabase SQL Editor.

-- ============================================================================
-- PART 1: ENUMS AND TABLES
-- ============================================================================

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

create table if not exists public.trade_terms_versions (
    version text primary key,
    includes_public_ledger boolean not null default false,
    disclosure_text text not null,
    effective_at timestamptz not null default now()
);

insert into public.trade_terms_versions (version, includes_public_ledger, disclosure_text, effective_at)
values 
    ('2026-10-v1', false, 'Standard Barter Agreement Terms v1. Trades and reviews are private between participants.', '2026-10-01 00:00:00+00'),
    ('2026-10-v2', true, 'Trade Weft Terms v2. Completed trades (deliverables and quantities) and double-blind reviews will be published to the Public Trust Ledger to build your verified reputation. Notes and monetary values are never disclosed.', '2026-10-14 00:00:00+00')
on conflict (version) do update set 
    includes_public_ledger = excluded.includes_public_ledger,
    disclosure_text = excluded.disclosure_text;

alter table public.agreements 
    alter column trade_terms_version set default '2026-10-v2';

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

create table if not exists public.review_replies (
    review_id uuid primary key references public.reviews(id) on delete cascade,
    author_id uuid not null references public.profiles(id),
    body text not null check (length(trim(body)) >= 1 and length(body) <= 500),
    created_at timestamptz not null default now()
);

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

create table if not exists public.provider_reputation (
    provider_id uuid primary key references public.profiles(id) on delete cascade,
    score numeric(5,2),
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

create table if not exists public.reputation_flags (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references public.profiles(id),
    reason text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.review_moderation_log (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references public.reviews(id),
    admin_id uuid not null references auth.users(id),
    action text not null check (action in ('hide', 'restore')),
    reason text not null,
    created_at timestamptz not null default now()
);

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

-- ============================================================================
-- PART 2: INTEGRITY TRIGGERS & PROFILES VIEW EXPANSION
-- ============================================================================

drop trigger if exists tr_reviews_updated_at on public.reviews;
create trigger tr_reviews_updated_at
    before update on public.reviews
    for each row
    execute function public.handle_updated_at();

create or replace function public.prevent_ledger_entries_mutation()
returns trigger language plpgsql as $$
begin
    raise exception 'Ledger entries are strictly insert-only and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_ledger_entries_mutation on public.ledger_entries;
create trigger tr_block_ledger_entries_mutation
    before update or delete on public.ledger_entries
    for each row
    execute function public.prevent_ledger_entries_mutation();

create or replace function public.prevent_review_replies_mutation()
returns trigger language plpgsql as $$
begin
    raise exception 'Review replies are strictly immutable once posted.';
end;
$$;

drop trigger if exists tr_block_review_replies_mutation on public.review_replies;
create trigger tr_block_review_replies_mutation
    before update or delete on public.review_replies
    for each row
    execute function public.prevent_review_replies_mutation();

create or replace function public.validate_review_submission()
returns trigger language plpgsql as $$
declare
    v_agr record;
begin
    select id, proposer_id, recipient_id, status, completed_at
    into v_agr from public.agreements where id = new.agreement_id;

    if v_agr.id is null then
        raise exception 'AGREEMENT_NOT_FOUND: Referenced barter agreement does not exist';
    end if;

    if v_agr.status <> 'completed' or v_agr.completed_at is null then
        raise exception 'AGREEMENT_NOT_COMPLETED: Reviews can only be submitted for completed barter trades';
    end if;

    if new.reviewer_id not in (v_agr.proposer_id, v_agr.recipient_id) then
        raise exception 'NOT_A_PARTY: Only confirmed participants of the agreement can submit a review';
    end if;

    if new.reviewer_id = v_agr.proposer_id and new.reviewee_id <> v_agr.recipient_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;
    if new.reviewer_id = v_agr.recipient_id and new.reviewee_id <> v_agr.proposer_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;

    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_review_submission on public.reviews;
create trigger tr_validate_review_submission
    before insert on public.reviews
    for each row
    execute function public.validate_review_submission();

create or replace function public.validate_review_reply()
returns trigger language plpgsql as $$
declare
    v_rev record;
begin
    select id, reviewee_id, status into v_rev from public.reviews where id = new.review_id;
    if v_rev.id is null then raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist'; end if;
    if v_rev.status <> 'revealed' then raise exception 'REVIEW_NOT_REVEALED: Replies can only be posted to publicly revealed reviews'; end if;
    if new.author_id <> v_rev.reviewee_id then raise exception 'FORBIDDEN: Only the recipient (reviewee) of a review can post a public reply'; end if;
    return new;
end;
$$;

drop trigger if exists tr_validate_review_reply on public.review_replies;
create trigger tr_validate_review_reply
    before insert on public.review_replies
    for each row
    execute function public.validate_review_reply();

create or replace function public.validate_review_report()
returns trigger language plpgsql as $$
declare
    v_rev record;
begin
    select id, reviewee_id into v_rev from public.reviews where id = new.review_id;
    if v_rev.id is null then raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist'; end if;
    if new.reporter_id <> v_rev.reviewee_id then raise exception 'FORBIDDEN: Only the reviewee can report a review for moderation'; end if;
    return new;
end;
$$;

drop trigger if exists tr_validate_review_report on public.review_reports;
create trigger tr_validate_review_report
    before insert on public.review_reports
    for each row
    execute function public.validate_review_report();

create or replace view public.public_provider_profiles
with (security_invoker = false)
as
select
    p.id,
    p.display_name,
    p.business_name,
    p.avatar_url,
    p.city_id,
    p.area_id,
    p.created_at as member_since
from public.profiles p
where exists (
    select 1
    from public.service_packages sp
    where sp.provider_id = p.id
      and sp.status = 'published'
)
or exists (
    select 1
    from public.ledger_entries le
    where le.provider_id = p.id
);

grant select on public.public_provider_profiles to anon, authenticated;

-- ============================================================================
-- PART 3: REPUTATION COMPUTATION ENGINE
-- ============================================================================

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
    select created_at into v_profile_created_at from public.profiles where id = p_provider_id;

    select count(*) into v_completed_trades
    from public.agreements
    where status = 'completed'
      and (proposer_id = p_provider_id or recipient_id = p_provider_id);

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
            row_number() over (partition by r.reviewer_id order by r.revealed_at asc, r.id asc) as partner_trade_order,
            greatest(0, extract(epoch from (p_as_of - coalesce(r.revealed_at, r.created_at))) / 86400.0) as days_ago
        from public.reviews r
        where r.reviewee_id = p_provider_id and r.status = 'revealed'
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

    insert into public.provider_reputation (
        provider_id, score, tier, review_count, distinct_partners, completed_trades,
        avg_overall, avg_quality, avg_communication, avg_timeliness, would_trade_again_pct,
        score_version, computed_at
    ) values (
        p_provider_id, v_final_score, v_tier, v_review_count, v_distinct_partners, v_completed_trades,
        round(v_avg_overall, 2), round(v_avg_quality, 2), round(v_avg_communication, 2), round(v_avg_timeliness, 2), round(v_would_trade_pct, 1),
        '2026-10-v1', now()
    )
    on conflict (provider_id) do update set
        score = excluded.score, tier = excluded.tier, review_count = excluded.review_count,
        distinct_partners = excluded.distinct_partners, completed_trades = excluded.completed_trades,
        avg_overall = excluded.avg_overall, avg_quality = excluded.avg_quality,
        avg_communication = excluded.avg_communication, avg_timeliness = excluded.avg_timeliness,
        would_trade_again_pct = excluded.would_trade_again_pct, score_version = excluded.score_version,
        computed_at = excluded.computed_at
    returning * into v_rep;

    insert into public.reputation_flags (provider_id, reason, payload)
    select 
        p_provider_id, 'PAIR_VELOCITY_ANOMALY',
        jsonb_build_object('partner_id', sub.partner_id, 'trades_in_30d', sub.trade_count)
    from (
        select 
            case when proposer_id = p_provider_id then recipient_id else proposer_id end as partner_id,
            count(*) as trade_count
        from public.agreements
        where status = 'completed' and (proposer_id = p_provider_id or recipient_id = p_provider_id) and completed_at >= (now() - interval '30 days')
        group by 1 having count(*) > 3
    ) sub
    where not exists (
        select 1 from public.reputation_flags rf 
        where rf.provider_id = p_provider_id and rf.reason = 'PAIR_VELOCITY_ANOMALY'
          and (rf.payload->>'partner_id')::uuid = sub.partner_id and rf.created_at >= (now() - interval '7 days')
    );

    if v_profile_created_at is not null and v_profile_created_at >= (now() - interval '7 days') and v_completed_trades >= 3 then
        if not exists (select 1 from public.reputation_flags where provider_id = p_provider_id and reason = 'NEW_ACCOUNT_RAPID_TRADES') then
            insert into public.reputation_flags (provider_id, reason, payload)
            values (p_provider_id, 'NEW_ACCOUNT_RAPID_TRADES', jsonb_build_object('account_age_days', extract(day from (now() - v_profile_created_at)), 'completed_trades', v_completed_trades));
        end if;
    end if;

    insert into public.reputation_flags (provider_id, reason, payload)
    select p_provider_id, 'RECIPROCAL_5_STAR_BURST', jsonb_build_object('reviewer_id', r1.reviewer_id, 'agreement_id', r1.agreement_id)
    from public.reviews r1
    join public.reviews r2 on r2.reviewer_id = p_provider_id and r2.reviewee_id = r1.reviewer_id
    where r1.reviewee_id = p_provider_id and r1.overall_rating = 5 and r2.overall_rating = 5
      and abs(extract(epoch from (r1.revealed_at - r2.revealed_at))) <= 86400
      and not exists (select 1 from public.reputation_flags rf where rf.provider_id = p_provider_id and rf.reason = 'RECIPROCAL_5_STAR_BURST' and (rf.payload->>'agreement_id')::uuid = r1.agreement_id);

    return v_rep;
end;
$$;

-- ============================================================================
-- PART 4: EVENT DISPATCHER & CONSUMER INFRASTRUCTURE
-- ============================================================================

create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_enqueued integer := 0;
begin
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'trust_ledger')
    on conflict (event_id, consumer) do nothing;

    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'reviews_reputation')
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
end;
$$;

create or replace function public.process_agreement_completed_event(p_event_id uuid, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
    v_agr_id uuid;
    v_agr record;
    v_terms_ver record;
    v_proposer_lines jsonb;
    v_recipient_lines jsonb;
    v_contract_ref text;
    v_completed_month date;
begin
    v_agr_id := (p_payload->>'agreement_id')::uuid;
    if v_agr_id is null then select aggregate_id into v_agr_id from public.domain_events where id = p_event_id; end if;
    if v_agr_id is null then raise exception 'INVALID_PAYLOAD: Missing agreement_id'; end if;

    select * into v_agr from public.agreements where id = v_agr_id;
    if v_agr.id is null then raise exception 'AGREEMENT_NOT_FOUND: %', v_agr_id; end if;

    select * into v_terms_ver from public.trade_terms_versions where version = v_agr.trade_terms_version;

    if v_terms_ver.includes_public_ledger = true and v_agr.accepted_revision_id is not null then
        v_contract_ref := substr(coalesce(v_agr.terms_hash, md5(v_agr.id::text)), 1, 12);
        v_completed_month := date_trunc('month', coalesce(v_agr.completed_at, now()))::date;

        select coalesce(jsonb_agg(jsonb_build_object('title', coalesce(spv.snapshot->>'title', 'Service Package'), 'quantity', al.quantity) order by al.id), '[]'::jsonb)
        into v_proposer_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id and al.side = 'proposer_gives';

        select coalesce(jsonb_agg(jsonb_build_object('title', coalesce(spv.snapshot->>'title', 'Service Package'), 'quantity', al.quantity) order by al.id), '[]'::jsonb)
        into v_recipient_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id and al.side = 'recipient_gives';

        insert into public.ledger_entries (agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code)
        values (v_agr.id, v_agr.proposer_id, v_agr.recipient_id, v_proposer_lines, v_recipient_lines, v_completed_month, v_contract_ref, v_agr.country_code)
        on conflict (agreement_id, provider_id) do nothing;

        insert into public.ledger_entries (agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code)
        values (v_agr.id, v_agr.recipient_id, v_agr.proposer_id, v_recipient_lines, v_proposer_lines, v_completed_month, v_contract_ref, v_agr.country_code)
        on conflict (agreement_id, provider_id) do nothing;
    end if;

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values 
        (v_agr.proposer_id, v_agr.id, 'review.requested', 'Trade Completed — Leave a Review', 'Your trade has been completed. Leave a double-blind review for your partner within 14 days.', '/dashboard/reviews'),
        (v_agr.recipient_id, v_agr.id, 'review.requested', 'Trade Completed — Leave a Review', 'Your trade has been completed. Leave a double-blind review for your partner within 14 days.', '/dashboard/reviews');

    return true;
end;
$$;

create or replace function public.process_review_events(p_event_id uuid, p_event_type text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_reviewee_id uuid;
begin
    v_reviewee_id := (p_payload->>'reviewee_id')::uuid;
    if v_reviewee_id is not null then perform public.recompute_provider_reputation(v_reviewee_id); end if;
    return true;
end;
$$;

create or replace function public.dispatch_domain_events(p_batch_size integer default 20)
returns table (processed_count integer, failed_count integer, dead_letter_count integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_processed integer := 0; v_failed integer := 0; v_dead_letter integer := 0;
    v_row record; v_de record; v_err text;
begin
    perform public.enqueue_pending_domain_event_deliveries();

    for v_row in 
        select ded.* from public.domain_event_deliveries ded
        where ded.status in ('pending', 'processing') and ded.next_attempt_at <= now()
        order by ded.next_attempt_at asc limit least(coalesce(p_batch_size, 20), 100)
        for update skip locked
    loop
        select * into v_de from public.domain_events where id = v_row.event_id;

        begin
            if v_row.consumer = 'trust_ledger' and v_de.event_type = 'agreement.completed' then
                perform public.process_agreement_completed_event(v_de.id, v_de.payload);
            elsif v_row.consumer = 'reviews_reputation' and v_de.event_type in ('review.revealed', 'review.moderated') then
                perform public.process_review_events(v_de.id, v_de.event_type, v_de.payload);
            end if;

            update public.domain_event_deliveries
            set status = 'delivered', attempts = attempts + 1, last_error = null, processed_at = now()
            where id = v_row.id;
            v_processed := v_processed + 1;
        exception when others then
            v_err := SQLERRM;
            v_failed := v_failed + 1;
            if (v_row.attempts + 1) >= 5 then
                update public.domain_event_deliveries
                set status = 'dead_letter', attempts = attempts + 1, last_error = v_err, processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                update public.domain_event_deliveries
                set status = 'pending', attempts = attempts + 1, last_error = v_err, next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempts))
                where id = v_row.id;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;

create or replace function public.check_review_windows_and_reveal()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_count integer := 0; v_rev record;
begin
    for v_rev in
        select r.id, r.reviewee_id, r.reviewer_id, r.agreement_id
        from public.reviews r join public.agreements a on a.id = r.agreement_id
        where r.status = 'submitted' and now() > (a.completed_at + interval '14 days')
    loop
        update public.reviews
        set status = 'revealed', revealed_at = now(), updated_at = now()
        where id = v_rev.id;

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        values ('review', v_rev.id, 'review.revealed', jsonb_build_object('review_id', v_rev.id, 'reviewee_id', v_rev.reviewee_id, 'reason', 'window_expired'));

        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values (v_rev.reviewee_id, v_rev.agreement_id, 'review.revealed', 'Review Revealed', 'The 14-day review window closed. Your trading partner''s review is now visible.', '/dashboard/reviews');

        perform public.recompute_provider_reputation(v_rev.reviewee_id);
        v_count := v_count + 1;
    end loop;

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    select party.user_id, a.id, 'review.reminder', 'Review Window Reminder', 'You have 7 days left to submit a review for your recently completed barter trade.', '/dashboard/reviews'
    from public.agreements a cross join lateral (values (a.proposer_id), (a.recipient_id)) as party(user_id)
    where a.status = 'completed' and now() >= (a.completed_at + interval '7 days') and now() < (a.completed_at + interval '8 days')
      and not exists (select 1 from public.reviews r where r.agreement_id = a.id and r.reviewer_id = party.user_id)
      and not exists (select 1 from public.notifications n where n.agreement_id = a.id and n.user_id = party.user_id and n.event_type = 'review.reminder');

    return v_count;
end;
$$;

-- ============================================================================
-- PART 5: REVIEW RPC FUNCTIONS
-- ============================================================================

create or replace function public.submit_review(
    p_agreement_id uuid,
    p_overall integer,
    p_quality integer,
    p_communication integer,
    p_timeliness integer,
    p_would_trade_again boolean,
    p_body text default null,
    p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_reviewee_id uuid;
    v_rev_id uuid;
    v_cached_response jsonb;
    v_counter_rev record;
    v_is_revealed boolean := false;
    v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;

    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'submit_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id;
    if v_agr.id is null then raise exception 'NOT_FOUND: Barter agreement not found'; end if;
    if v_agr.status <> 'completed' or v_agr.completed_at is null then raise exception 'INVALID_STATE: Reviews can only be submitted for completed agreements'; end if;

    if v_user_id = v_agr.proposer_id then
        v_reviewee_id := v_agr.recipient_id;
    elsif v_user_id = v_agr.recipient_id then
        v_reviewee_id := v_agr.proposer_id;
    else
        raise exception 'NOT_A_PARTY: You are not a participant in this agreement';
    end if;

    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    if exists (select 1 from public.reviews where agreement_id = p_agreement_id and reviewer_id = v_user_id) then
        raise exception 'ALREADY_REVIEWED: You have already submitted a review for this barter agreement';
    end if;

    insert into public.reviews (
        agreement_id, reviewer_id, reviewee_id, overall_rating, quality_rating, communication_rating, timeliness_rating,
        would_trade_again, body, status, submitted_at, edit_until
    ) values (
        p_agreement_id, v_user_id, v_reviewee_id, p_overall, p_quality, p_communication, p_timeliness,
        p_would_trade_again, nullif(trim(p_body), ''), 'submitted', now(), now() + interval '1 hour'
    ) returning id into v_rev_id;

    select * into v_counter_rev from public.reviews
    where agreement_id = p_agreement_id and reviewer_id = v_reviewee_id and status = 'submitted';

    if v_counter_rev.id is not null then
        update public.reviews
        set status = 'revealed', revealed_at = now(), edit_until = now(), updated_at = now()
        where id in (v_rev_id, v_counter_rev.id);

        v_is_revealed := true;

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
        values 
            ('review', v_rev_id, 'review.revealed', v_user_id, jsonb_build_object('review_id', v_rev_id, 'reviewee_id', v_reviewee_id, 'agreement_id', p_agreement_id)),
            ('review', v_counter_rev.id, 'review.revealed', v_reviewee_id, jsonb_build_object('review_id', v_counter_rev.id, 'reviewee_id', v_user_id, 'agreement_id', p_agreement_id));

        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values
            (v_reviewee_id, p_agreement_id, 'review.revealed', 'New Review Revealed', 'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.', '/dashboard/reviews'),
            (v_user_id, p_agreement_id, 'review.revealed', 'New Review Revealed', 'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.', '/dashboard/reviews');

        perform public.recompute_provider_reputation(v_reviewee_id);
        perform public.recompute_provider_reputation(v_user_id);
    else
        insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
        values ('review', v_rev_id, 'review.submitted', v_user_id, jsonb_build_object('review_id', v_rev_id, 'agreement_id', p_agreement_id));
    end if;

    v_res := jsonb_build_object(
        'review_id', v_rev_id,
        'status', case when v_is_revealed then 'revealed' else 'submitted' end,
        'revealed', v_is_revealed
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'submit_review', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.edit_review(
    p_review_id uuid,
    p_overall integer,
    p_quality integer,
    p_communication integer,
    p_timeliness integer,
    p_would_trade_again boolean,
    p_body text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user_id uuid := (select auth.uid()); v_rev record;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewer_id <> v_user_id then raise exception 'FORBIDDEN: You can only edit your own review'; end if;
    if v_rev.status <> 'submitted' then raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be modified'; end if;
    if now() > v_rev.edit_until then raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour editing grace period has expired'; end if;

    update public.reviews
    set overall_rating = p_overall, quality_rating = p_quality, communication_rating = p_communication,
        timeliness_rating = p_timeliness, would_trade_again = p_would_trade_again, body = nullif(trim(p_body), ''), updated_at = now()
    where id = p_review_id;

    return jsonb_build_object('success', true, 'review_id', p_review_id);
end;
$$;

create or replace function public.withdraw_review(p_review_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user_id uuid := (select auth.uid()); v_rev record;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewer_id <> v_user_id then raise exception 'FORBIDDEN: You can only withdraw your own review'; end if;
    if v_rev.status <> 'submitted' then raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be withdrawn'; end if;
    if now() > v_rev.edit_until then raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour withdrawal grace period has expired'; end if;

    delete from public.reviews where id = p_review_id;
    return jsonb_build_object('success', true, 'withdrawn_id', p_review_id);
end;
$$;

create or replace function public.reply_to_review(p_review_id uuid, p_body text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record; v_clean_body text := trim(p_body);
    v_cached_response jsonb; v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys where key = p_idempotency_key and user_id = v_user_id and action = 'reply_to_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    if length(v_clean_body) < 1 or length(v_clean_body) > 500 then raise exception 'INVALID_LENGTH: Reply must be between 1 and 500 characters'; end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewee_id <> v_user_id then raise exception 'FORBIDDEN: Only the reviewee can post a public reply'; end if;
    if v_rev.status <> 'revealed' then raise exception 'NOT_REVEALED: Replies can only be posted after the review is publicly revealed'; end if;
    if exists (select 1 from public.review_replies where review_id = p_review_id) then raise exception 'ALREADY_REPLIED: You have already posted a reply'; end if;

    insert into public.review_replies (review_id, author_id, body)
    values (p_review_id, v_user_id, v_clean_body);

    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values (v_rev.reviewer_id, v_rev.agreement_id, 'review.reply', 'Partner Replied to Your Review', 'Your trade partner posted a response to your review.', '/dashboard/reviews');

    v_res := jsonb_build_object('success', true, 'review_id', p_review_id);
    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response) values (p_idempotency_key, v_user_id, 'reply_to_review', v_res) on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.report_review(p_review_id uuid, p_reason public.report_reason, p_detail text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record; v_rep_id uuid; v_cached_response jsonb; v_res jsonb;
begin
    if v_user_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if p_idempotency_key is not null then
        select response into v_cached_response from public.idempotency_keys where key = p_idempotency_key and user_id = v_user_id and action = 'report_review';
        if v_cached_response is not null then return v_cached_response; end if;
    end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;
    if v_rev.reviewee_id <> v_user_id then raise exception 'FORBIDDEN: Only the reviewee can report a review'; end if;
    if exists (select 1 from public.review_reports where review_id = p_review_id and reporter_id = v_user_id) then raise exception 'ALREADY_REPORTED: You have already reported this review'; end if;

    insert into public.review_reports (review_id, reporter_id, reason, detail)
    values (p_review_id, v_user_id, p_reason, nullif(trim(p_detail), ''))
    returning id into v_rep_id;

    v_res := jsonb_build_object('success', true, 'report_id', v_rep_id);
    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response) values (p_idempotency_key, v_user_id, 'report_review', v_res) on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.moderate_review(p_review_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid := (select auth.uid());
    v_rev record; v_target_status public.review_status;
begin
    if v_admin_id is null then raise exception 'AUTH_REQUIRED: Authenticated session required'; end if;
    if not exists (select 1 from public.user_roles where user_id = v_admin_id and role = 'admin') then
        raise exception 'FORBIDDEN: Admin privileges required for moderation';
    end if;

    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then raise exception 'NOT_FOUND: Review not found'; end if;

    if p_action = 'hide' then v_target_status := 'hidden_by_moderation';
    elsif p_action = 'restore' then v_target_status := 'revealed';
    else raise exception 'INVALID_ACTION: Moderation action must be "hide" or "restore"'; end if;

    update public.reviews set status = v_target_status, updated_at = now() where id = p_review_id;
    insert into public.review_moderation_log (review_id, admin_id, action, reason) values (p_review_id, v_admin_id, p_action, p_reason);
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values ('review', p_review_id, 'review.moderated', v_admin_id, jsonb_build_object('review_id', p_review_id, 'action', p_action, 'reviewee_id', v_rev.reviewee_id));

    perform public.recompute_provider_reputation(v_rev.reviewee_id);
    return jsonb_build_object('success', true, 'review_id', p_review_id, 'status', v_target_status);
end;
$$;

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY POLICIES
-- ============================================================================

alter table public.trade_terms_versions enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.review_reports enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.provider_reputation enable row level security;
alter table public.reputation_flags enable row level security;
alter table public.review_moderation_log enable row level security;
alter table public.domain_event_deliveries enable row level security;

create policy "Public can read trade terms versions" on public.trade_terms_versions for select to anon, authenticated using (true);
create policy "Double-blind reviews select policy" on public.reviews for select to anon, authenticated using (reviewer_id = (select auth.uid()) or status = 'revealed');
create policy "Public can view review replies" on public.review_replies for select to anon, authenticated using (true);
create policy "Reporters and admins can read reports" on public.review_reports for select to authenticated using (reporter_id = (select auth.uid()) or exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Public can view trust ledger entries" on public.ledger_entries for select to anon, authenticated using (true);
create policy "Public can view provider reputation" on public.provider_reputation for select to anon, authenticated using (true);
create policy "Admins can view reputation anomaly flags" on public.reputation_flags for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Admins can view review moderation log" on public.review_moderation_log for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));
create policy "Admins can view domain event deliveries" on public.domain_event_deliveries for select to authenticated using (exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'));

grant execute on function public.submit_review(uuid, int, int, int, int, boolean, text, text) to authenticated;
grant execute on function public.edit_review(uuid, int, int, int, int, boolean, text) to authenticated;
grant execute on function public.withdraw_review(uuid) to authenticated;
grant execute on function public.reply_to_review(uuid, text, text) to authenticated;
grant execute on function public.report_review(uuid, public.report_reason, text, text) to authenticated;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;
grant execute on function public.recompute_provider_reputation(uuid, timestamptz) to authenticated;
grant execute on function public.dispatch_domain_events(int) to authenticated, service_role;
grant execute on function public.check_review_windows_and_reveal() to authenticated, service_role;

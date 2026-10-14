-- Migration 20261014000004: Phase 4 Reviews & Public Trust Ledger - Event Dispatcher & Consumers
-- Reliable, idempotent asynchronous consumer handling agreement.completed and review events.
-- Uses FOR UPDATE SKIP LOCKED with exponential backoff and dead-letter state.

-- 1. Helper: Register/Queue Deliveries for newly published domain events
create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_enqueued integer := 0;
begin
    -- 1. Consumer 'trust_ledger': handles 'agreement.completed'
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (
          select 1 from public.domain_event_deliveries ded
          where ded.event_id = de.id and ded.consumer = 'trust_ledger'
      )
    on conflict (event_id, consumer) do nothing;
    get diagnostics v_enqueued = row_count;

    -- 2. Consumer 'reviews_reputation': handles 'review.revealed' and 'review.moderated'
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (
          select 1 from public.domain_event_deliveries ded
          where ded.event_id = de.id and ded.consumer = 'reviews_reputation'
      )
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
end;
$$;

-- 2. Consumer Handler: agreement.completed -> Trust Ledger & Review Window Setup
create or replace function public.process_agreement_completed_event(
    p_event_id uuid,
    p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
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
    if v_agr_id is null then
        select aggregate_id into v_agr_id from public.domain_events where id = p_event_id;
    end if;

    if v_agr_id is null then
        raise exception 'INVALID_PAYLOAD: Missing agreement_id in event payload';
    end if;

    -- Fetch agreement details
    select * into v_agr from public.agreements where id = v_agr_id;
    if v_agr.id is null then
        raise exception 'AGREEMENT_NOT_FOUND: Agreement % not found', v_agr_id;
    end if;

    -- Fetch terms version policy
    select * into v_terms_ver from public.trade_terms_versions where version = v_agr.trade_terms_version;

    -- 1. Public Trust Ledger Insertion (Only if accepted terms version disclosed public ledger)
    if v_terms_ver.includes_public_ledger = true and v_agr.accepted_revision_id is not null then
        v_contract_ref := substr(coalesce(v_agr.terms_hash, md5(v_agr.id::text)), 1, 12);
        v_completed_month := date_trunc('month', coalesce(v_agr.completed_at, now()))::date;

        -- Extract lines given by proposer (proposer_gives)
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'title', coalesce(spv.snapshot->>'title', 'Service Package'),
                    'quantity', al.quantity
                ) order by al.id
            ), '[]'::jsonb
        ) into v_proposer_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id
          and al.side = 'proposer_gives';

        -- Extract lines given by recipient (recipient_gives)
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'title', coalesce(spv.snapshot->>'title', 'Service Package'),
                    'quantity', al.quantity
                ) order by al.id
            ), '[]'::jsonb
        ) into v_recipient_lines
        from public.agreement_lines al
        join public.service_package_versions spv on spv.id = al.package_version_id
        where al.revision_id = v_agr.accepted_revision_id
          and al.side = 'recipient_gives';

        -- Ledger Entry: Proposer's perspective (gave proposer_lines, received recipient_lines)
        insert into public.ledger_entries (
            agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code
        ) values (
            v_agr.id, v_agr.proposer_id, v_agr.recipient_id, v_proposer_lines, v_recipient_lines, v_completed_month, v_contract_ref, v_agr.country_code
        ) on conflict (agreement_id, provider_id) do nothing;

        -- Ledger Entry: Recipient's perspective (gave recipient_lines, received proposer_lines)
        insert into public.ledger_entries (
            agreement_id, provider_id, counterparty_id, gave, received, completed_month, contract_ref, country_code
        ) values (
            v_agr.id, v_agr.recipient_id, v_agr.proposer_id, v_recipient_lines, v_proposer_lines, v_completed_month, v_contract_ref, v_agr.country_code
        ) on conflict (agreement_id, provider_id) do nothing;
    end if;

    -- 2. Send in-app notification to both parties: review.requested
    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values 
        (
            v_agr.proposer_id,
            v_agr.id,
            'review.requested',
            'Trade Completed — Leave a Review',
            'Your trade has been completed. Leave a double-blind review for your partner within 14 days.',
            '/dashboard/reviews'
        ),
        (
            v_agr.recipient_id,
            v_agr.id,
            'review.requested',
            'Trade Completed — Leave a Review',
            'Your trade has been completed. Leave a double-blind review for your partner within 14 days.',
            '/dashboard/reviews'
        );

    return true;
end;
$$;

-- 3. Consumer Handler: review events -> Recompute reputation
create or replace function public.process_review_events(
    p_event_id uuid,
    p_event_type text,
    p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_reviewee_id uuid;
begin
    v_reviewee_id := (p_payload->>'reviewee_id')::uuid;

    if v_reviewee_id is not null then
        perform public.recompute_provider_reputation(v_reviewee_id);
    end if;

    return true;
end;
$$;

-- 4. Main Event Dispatcher Engine
create or replace function public.dispatch_domain_events(
    p_batch_size integer default 20
)
returns table (
    processed_count integer,
    failed_count integer,
    dead_letter_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_processed integer := 0;
    v_failed integer := 0;
    v_dead_letter integer := 0;
    v_row record;
    v_de record;
    v_err text;
begin
    -- 1. Ensure any new domain events are enqueued
    perform public.enqueue_pending_domain_event_deliveries();

    -- 2. Process batch of ready deliveries using FOR UPDATE SKIP LOCKED
    for v_row in 
        select ded.*
        from public.domain_event_deliveries ded
        where ded.status in ('pending', 'processing')
          and ded.next_attempt_at <= now()
        order by ded.next_attempt_at asc
        limit least(coalesce(p_batch_size, 20), 100)
        for update skip locked
    loop
        -- Fetch domain event
        select * into v_de from public.domain_events where id = v_row.event_id;

        begin
            if v_row.consumer = 'trust_ledger' and v_de.event_type = 'agreement.completed' then
                perform public.process_agreement_completed_event(v_de.id, v_de.payload);
            elsif v_row.consumer = 'reviews_reputation' and v_de.event_type in ('review.revealed', 'review.moderated') then
                perform public.process_review_events(v_de.id, v_de.event_type, v_de.payload);
            end if;

            -- Mark success
            update public.domain_event_deliveries
            set status = 'delivered',
                attempts = attempts + 1,
                last_error = null,
                processed_at = now()
            where id = v_row.id;

            v_processed := v_processed + 1;

        exception when others then
            v_err := SQLERRM;
            v_failed := v_failed + 1;

            if (v_row.attempts + 1) >= 5 then
                -- Dead-letter after 5 attempts
                update public.domain_event_deliveries
                set status = 'dead_letter',
                    attempts = attempts + 1,
                    last_error = v_err,
                    processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                -- Exponential backoff: 1min, 2min, 4min, 8min
                update public.domain_event_deliveries
                set status = 'pending',
                    attempts = attempts + 1,
                    last_error = v_err,
                    next_attempt_at = now() + (interval '1 minute' * power(2, v_row.attempts))
                where id = v_row.id;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;

-- 5. Review Expiry Sweep (Reveal submitted reviews at 14-day window expiration)
create or replace function public.check_review_windows_and_reveal()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_count integer := 0;
    v_rev record;
begin
    -- Find reviews that are still 'submitted' where the parent agreement is completed > 14 days ago
    for v_rev in
        select r.id, r.reviewee_id, r.reviewer_id, r.agreement_id
        from public.reviews r
        join public.agreements a on a.id = r.agreement_id
        where r.status = 'submitted'
          and now() > (a.completed_at + interval '14 days')
    loop
        update public.reviews
        set status = 'revealed',
            revealed_at = now(),
            updated_at = now()
        where id = v_rev.id;

        -- Domain event
        insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        values ('review', v_rev.id, 'review.revealed', jsonb_build_object('review_id', v_rev.id, 'reviewee_id', v_rev.reviewee_id, 'reason', 'window_expired'));

        -- Notification to reviewee
        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values (
            v_rev.reviewee_id,
            v_rev.agreement_id,
            'review.revealed',
            'Review Revealed',
            'The 14-day review window closed. Your trading partner''s review is now visible.',
            '/dashboard/reviews'
        );

        -- Recompute reputation
        perform public.recompute_provider_reputation(v_rev.reviewee_id);

        v_count := v_count + 1;
    end loop;

    -- Also send day-7 reminder for completed trades with unsubmitted reviews
    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    select 
        party.user_id,
        a.id,
        'review.reminder',
        'Review Window Reminder',
        'You have 7 days left to submit a review for your recently completed barter trade.',
        '/dashboard/reviews'
    from public.agreements a
    cross join lateral (values (a.proposer_id), (a.recipient_id)) as party(user_id)
    where a.status = 'completed'
      and now() >= (a.completed_at + interval '7 days')
      and now() < (a.completed_at + interval '8 days')
      and not exists (
          select 1 from public.reviews r
          where r.agreement_id = a.id and r.reviewer_id = party.user_id
      )
      and not exists (
          select 1 from public.notifications n
          where n.agreement_id = a.id and n.user_id = party.user_id and n.event_type = 'review.reminder'
      );

    return v_count;
end;
$$;

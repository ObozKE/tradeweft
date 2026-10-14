-- Migration 20261014000005: Phase 4 Reviews & Public Trust Ledger - Security Definer RPC Functions
-- Enforces double-blind reveal, edit grace period, reply validation, and admin-only moderation.

-- 1. Submit Review (Double-Blind Mechanism)
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
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    -- Idempotency check
    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'submit_review';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- 1. Fetch parent agreement
    select * into v_agr from public.agreements where id = p_agreement_id;
    if v_agr.id is null then
        raise exception 'NOT_FOUND: Barter agreement not found';
    end if;

    if v_agr.status <> 'completed' or v_agr.completed_at is null then
        raise exception 'INVALID_STATE: Reviews can only be submitted for completed agreements';
    end if;

    -- 2. Party check & determine reviewee
    if v_user_id = v_agr.proposer_id then
        v_reviewee_id := v_agr.recipient_id;
    elsif v_user_id = v_agr.recipient_id then
        v_reviewee_id := v_agr.proposer_id;
    else
        raise exception 'NOT_A_PARTY: You are not a participant in this agreement';
    end if;

    -- 3. Window check (14 days from completed_at)
    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    -- 4. Duplicate check
    if exists (select 1 from public.reviews where agreement_id = p_agreement_id and reviewer_id = v_user_id) then
        raise exception 'ALREADY_REVIEWED: You have already submitted a review for this barter agreement';
    end if;

    -- 5. Insert author review
    insert into public.reviews (
        agreement_id,
        reviewer_id,
        reviewee_id,
        overall_rating,
        quality_rating,
        communication_rating,
        timeliness_rating,
        would_trade_again,
        body,
        status,
        submitted_at,
        edit_until
    ) values (
        p_agreement_id,
        v_user_id,
        v_reviewee_id,
        p_overall,
        p_quality,
        p_communication,
        p_timeliness,
        p_would_trade_again,
        nullif(trim(p_body), ''),
        'submitted',
        now(),
        now() + interval '1 hour'
    ) returning id into v_rev_id;

    -- 6. DOUBLE-BLIND CHECK: Has the counterparty already submitted their review?
    select * into v_counter_rev
    from public.reviews
    where agreement_id = p_agreement_id
      and reviewer_id = v_reviewee_id
      and status = 'submitted';

    if v_counter_rev.id is not null then
        -- BOTH parties have submitted! Reveal BOTH reviews simultaneously!
        update public.reviews
        set status = 'revealed',
            revealed_at = now(),
            edit_until = now(), -- Revoke any remaining edit window upon reveal
            updated_at = now()
        where id in (v_rev_id, v_counter_rev.id);

        v_is_revealed := true;

        -- Emit domain events for both reveals
        insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
        values 
            ('review', v_rev_id, 'review.revealed', v_user_id, jsonb_build_object('review_id', v_rev_id, 'reviewee_id', v_reviewee_id, 'agreement_id', p_agreement_id)),
            ('review', v_counter_rev.id, 'review.revealed', v_reviewee_id, jsonb_build_object('review_id', v_counter_rev.id, 'reviewee_id', v_user_id, 'agreement_id', p_agreement_id));

        -- Send in-app notifications to both reviewees
        insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
        values
            (
                v_reviewee_id,
                p_agreement_id,
                'review.revealed',
                'New Review Revealed',
                'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.',
                '/dashboard/reviews'
            ),
            (
                v_user_id,
                p_agreement_id,
                'review.revealed',
                'New Review Revealed',
                'Both parties have reviewed this trade. Your partner''s review is now visible on your profile.',
                '/dashboard/reviews'
            );

        -- Recompute reputation for both providers
        perform public.recompute_provider_reputation(v_reviewee_id);
        perform public.recompute_provider_reputation(v_user_id);
    else
        -- Only one party submitted so far: emit review.submitted event
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

-- 2. Edit Review (During 1-Hour Grace Period, Prior to Reveal)
create or replace function public.edit_review(
    p_review_id uuid,
    p_overall integer,
    p_quality integer,
    p_communication integer,
    p_timeliness integer,
    p_would_trade_again boolean,
    p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then
        raise exception 'NOT_FOUND: Review not found';
    end if;

    if v_rev.reviewer_id <> v_user_id then
        raise exception 'FORBIDDEN: You can only edit your own review';
    end if;

    if v_rev.status <> 'submitted' then
        raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be modified';
    end if;

    if now() > v_rev.edit_until then
        raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour editing grace period has expired';
    end if;

    update public.reviews
    set overall_rating = p_overall,
        quality_rating = p_quality,
        communication_rating = p_communication,
        timeliness_rating = p_timeliness,
        would_trade_again = p_would_trade_again,
        body = nullif(trim(p_body), ''),
        updated_at = now()
    where id = p_review_id;

    return jsonb_build_object('success', true, 'review_id', p_review_id);
end;
$$;

-- 3. Withdraw Review (During 1-Hour Grace Period, Prior to Reveal)
create or replace function public.withdraw_review(
    p_review_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then
        raise exception 'NOT_FOUND: Review not found';
    end if;

    if v_rev.reviewer_id <> v_user_id then
        raise exception 'FORBIDDEN: You can only withdraw your own review';
    end if;

    if v_rev.status <> 'submitted' then
        raise exception 'ALREADY_REVEALED: This review has already been revealed and cannot be withdrawn';
    end if;

    if now() > v_rev.edit_until then
        raise exception 'EDIT_WINDOW_EXPIRED: The 1-hour withdrawal grace period has expired';
    end if;

    delete from public.reviews where id = p_review_id;

    return jsonb_build_object('success', true, 'withdrawn_id', p_review_id);
end;
$$;

-- 4. Reply to Review (One public reply by reviewee, after reveal)
create or replace function public.reply_to_review(
    p_review_id uuid,
    p_body text,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record;
    v_clean_body text := trim(p_body);
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'reply_to_review';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    if length(v_clean_body) < 1 or length(v_clean_body) > 500 then
        raise exception 'INVALID_LENGTH: Reply must be between 1 and 500 characters';
    end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then
        raise exception 'NOT_FOUND: Review not found';
    end if;

    if v_rev.reviewee_id <> v_user_id then
        raise exception 'FORBIDDEN: Only the reviewee can post a public reply to this review';
    end if;

    if v_rev.status <> 'revealed' then
        raise exception 'NOT_REVEALED: Replies can only be posted after the review is publicly revealed';
    end if;

    if exists (select 1 from public.review_replies where review_id = p_review_id) then
        raise exception 'ALREADY_REPLIED: You have already posted a reply to this review';
    end if;

    insert into public.review_replies (review_id, author_id, body)
    values (p_review_id, v_user_id, v_clean_body);

    -- Notification to the reviewer
    insert into public.notifications (user_id, agreement_id, event_type, title, body, action_url)
    values (
        v_rev.reviewer_id,
        v_rev.agreement_id,
        'review.reply',
        'Partner Replied to Your Review',
        'Your trade partner posted a response to your review.',
        '/dashboard/reviews'
    );

    v_res := jsonb_build_object('success', true, 'review_id', p_review_id);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'reply_to_review', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

-- 5. Report Review (By reviewee for moderation)
create or replace function public.report_review(
    p_review_id uuid,
    p_reason public.report_reason,
    p_detail text default null,
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_rev record;
    v_rep_id uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'report_review';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_rev from public.reviews where id = p_review_id;
    if v_rev.id is null then
        raise exception 'NOT_FOUND: Review not found';
    end if;

    if v_rev.reviewee_id <> v_user_id then
        raise exception 'FORBIDDEN: Only the reviewee can report a review for moderation';
    end if;

    if exists (select 1 from public.review_reports where review_id = p_review_id and reporter_id = v_user_id) then
        raise exception 'ALREADY_REPORTED: You have already reported this review';
    end if;

    insert into public.review_reports (review_id, reporter_id, reason, detail)
    values (p_review_id, v_user_id, p_reason, nullif(trim(p_detail), ''))
    returning id into v_rep_id;

    v_res := jsonb_build_object('success', true, 'report_id', v_rep_id);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'report_review', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

-- 6. Moderate Review (Admin-only RPC)
create or replace function public.moderate_review(
    p_review_id uuid,
    p_action text, -- 'hide' or 'restore'
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_admin_id uuid := (select auth.uid());
    v_rev record;
    v_target_status public.review_status;
begin
    if v_admin_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    -- Strict admin role verification
    if not exists (select 1 from public.user_roles where user_id = v_admin_id and role = 'admin') then
        raise exception 'FORBIDDEN: Admin privileges required for moderation';
    end if;

    select * into v_rev from public.reviews where id = p_review_id for update;
    if v_rev.id is null then
        raise exception 'NOT_FOUND: Review not found';
    end if;

    if p_action = 'hide' then
        v_target_status := 'hidden_by_moderation';
    elsif p_action = 'restore' then
        v_target_status := 'revealed';
    else
        raise exception 'INVALID_ACTION: Moderation action must be "hide" or "restore"';
    end if;

    -- Update review status
    update public.reviews
    set status = v_target_status,
        updated_at = now()
    where id = p_review_id;

    -- Log moderation audit
    insert into public.review_moderation_log (review_id, admin_id, action, reason)
    values (p_review_id, v_admin_id, p_action, p_reason);

    -- Emit domain event
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values ('review', p_review_id, 'review.moderated', v_admin_id, jsonb_build_object('review_id', p_review_id, 'action', p_action, 'reviewee_id', v_rev.reviewee_id));

    -- Recompute reputation for the reviewee
    perform public.recompute_provider_reputation(v_rev.reviewee_id);

    return jsonb_build_object('success', true, 'review_id', p_review_id, 'status', v_target_status);
end;
$$;

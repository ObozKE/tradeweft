-- Fix for propose_agreement and counter_agreement RPC functions
-- Coalesces both 'package_version_id' (snake_case) and 'packageVersionId' (camelCase)
-- so line insertion is completely resilient regardless of client JSON formatting.

-- 1. Propose Agreement
create or replace function public.propose_agreement(
    p_recipient_id uuid,
    p_proposer_lines jsonb,
    p_recipient_lines jsonb,
    p_note text default null,
    p_consented_channels text[] default array['email'::text],
    p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_proposer_profile record;
    v_recipient_profile record;
    v_open_count integer;
    v_agr_id uuid;
    v_rev_id uuid;
    v_line record;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if v_user_id = p_recipient_id then
        raise exception 'SELF_PROPOSAL_FORBIDDEN: You cannot propose a trade to yourself';
    end if;

    -- Idempotency check
    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'propose_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Verify profiles & onboarding
    select * into v_proposer_profile from public.profiles where id = v_user_id;
    if v_proposer_profile.id is null or v_proposer_profile.onboarding_completed_at is null then
        raise exception 'ONBOARDING_REQUIRED: Complete your profile before proposing trades';
    end if;

    select * into v_recipient_profile from public.profiles where id = p_recipient_id;
    if v_recipient_profile.id is null or v_recipient_profile.onboarding_completed_at is null then
        raise exception 'RECIPIENT_NOT_ONBOARDED: Recipient has not completed profile onboarding';
    end if;

    -- Same country verification
    if v_proposer_profile.country_code <> v_recipient_profile.country_code then
        raise exception 'COUNTRY_MISMATCH: Barter trades are currently restricted to parties in the same country';
    end if;

    -- Outgoing open proposals cap (max 20)
    select count(*) into v_open_count
    from public.agreements
    where proposer_id = v_user_id and status = 'proposed';

    if v_open_count >= 20 then
        raise exception 'LIMIT_EXCEEDED: You have reached the maximum of 20 open proposals. Await responses or withdraw existing proposals.';
    end if;

    -- Validate line counts (1 to 3 lines per side)
    if jsonb_array_length(p_proposer_lines) < 1 or jsonb_array_length(p_proposer_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Proposer side must specify between 1 and 3 package offerings';
    end if;
    if jsonb_array_length(p_recipient_lines) < 1 or jsonb_array_length(p_recipient_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Recipient side must specify between 1 and 3 package requests';
    end if;

    -- Insert agreement
    insert into public.agreements (
        country_code,
        proposer_id,
        recipient_id,
        status,
        current_revision_no,
        turn_user_id,
        expires_at
    ) values (
        v_proposer_profile.country_code,
        v_user_id,
        p_recipient_id,
        'proposed',
        1,
        p_recipient_id, -- Turn is with recipient to review, counter, or accept
        now() + interval '7 days'
    ) returning id into v_agr_id;

    -- Insert Revision 1
    insert into public.agreement_revisions (
        agreement_id,
        revision_no,
        authored_by,
        note
    ) values (
        v_agr_id,
        1,
        v_user_id,
        nullif(trim(p_note), '')
    ) returning id into v_rev_id;

    -- Insert Proposer Lines (accepts both package_version_id and packageVersionId)
    for v_line in select * from jsonb_to_recordset(p_proposer_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'proposer_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Insert Recipient Lines (accepts both package_version_id and packageVersionId)
    for v_line in select * from jsonb_to_recordset(p_recipient_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'recipient_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Insert Proposer Contact Share
    if p_consented_channels is not null and array_length(p_consented_channels, 1) > 0 then
        insert into public.agreement_contact_shares (agreement_id, user_id, channels)
        values (v_agr_id, v_user_id, p_consented_channels)
        on conflict (agreement_id, user_id) do update set channels = p_consented_channels;
    end if;

    -- Audit & Domain Events
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        v_agr_id, v_user_id, 'proposal_created', null, 'proposed', 1,
        jsonb_build_object('recipient_id', p_recipient_id)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', v_agr_id, 'agreement.proposed', v_user_id,
        jsonb_build_object('recipient_id', p_recipient_id, 'revision_no', 1)
    );

    -- Notification for recipient
    insert into public.notifications (
        user_id, agreement_id, event_type, title, body, action_url
    ) values (
        p_recipient_id,
        v_agr_id,
        'trade_proposal_received',
        'New Trade Proposal Received',
        coalesce(v_proposer_profile.display_name, 'A provider') || ' proposed a barter trade with you.',
        '/dashboard/trades/' || v_agr_id
    );

    v_res := jsonb_build_object(
        'agreement_id', v_agr_id,
        'revision_id', v_rev_id,
        'revision_no', 1,
        'status', 'proposed'
    );

    -- Cache idempotency response
    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'propose_agreement', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

-- 2. Counter Agreement
create or replace function public.counter_agreement(
    p_agreement_id uuid,
    p_expected_revision_no integer,
    p_proposer_lines jsonb,
    p_recipient_lines jsonb,
    p_note text default null,
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
    v_new_rev_no integer;
    v_rev_id uuid;
    v_line record;
    v_other_party uuid;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'counter_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Lock agreement
    select * into v_agr
    from public.agreements
    where id = p_agreement_id
    for update;

    if v_agr.id is null then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Must be one of the parties
    if v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Turn validation
    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to counter this proposal';
    end if;

    -- Status & Expiry check
    if v_agr.status <> 'proposed' or now() > v_agr.expires_at then
        update public.agreements set status = 'expired', updated_at = now() where id = p_agreement_id;
        raise exception 'EXPIRED: This trade proposal has expired and cannot be countered';
    end if;

    -- Revision concurrency check
    if v_agr.current_revision_no <> p_expected_revision_no then
        raise exception 'STALE_REVISION: The proposal terms have changed. Please review the latest revision before countering.';
    end if;

    -- Validate lines
    if jsonb_array_length(p_proposer_lines) < 1 or jsonb_array_length(p_proposer_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Proposer side must specify between 1 and 3 package offerings';
    end if;
    if jsonb_array_length(p_recipient_lines) < 1 or jsonb_array_length(p_recipient_lines) > 3 then
        raise exception 'INVALID_LINE_COUNT: Recipient side must specify between 1 and 3 package requests';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;
    v_new_rev_no := v_agr.current_revision_no + 1;

    -- Insert new revision
    insert into public.agreement_revisions (
        agreement_id, revision_no, authored_by, note
    ) values (
        p_agreement_id, v_new_rev_no, v_user_id, nullif(trim(p_note), '')
    ) returning id into v_rev_id;

    -- Insert lines (accepts both package_version_id and packageVersionId)
    for v_line in select * from jsonb_to_recordset(p_proposer_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'proposer_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    for v_line in select * from jsonb_to_recordset(p_recipient_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'recipient_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Update agreement turn and reset 7-day expiry
    update public.agreements
    set current_revision_no = v_new_rev_no,
        turn_user_id = v_other_party,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = p_agreement_id;

    -- Events & Notifications
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        p_agreement_id, v_user_id, 'counter_created', 'proposed', 'proposed', v_new_rev_no,
        jsonb_build_object('turn_user_id', v_other_party)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.countered', v_user_id,
        jsonb_build_object('turn_user_id', v_other_party, 'revision_no', v_new_rev_no)
    );

    insert into public.notifications (
        user_id, agreement_id, event_type, title, body, action_url
    ) values (
        v_other_party,
        p_agreement_id,
        'trade_counter_received',
        'Trade Terms Countered',
        'A new revision (Revision ' || v_new_rev_no || ') has been proposed for your trade.',
        '/dashboard/trades/' || p_agreement_id
    );

    v_res := jsonb_build_object(
        'agreement_id', p_agreement_id,
        'revision_id', v_rev_id,
        'revision_no', v_new_rev_no,
        'turn_user_id', v_other_party
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'counter_agreement', v_res)
        on conflict (key, user_id) do nothing;
    end if;

    return v_res;
end;
$$;

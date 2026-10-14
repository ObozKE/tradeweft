-- Migration 20261013000003: Phase 3 Barter Agreements - Security Definer RPC Functions
-- Enforces atomic state transitions, tamper-evident terms hashing, and zero IDOR.

-- 1. Helper: Lazy Expiry Checker
create or replace function public.internal_lazy_check_agreement_expiry(
    p_agr_id uuid
)
returns public.agreement_status
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_status public.agreement_status;
    v_expires_at timestamptz;
begin
    select status, expires_at into v_status, v_expires_at
    from public.agreements
    where id = p_agr_id
    for update;

    if v_status = 'proposed' and now() > v_expires_at then
        update public.agreements
        set status = 'expired', updated_at = now()
        where id = p_agr_id;

        insert into public.agreement_events (agreement_id, event_type, from_status, to_status)
        values (p_agr_id, 'agreement_expired', 'proposed', 'expired');

        insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        values ('agreement', p_agr_id, 'agreement.expired', jsonb_build_object('reason', 'lazy_expiry'));

        return 'expired';
    end if;

    return v_status;
end;
$$;

-- 2. Propose Agreement
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

    -- Insert Proposer Lines
    for v_line in select * from jsonb_to_recordset(p_proposer_lines) as x(package_version_id uuid, "packageVersionId" uuid, quantity int) loop
        insert into public.agreement_lines (revision_id, side, package_version_id, quantity)
        values (v_rev_id, 'proposer_gives', coalesce(v_line.package_version_id, v_line."packageVersionId"), v_line.quantity);
    end loop;

    -- Insert Recipient Lines
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

    -- In-app notification for recipient
    insert into public.notifications (user_id, type, payload)
    values (
        p_recipient_id,
        'trade.proposed',
        jsonb_build_object('agreement_id', v_agr_id, 'proposer_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', v_agr_id,
        'revision_no', 1,
        'status', 'proposed'
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'propose_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 3. Counter Agreement
create or replace function public.counter_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
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
    v_other_party uuid;
    v_new_rev_no integer;
    v_rev_id uuid;
    v_line record;
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
    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Party check
    if v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Turn check
    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to counter this proposal';
    end if;

    -- Expiry check
    if v_agr.status <> 'proposed' or now() > v_agr.expires_at then
        update public.agreements set status = 'expired', updated_at = now() where id = p_agreement_id;
        raise exception 'EXPIRED: Proposal has expired';
    end if;

    -- Stale revision check
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

    -- Insert lines
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
        jsonb_build_object('revision_no', v_new_rev_no, 'counterparty_id', v_other_party)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.countered',
        jsonb_build_object('agreement_id', p_agreement_id, 'revision_no', v_new_rev_no, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'revision_no', v_new_rev_no,
        'status', 'proposed'
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'counter_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 4. Accept Agreement
create or replace function public.accept_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
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
    v_agr record;
    v_rev record;
    v_other_party uuid;
    v_lines_json jsonb;
    v_terms_hash text;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'accept_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    -- Lock agreement
    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Party check
    if v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Turn check
    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to accept this proposal';
    end if;

    -- Expiry check
    if v_agr.status <> 'proposed' or now() > v_agr.expires_at then
        update public.agreements set status = 'expired', updated_at = now() where id = p_agreement_id;
        raise exception 'EXPIRED: Proposal has expired';
    end if;

    -- Stale revision check
    if v_agr.current_revision_no <> p_expected_revision_no then
        raise exception 'STALE_REVISION: The proposal terms have changed. Please review the latest revision before accepting.';
    end if;

    -- Fetch current revision
    select * into v_rev
    from public.agreement_revisions
    where agreement_id = p_agreement_id and revision_no = v_agr.current_revision_no;

    -- Collect canonical serialized lines for tamper-evidence hash
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'side', l.side,
                'package_version_id', l.package_version_id,
                'quantity', l.quantity
            ) order by l.side, l.package_version_id
        ), '[]'::jsonb
    ) into v_lines_json
    from public.agreement_lines l
    where l.revision_id = v_rev.id;

    -- Compute SHA-256 terms_hash
    v_terms_hash := encode(
        digest(
            v_agr.id::text || '|' ||
            v_rev.id::text || '|' ||
            v_agr.proposer_id::text || '|' ||
            v_agr.recipient_id::text || '|' ||
            v_lines_json::text || '|' ||
            v_agr.trade_terms_version,
            'sha256'
        ), 'hex'
    );

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    -- Update agreement to active
    update public.agreements
    set status = 'active',
        accepted_revision_id = v_rev.id,
        terms_hash = v_terms_hash,
        accepted_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    -- Save acceptor contact share
    if p_consented_channels is not null and array_length(p_consented_channels, 1) > 0 then
        insert into public.agreement_contact_shares (agreement_id, user_id, channels)
        values (p_agreement_id, v_user_id, p_consented_channels)
        on conflict (agreement_id, user_id) do update set channels = p_consented_channels;
    end if;

    -- Create fulfilment milestones for both sides
    insert into public.agreement_fulfilment (
        agreement_id, side, giving_user_id, receiving_user_id
    ) values
        (p_agreement_id, 'proposer_gives', v_agr.proposer_id, v_agr.recipient_id),
        (p_agreement_id, 'recipient_gives', v_agr.recipient_id, v_agr.proposer_id)
    on conflict (agreement_id, side) do nothing;

    -- Events & Notifications
    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no, payload
    ) values (
        p_agreement_id, v_user_id, 'agreement_accepted', 'proposed', 'active', v_agr.current_revision_no,
        jsonb_build_object('terms_hash', v_terms_hash)
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.accepted', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no, 'terms_hash', v_terms_hash)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.accepted',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'status', 'active',
        'terms_hash', v_terms_hash
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'accept_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 5. Decline Agreement
create or replace function public.decline_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'decline_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_user_id <> v_agr.turn_user_id then
        raise exception 'NOT_YOUR_TURN: It is not your turn to decline this proposal';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Only open proposals can be declined';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements set status = 'declined', updated_at = now() where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no
    ) values (
        p_agreement_id, v_user_id, 'proposal_declined', 'proposed', 'declined', v_agr.current_revision_no
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.declined', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.declined',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'declined');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'decline_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 6. Withdraw Agreement
create or replace function public.withdraw_agreement(
    p_agreement_id uuid,
    p_expected_revision_no int,
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'withdraw_agreement';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Only the non-turn party can withdraw (the party waiting on the other)
    if v_user_id = v_agr.turn_user_id then
        raise exception 'CANNOT_WITHDRAW_ON_YOUR_TURN: You currently hold the turn to accept, counter, or decline';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Only open proposals can be withdrawn';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements set status = 'withdrawn', updated_at = now() where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, revision_no
    ) values (
        p_agreement_id, v_user_id, 'proposal_withdrawn', 'proposed', 'withdrawn', v_agr.current_revision_no
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.withdrawn', v_user_id,
        jsonb_build_object('revision_no', v_agr.current_revision_no)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.withdrawn',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'withdrawn');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'withdraw_agreement', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 7. Mark Delivered
create or replace function public.mark_delivered(
    p_agreement_id uuid,
    p_side public.agreement_side,
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
    v_fulfilment record;
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'mark_delivered';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Deliverables can only be marked on active agreements';
    end if;

    select * into v_fulfilment
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and side = p_side
    for update;

    if v_fulfilment.giving_user_id <> v_user_id then
        raise exception 'FORBIDDEN: You can only mark delivery for your own services';
    end if;

    if v_fulfilment.delivered_marked_at is not null then
        raise exception 'ALREADY_MARKED: Delivery has already been marked for this side';
    end if;

    update public.agreement_fulfilment
    set delivered_marked_at = now(),
        delivered_marked_by = v_user_id
    where id = v_fulfilment.id;

    v_other_party := v_fulfilment.receiving_user_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'delivery_marked', 'active', 'active',
        jsonb_build_object('side', p_side)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.delivered',
        jsonb_build_object('agreement_id', p_agreement_id, 'side', p_side, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'side', p_side);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'mark_delivered', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 8. Confirm Receipt & Auto-Complete
create or replace function public.confirm_receipt(
    p_agreement_id uuid,
    p_side public.agreement_side,
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
    v_fulfilment record;
    v_unconfirmed_count integer;
    v_is_completed boolean := false;
    v_cached_response jsonb;
    v_res jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    if p_idempotency_key is not null then
        select response into v_cached_response
        from public.idempotency_keys
        where key = p_idempotency_key and user_id = v_user_id and action = 'confirm_receipt';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Receipt can only be confirmed on active agreements';
    end if;

    select * into v_fulfilment
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and side = p_side
    for update;

    if v_fulfilment.receiving_user_id <> v_user_id then
        raise exception 'FORBIDDEN: Only the receiving party can confirm receipt of this service';
    end if;

    if v_fulfilment.delivered_marked_at is null then
        raise exception 'NOT_YET_DELIVERED: Delivery has not yet been marked by the providing party';
    end if;

    if v_fulfilment.receipt_confirmed_at is not null then
        raise exception 'ALREADY_CONFIRMED: Receipt has already been confirmed';
    end if;

    update public.agreement_fulfilment
    set receipt_confirmed_at = now(),
        receipt_confirmed_by = v_user_id
    where id = v_fulfilment.id;

    -- Check if both sides are now confirmed
    select count(*) into v_unconfirmed_count
    from public.agreement_fulfilment
    where agreement_id = p_agreement_id and receipt_confirmed_at is null;

    if v_unconfirmed_count = 0 then
        v_is_completed := true;
        update public.agreements
        set status = 'completed', completed_at = now(), updated_at = now()
        where id = p_agreement_id;

        insert into public.agreement_events (
            agreement_id, actor_id, event_type, from_status, to_status
        ) values (
            p_agreement_id, v_user_id, 'agreement_completed', 'active', 'completed'
        );

        insert into public.domain_events (
            aggregate_type, aggregate_id, event_type, actor_id, payload
        ) values (
            'agreement', p_agreement_id, 'agreement.completed', v_user_id,
            jsonb_build_object('terms_hash', v_agr.terms_hash)
        );

        insert into public.notifications (user_id, type, payload)
        values
            (v_agr.proposer_id, 'trade.completed', jsonb_build_object('agreement_id', p_agreement_id)),
            (v_agr.recipient_id, 'trade.completed', jsonb_build_object('agreement_id', p_agreement_id));
    else
        insert into public.agreement_events (
            agreement_id, actor_id, event_type, from_status, to_status, payload
        ) values (
            p_agreement_id, v_user_id, 'receipt_confirmed', 'active', 'active',
            jsonb_build_object('side', p_side)
        );

        insert into public.notifications (user_id, type, payload)
        values (
            v_fulfilment.giving_user_id,
            'trade.receipt_confirmed',
            jsonb_build_object('agreement_id', p_agreement_id, 'side', p_side, 'actor_id', v_user_id)
        );
    end if;

    v_res := jsonb_build_object(
        'success', true,
        'agreement_id', p_agreement_id,
        'side', p_side,
        'is_completed', v_is_completed
    );

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'confirm_receipt', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 9. Cancellation: Request & Accept
create or replace function public.request_cancellation(
    p_agreement_id uuid,
    p_reason text,
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'request_cancellation';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Cancellation can only be requested on active agreements';
    end if;

    if v_agr.cancellation_requested_by is not null then
        raise exception 'ALREADY_REQUESTED: A cancellation request is already pending for this trade';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements
    set cancellation_requested_by = v_user_id,
        cancellation_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'cancellation_requested', 'active', 'active',
        jsonb_build_object('reason', p_reason)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.cancellation_requested',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'cancellation_requested', true);

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'request_cancellation', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

create or replace function public.accept_cancellation(
    p_agreement_id uuid,
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'accept_cancellation';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Only active agreements can be cancelled';
    end if;

    if v_agr.cancellation_requested_by is null then
        raise exception 'NO_CANCELLATION_REQUEST: No cancellation request is pending for this agreement';
    end if;

    if v_agr.cancellation_requested_by = v_user_id then
        raise exception 'CANNOT_ACCEPT_OWN_REQUEST: You cannot accept your own cancellation request';
    end if;

    v_other_party := v_agr.cancellation_requested_by;

    update public.agreements
    set status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status
    ) values (
        p_agreement_id, v_user_id, 'agreement_cancelled', 'active', 'cancelled'
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.cancelled', v_user_id,
        jsonb_build_object('cancellation_reason', v_agr.cancellation_reason)
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.cancelled',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'cancelled');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'accept_cancellation', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 10. Open Dispute
create or replace function public.open_dispute(
    p_agreement_id uuid,
    p_reason text,
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
        where key = p_idempotency_key and user_id = v_user_id and action = 'open_dispute';

        if v_cached_response is not null then
            return v_cached_response;
        end if;
    end if;

    if p_reason is null or length(trim(p_reason)) < 5 or length(trim(p_reason)) > 1000 then
        raise exception 'INVALID_REASON: Dispute reason must be between 5 and 1000 characters';
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id for update;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    if v_agr.status <> 'active' then
        raise exception 'INVALID_STATE: Disputes can only be opened on active agreements';
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    update public.agreements
    set status = 'disputed',
        disputed_by = v_user_id,
        dispute_reason = trim(p_reason),
        disputed_at = now(),
        updated_at = now()
    where id = p_agreement_id;

    insert into public.agreement_events (
        agreement_id, actor_id, event_type, from_status, to_status, payload
    ) values (
        p_agreement_id, v_user_id, 'dispute_opened', 'active', 'disputed',
        jsonb_build_object('reason', trim(p_reason))
    );

    insert into public.domain_events (
        aggregate_type, aggregate_id, event_type, actor_id, payload
    ) values (
        'agreement', p_agreement_id, 'agreement.disputed', v_user_id,
        jsonb_build_object('dispute_reason', trim(p_reason))
    );

    insert into public.notifications (user_id, type, payload)
    values (
        v_other_party,
        'trade.disputed',
        jsonb_build_object('agreement_id', p_agreement_id, 'actor_id', v_user_id)
    );

    v_res := jsonb_build_object('success', true, 'agreement_id', p_agreement_id, 'status', 'disputed');

    if p_idempotency_key is not null then
        insert into public.idempotency_keys (key, user_id, action, response)
        values (p_idempotency_key, v_user_id, 'open_dispute', v_res)
        on conflict (key) do nothing;
    end if;

    return v_res;
end;
$$;

-- 11. Get Counterparty Contact (Privacy-Preserving Contact Reveal)
create or replace function public.get_counterparty_contact(
    p_agreement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_agr record;
    v_other_party uuid;
    v_shares record;
    v_contact record;
    v_auth_user record;
    v_res jsonb := jsonb_build_object('revealed', false);
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_agr from public.agreements where id = p_agreement_id;
    if v_agr.id is null or (v_user_id <> v_agr.proposer_id and v_user_id <> v_agr.recipient_id) then
        raise exception 'NOT_FOUND: Agreement not found';
    end if;

    -- Contact reveal is strictly permitted ONLY while active, completed, or disputed
    if v_agr.status not in ('active', 'completed', 'disputed') then
        return jsonb_build_object('revealed', false, 'reason', 'TRADE_NOT_ACTIVE');
    end if;

    v_other_party := case when v_user_id = v_agr.proposer_id then v_agr.recipient_id else v_agr.proposer_id end;

    -- Fetch counterparty's consented channels
    select * into v_shares
    from public.agreement_contact_shares
    where agreement_id = p_agreement_id and user_id = v_other_party;

    if v_shares.id is null then
        return jsonb_build_object('revealed', false, 'reason', 'NO_CONSENT_RECORDED');
    end if;

    -- Fetch profile contacts
    select * into v_contact from public.profile_contacts where user_id = v_other_party;

    -- Fetch email from auth.users (if consented)
    select email into v_auth_user from auth.users where id = v_other_party;

    v_res := jsonb_build_object(
        'revealed', true,
        'user_id', v_other_party,
        'channels', v_shares.channels,
        'phone', case when 'phone' = any(v_shares.channels) then v_contact.phone_e164 else null end,
        'whatsapp', case when 'whatsapp' = any(v_shares.channels) and coalesce(v_contact.whatsapp, false) then v_contact.phone_e164 else null end,
        'email', case when 'email' = any(v_shares.channels) then v_auth_user.email else null end
    );

    return v_res;
end;
$$;

-- 12. Mark Notifications Read
create or replace function public.mark_notifications_read(
    p_notification_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    update public.notifications
    set read_at = now()
    where id = any(p_notification_ids) and user_id = v_user_id;
end;
$$;

-- 13. Mutual Matchmaking Algorithm
create or replace function public.suggest_mutual_matches(
    p_limit int default 20,
    p_cursor_score int default null,
    p_cursor_user_id uuid default null
)
returns table (
    counterparty_id uuid,
    display_name text,
    business_name text,
    avatar_url text,
    city_name text,
    area_name text,
    match_strength int,
    my_matching_packages jsonb,
    their_matching_packages jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_country text;
    v_max_limit int := least(coalesce(p_limit, 20), 50);
begin
    if v_user_id is null then
        return;
    end if;

    select country_code into v_country from public.profiles where id = v_user_id;
    if v_country is null then
        return;
    end if;

    return query
    with my_packages as (
        select sp.id as package_id, sp.category_id
        from public.service_packages sp
        where sp.provider_id = v_user_id and sp.status = 'published' and sp.country_code = v_country
    ),
    my_seeking as (
        select distinct spsc.category_id
        from my_packages mp
        join public.service_package_seeking_categories spsc on spsc.package_id = mp.package_id
    ),
    candidate_matches as (
        select
            their_pkg.provider_id as other_id,
            count(distinct their_pkg.category_id) as overlap_count,
            jsonb_agg(
                distinct jsonb_build_object('id', my_pkg.package_id, 'category_id', my_pkg.category_id)
            ) as my_pkgs,
            jsonb_agg(
                distinct jsonb_build_object('id', their_pkg.id, 'title', their_pkg.title, 'category_id', their_pkg.category_id)
            ) as their_pkgs
        from public.service_packages their_pkg
        join public.service_package_seeking_categories their_seeking
            on their_seeking.package_id = their_pkg.id
        join my_packages my_pkg
            on my_pkg.category_id = their_seeking.category_id
        where their_pkg.provider_id <> v_user_id
          and their_pkg.status = 'published'
          and their_pkg.country_code = v_country
          and their_pkg.category_id in (select category_id from my_seeking)
          -- Exclude if open negotiation already exists
          and not exists (
              select 1 from public.agreements a
              where a.status = 'proposed'
                and (
                    (a.proposer_id = v_user_id and a.recipient_id = their_pkg.provider_id)
                    or (a.proposer_id = their_pkg.provider_id and a.recipient_id = v_user_id)
                )
          )
        group by their_pkg.provider_id
    )
    select
        cm.other_id as counterparty_id,
        prov.display_name,
        prov.business_name,
        prov.avatar_url,
        city.name as city_name,
        area.name as area_name,
        cm.overlap_count::int as match_strength,
        cm.my_pkgs as my_matching_packages,
        cm.their_pkgs as their_matching_packages
    from candidate_matches cm
    join public.public_provider_profiles prov on prov.id = cm.other_id
    left join public.profiles p on p.id = cm.other_id
    left join public.locations city on city.id = p.city_id
    left join public.locations area on area.id = p.area_id
    where (
        p_cursor_score is null
        or (cm.overlap_count, cm.other_id) < (p_cursor_score, p_cursor_user_id)
    )
    order by cm.overlap_count desc, cm.other_id desc
    limit v_max_limit;
end;
$$;

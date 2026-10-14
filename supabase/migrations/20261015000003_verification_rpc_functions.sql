-- Migration: 20261015000003_verification_rpc_functions.sql
-- Phase 5: Verification RPC Functions & Auto-Pause Logic

-- 1. Helper: Check if caller has verifier or admin role
create or replace function public.is_verifier_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role::text in ('verifier', 'admin')
    );
$$;

-- 2. Create Portfolio Link
create or replace function public.create_portfolio_link(
    p_provider_key text,
    p_url text,
    p_canonical_url text,
    p_handle text default null,
    p_method public.verification_method default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid;
    v_link_id uuid;
    v_challenge_code text;
    v_initial_status public.verification_status;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'UNAUTHORIZED: Authentication required.';
    end if;

    -- Generate a cryptographically secure random challenge code (e.g. tw-verify-xxxxxxxx)
    v_challenge_code := 'tw-verify-' || lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

    if p_method = 'oauth' then
        v_initial_status := 'awaiting_proof';
    elsif p_method = 'domain' then
        v_initial_status := 'awaiting_proof';
    else
        v_initial_status := 'submitted';
    end if;

    insert into public.portfolio_links (
        user_id,
        provider_key,
        url,
        canonical_url,
        handle,
        method,
        status,
        challenge_code,
        challenge_expires_at
    )
    values (
        v_user_id,
        p_provider_key,
        p_url,
        p_canonical_url,
        p_handle,
        p_method,
        v_initial_status,
        v_challenge_code,
        now() + interval '7 days'
    )
    returning id into v_link_id;

    -- Emit domain event
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
        'verification.link.submitted',
        'portfolio_link',
        v_link_id,
        jsonb_build_object(
            'link_id', v_link_id,
            'user_id', v_user_id,
            'provider_key', p_provider_key,
            'method', p_method,
            'status', v_initial_status
        )
    );

    return jsonb_build_object(
        'link_id', v_link_id,
        'challenge_code', v_challenge_code,
        'challenge_expires_at', (now() + interval '7 days'),
        'status', v_initial_status
    );
end;
$$;

-- 3. Submit Manual Evidence (Attach screenshot and queue for review)
create or replace function public.submit_manual_evidence(
    p_link_id uuid,
    p_evidence_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid;
    v_link record;
    v_asset record;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'UNAUTHORIZED: Authentication required.';
    end if;

    -- Verify link ownership
    select * into v_link
    from public.portfolio_links
    where id = p_link_id and user_id = v_user_id;

    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found or unauthorized.';
    end if;

    if v_link.status not in ('submitted', 'rejected') then
        raise exception 'INVALID_STATE: Evidence can only be submitted for links awaiting proof or resubmission.';
    end if;

    -- Verify media asset exists, is owned by user, and is evidence
    select * into v_asset
    from public.media_assets
    where id = p_evidence_asset_id and owner_id = v_user_id;

    if not found then
        raise exception 'ASSET_NOT_FOUND: Evidence media asset not found or unauthorized.';
    end if;

    if v_asset.kind != 'evidence' then
        raise exception 'INVALID_ASSET_KIND: Uploaded file is not marked as verification evidence.';
    end if;

    update public.portfolio_links
    set evidence_asset_id = p_evidence_asset_id,
        status = 'pending_review',
        updated_at = now()
    where id = p_link_id;

    -- Write audit log
    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, note)
    values (p_link_id, v_user_id, 'submit_evidence', v_link.status, 'pending_review', 'Evidence uploaded by provider');

    return jsonb_build_object('success', true, 'status', 'pending_review');
end;
$$;

-- 4. Verifier Action: Approve or Reject Link
create or replace function public.admin_review_link(
    p_link_id uuid,
    p_decision text, -- 'approve' | 'reject'
    p_reject_reason text default null,
    p_reject_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_admin_id uuid;
    v_link record;
    v_new_status public.verification_status;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link
    from public.portfolio_links
    where id = p_link_id;

    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    if p_decision = 'approve' then
        v_new_status := 'verified';

        -- Verify partial unique constraint before update
        if v_link.external_account_id is not null and exists (
            select 1 from public.portfolio_links
            where provider_key = v_link.provider_key
              and external_account_id = v_link.external_account_id
              and status = 'verified'
              and id != p_link_id
        ) then
            raise exception 'ACCOUNT_ALREADY_VERIFIED: This external account is already verified by another provider.';
        end if;

        update public.portfolio_links
        set status = 'verified',
            verified_at = now(),
            reviewed_by = v_admin_id,
            reject_reason = null,
            reject_note = null,
            updated_at = now()
        where id = p_link_id;

        -- Audit log
        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status)
        values (p_link_id, v_admin_id, 'approve', v_link.status, 'verified');

        -- Notification
        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.approved',
            'Portfolio Link Verified',
            'Your ' || v_link.provider_key || ' link has been approved and verified.',
            jsonb_build_object('link_id', p_link_id, 'provider_key', v_link.provider_key)
        );

        -- Domain event
        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.link.verified',
            'portfolio_link',
            p_link_id,
            jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'provider_key', v_link.provider_key)
        );

    elsif p_decision = 'reject' then
        v_new_status := 'rejected';

        update public.portfolio_links
        set status = 'rejected',
            reject_reason = p_reject_reason,
            reject_note = p_reject_note,
            reviewed_by = v_admin_id,
            updated_at = now()
        where id = p_link_id;

        -- Audit log
        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason, note)
        values (p_link_id, v_admin_id, 'reject', v_link.status, 'rejected', p_reject_reason, p_reject_note);

        -- Notification
        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.rejected',
            'Portfolio Verification Update',
            'Your ' || v_link.provider_key || ' verification could not be approved: ' || coalesce(p_reject_note, p_reject_reason, 'Verification criteria not met.'),
            jsonb_build_object('link_id', p_link_id, 'reason', p_reject_reason, 'note', p_reject_note)
        );

        -- Domain event
        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.link.rejected',
            'portfolio_link',
            p_link_id,
            jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'reason', p_reject_reason)
        );
    else
        raise exception 'INVALID_DECISION: Decision must be approve or reject.';
    end if;

    return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

-- 5. Verifier Action: Revoke Previously Verified Link
create or replace function public.admin_revoke_link(
    p_link_id uuid,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_admin_id uuid;
    v_link record;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link
    from public.portfolio_links
    where id = p_link_id;

    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    update public.portfolio_links
    set status = 'revoked',
        reject_reason = p_reason,
        reviewed_by = v_admin_id,
        updated_at = now()
    where id = p_link_id;

    -- Audit log
    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason)
    values (p_link_id, v_admin_id, 'revoke', v_link.status, 'revoked', p_reason);

    -- Notification
    insert into public.notifications (user_id, type, title, body, data)
    values (
        v_link.user_id,
        'verification.revoked',
        'Portfolio Link Revoked',
        'Your verified ' || v_link.provider_key || ' link was revoked: ' || p_reason,
        jsonb_build_object('link_id', p_link_id, 'reason', p_reason)
    );

    -- Domain event
    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
        'verification.link.revoked',
        'portfolio_link',
        p_link_id,
        jsonb_build_object('link_id', p_link_id, 'user_id', v_link.user_id, 'reason', p_reason)
    );

    return jsonb_build_object('success', true, 'status', 'revoked');
end;
$$;

-- 6. System Auto-Pause Procedure (Called when provider status drops below country gate)
create or replace function public.system_pause_packages_for_unverified(
    p_provider_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_country_code text;
    v_gate public.publish_gate_mode;
    v_current_status public.provider_verification_aggregate_status;
    v_paused_count integer := 0;
begin
    -- Get provider country
    select country_code into v_country_code
    from public.profiles
    where id = p_provider_id;

    -- Get country publish gate setting
    select publish_gate into v_gate
    from public.countries
    where code = v_country_code;

    v_gate := coalesce(v_gate, 'link_pending_or_verified');

    -- If gate is none, no action required
    if v_gate = 'none' then
        return 0;
    end if;

    -- Get current verification status
    select status into v_current_status
    from public.provider_verification
    where provider_id = p_provider_id;

    v_current_status := coalesce(v_current_status, 'none');

    -- Check if below gate:
    -- gate 'verified' requires status 'verified'
    -- gate 'link_pending_or_verified' requires status 'pending' or 'verified'
    if (v_gate = 'verified' and v_current_status != 'verified') or
       (v_gate = 'link_pending_or_verified' and v_current_status = 'none') then

        update public.service_packages
        set status = 'paused',
            updated_at = now()
        where provider_id = p_provider_id
          and status = 'published';

        get diagnostics v_paused_count = row_count;

        if v_paused_count > 0 then
            insert into public.notifications (user_id, type, title, body, data)
            values (
                p_provider_id,
                'verification.revoked',
                'Service Listings Paused',
                'Your active service packages have been paused because your portfolio verification status changed. Please verify your portfolio links to republish.',
                jsonb_build_object('paused_count', v_paused_count, 'gate', v_gate)
            );
        end if;
    end if;

    return v_paused_count;
end;
$$;

-- 7. Grant Verifier Role SQL Helper
create or replace function public.grant_verifier_role(p_user_email text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_uid uuid;
begin
    select id into v_uid
    from auth.users
    where email = p_user_email;

    if not found then
        raise exception 'USER_NOT_FOUND: User with specified email does not exist.';
    end if;

    insert into public.user_roles (user_id, role)
    values (v_uid, 'verifier')
    on conflict (user_id, role) do nothing;

    return true;
end;
$$;

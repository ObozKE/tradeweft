-- ============================================================================
-- Trade Weft — Phase 5: Verification & Proof of Work Consolidated Migration
-- Run this migration in your Supabase SQL Editor to apply Phase 5 schema.
-- ============================================================================

-- 1. Enums
do $$ begin
    if not exists (select 1 from pg_type where typname = 'verification_method') then
        create type public.verification_method as enum ('oauth', 'domain', 'manual');
    end if;
    if not exists (select 1 from pg_type where typname = 'verification_status') then
        create type public.verification_status as enum (
            'submitted',
            'awaiting_proof',
            'pending_review',
            'verified',
            'rejected',
            'revoked',
            'expired'
        );
    end if;
    if not exists (select 1 from pg_type where typname = 'provider_verification_aggregate_status') then
        create type public.provider_verification_aggregate_status as enum ('none', 'pending', 'verified');
    end if;
    if not exists (select 1 from pg_type where typname = 'media_kind') then
        create type public.media_kind as enum ('package_cover', 'package_gallery', 'evidence');
    end if;
    if not exists (select 1 from pg_type where typname = 'media_status') then
        create type public.media_status as enum ('pending', 'processing', 'ready', 'rejected', 'deleted');
    end if;
    if not exists (select 1 from pg_type where typname = 'publish_gate_mode') then
        create type public.publish_gate_mode as enum ('none', 'link_pending_or_verified', 'verified');
    end if;
end $$;

-- Add 'verifier' role to app_role enum if not already present
alter type public.app_role add value if not exists 'verifier';

-- Add publish_gate to countries table if not present
alter table public.countries
add column if not exists publish_gate public.publish_gate_mode not null default 'link_pending_or_verified';

-- 2. Media Assets Table
create table if not exists public.media_assets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    kind public.media_kind not null,
    bucket text not null,
    path text not null,
    status public.media_status not null default 'pending',
    mime text not null,
    bytes bigint not null,
    width integer,
    height integer,
    sha256 text,
    blur_data_url text,
    variants jsonb default '{}'::jsonb,
    rejection_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.media_assets is 'Verified media assets processed via the Sharp image pipeline.';

-- 3. Portfolio Links Table
create table if not exists public.portfolio_links (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider_key text not null,
    url text not null,
    canonical_url text not null,
    external_account_id text,
    handle text,
    method public.verification_method not null,
    status public.verification_status not null default 'submitted',
    challenge_code text,
    challenge_expires_at timestamptz,
    evidence_asset_id uuid references public.media_assets(id) on delete set null,
    reviewed_by uuid references public.profiles(id) on delete set null,
    reject_reason text,
    reject_note text check (reject_note is null or length(reject_note) <= 300),
    verified_at timestamptz,
    last_checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.portfolio_links is 'External portfolio and profile links with ownership verification.';

create unique index if not exists idx_portfolio_links_unique_verified
    on public.portfolio_links (provider_key, external_account_id)
    where status = 'verified' and external_account_id is not null;

create index if not exists idx_portfolio_links_user_status
    on public.portfolio_links (user_id, status);

create index if not exists idx_portfolio_links_pending_review
    on public.portfolio_links (created_at asc)
    where status = 'pending_review';

-- 4. OAuth States Table (single-use, 10-minute expiry)
create table if not exists public.oauth_states (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider_key text not null,
    state_hash text not null unique,
    code_verifier text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

comment on table public.oauth_states is 'Short-lived cryptographic state parameters for standalone OAuth verification.';

-- 5. Provider Verification Aggregate
create table if not exists public.provider_verification (
    provider_id uuid primary key references public.profiles(id) on delete cascade,
    status public.provider_verification_aggregate_status not null default 'none',
    verified_link_count integer not null default 0,
    verified_since timestamptz,
    updated_at timestamptz not null default now()
);

comment on table public.provider_verification is 'Materialized aggregate of verified portfolio links per provider.';

-- 6. Verification Audit Log (Append-only)
create table if not exists public.verification_audit_log (
    id uuid primary key default gen_random_uuid(),
    link_id uuid not null references public.portfolio_links(id) on delete cascade,
    actor_id uuid not null references public.profiles(id),
    action text not null,
    from_status public.verification_status,
    to_status public.verification_status not null,
    reason text,
    note text,
    created_at timestamptz not null default now()
);

comment on table public.verification_audit_log is 'Append-only audit trail for all verification approvals, rejections, and revocations.';

-- 7. Package Media Table
create table if not exists public.package_media (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    asset_id uuid not null references public.media_assets(id) on delete cascade,
    position smallint not null default 0,
    alt_text text not null check (length(alt_text) <= 150),
    is_cover boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (package_id, asset_id)
);

comment on table public.package_media is 'Mapping between published service packages and processed media assets.';

create unique index if not exists idx_package_media_unique_cover
    on public.package_media (package_id)
    where is_cover = true;

create index if not exists idx_package_media_order
    on public.package_media (package_id, position asc);

create index if not exists idx_media_assets_owner_status
    on public.media_assets (owner_id, status);

create index if not exists idx_media_assets_sweep
    on public.media_assets (created_at asc)
    where status in ('pending', 'processing');

-- 8. Provision Storage Buckets (Idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('quarantine', 'quarantine', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('public-media', 'public-media', true, 5242880, array['image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 9. Limits & Trigger Functions
create or replace function public.enforce_portfolio_link_limits()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_link_count integer;
begin
    select count(*) into v_link_count from public.portfolio_links where user_id = new.user_id;
    if v_link_count >= 10 then
        raise exception 'LINK_LIMIT_EXCEEDED: You cannot register more than 10 portfolio links.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_portfolio_link_limits on public.portfolio_links;
create trigger trg_enforce_portfolio_link_limits
    before insert on public.portfolio_links
    for each row execute function public.enforce_portfolio_link_limits();

create or replace function public.enforce_media_asset_limits()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_asset_count integer;
    v_total_bytes bigint;
begin
    select count(*), coalesce(sum(bytes), 0) into v_asset_count, v_total_bytes
    from public.media_assets where owner_id = new.owner_id and status != 'deleted';
    if v_asset_count >= 100 then
        raise exception 'MEDIA_LIMIT_EXCEEDED: You cannot exceed 100 media assets.';
    end if;
    if (v_total_bytes + new.bytes) > 209715200 then
        raise exception 'STORAGE_QUOTA_EXCEEDED: You cannot exceed 200 MB of total media storage.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_media_asset_limits on public.media_assets;
create trigger trg_enforce_media_asset_limits
    before insert on public.media_assets
    for each row execute function public.enforce_media_asset_limits();

create or replace function public.prevent_audit_log_modification()
returns trigger language plpgsql as $$
begin
    raise exception 'FORBIDDEN: verification_audit_log is append-only.';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.verification_audit_log;
create trigger trg_prevent_audit_log_modification
    before update or delete on public.verification_audit_log
    for each row execute function public.prevent_audit_log_modification();

-- 10. Provider Verification Recompute & Triggers
create or replace function public.recompute_provider_verification(p_provider_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_verified_count integer;
    v_pending_count integer;
    v_first_verified timestamptz;
    v_old_status public.provider_verification_aggregate_status := 'none';
    v_new_status public.provider_verification_aggregate_status := 'none';
begin
    select status into v_old_status from public.provider_verification where provider_id = p_provider_id;
    select count(*), min(verified_at) into v_verified_count, v_first_verified
    from public.portfolio_links where user_id = p_provider_id and status = 'verified';
    select count(*) into v_pending_count
    from public.portfolio_links where user_id = p_provider_id and status in ('submitted', 'awaiting_proof', 'pending_review');

    if v_verified_count > 0 then
        v_new_status := 'verified';
    elsif v_pending_count > 0 then
        v_new_status := 'pending';
    else
        v_new_status := 'none';
    end if;

    insert into public.provider_verification (provider_id, status, verified_link_count, verified_since, updated_at)
    values (
        p_provider_id,
        v_new_status,
        v_verified_count,
        case when v_verified_count > 0 then coalesce(v_first_verified, now()) else null end,
        now()
    )
    on conflict (provider_id) do update set
        status = excluded.status,
        verified_link_count = excluded.verified_link_count,
        verified_since = case
            when excluded.verified_link_count > 0 then coalesce(public.provider_verification.verified_since, excluded.verified_since)
            else null
        end,
        updated_at = now();

    if v_old_status = 'verified' and v_new_status != 'verified' then
        insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
        values (
            'verification.status.changed',
            'provider',
            p_provider_id,
            jsonb_build_object(
                'provider_id', p_provider_id,
                'from_status', v_old_status,
                'to_status', v_new_status,
                'verified_link_count', v_verified_count
            )
        );
    end if;

    return jsonb_build_object('provider_id', p_provider_id, 'status', v_new_status, 'verified_link_count', v_verified_count);
end;
$$;

create or replace function public.trg_sync_provider_verification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid;
begin
    v_user_id := coalesce(new.user_id, old.user_id);
    perform public.recompute_provider_verification(v_user_id);
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_provider_verification on public.portfolio_links;
create trigger trg_sync_provider_verification
    after insert or update of status, external_account_id or delete on public.portfolio_links
    for each row execute function public.trg_sync_provider_verification();

-- 11. Views
create or replace view public.public_verified_portfolio_links as
select
    id,
    user_id,
    provider_key,
    canonical_url,
    handle,
    verified_at
from public.portfolio_links
where status = 'verified';

create or replace view public.public_provider_profiles as
select 
    p.id,
    p.display_name,
    p.business_name,
    p.avatar_url,
    p.city_id,
    p.area_id,
    p.created_at as member_since,
    pr.score as reliability_score,
    coalesce(pr.tier, 'new'::public.reputation_tier) as reputation_tier,
    coalesce(pr.completed_trades, 0) as completed_trades_count,
    coalesce(pr.distinct_partners, 0) as distinct_partners_count,
    pr.avg_overall as avg_overall_rating,
    pr.would_trade_again_pct,
    pr.avg_quality as avg_quality_rating,
    pr.avg_communication as avg_communication_rating,
    pr.avg_timeliness as avg_timeliness_rating,
    (coalesce(pr.distinct_partners, 0) >= 3 and pr.score is not null) as is_score_visible,
    coalesce(pv.status, 'none'::public.provider_verification_aggregate_status) as verification_status,
    coalesce(pv.verified_link_count, 0) as verified_link_count,
    pv.verified_since
from public.profiles p
left join public.provider_reputation pr on pr.provider_id = p.id
left join public.provider_verification pv on pv.provider_id = p.id;

-- 12. RPC Functions
create or replace function public.is_verifier_or_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role::text in ('verifier', 'admin')
    );
$$;

create or replace function public.create_portfolio_link(
    p_provider_key text,
    p_url text,
    p_canonical_url text,
    p_handle text default null,
    p_method public.verification_method default 'manual'
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
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

    v_challenge_code := 'tw-verify-' || lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

    if p_method = 'oauth' or p_method = 'domain' then
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

    insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (
        'verification.link.submitted',
        'portfolio_link',
        v_link_id,
        jsonb_build_object('link_id', v_link_id, 'user_id', v_user_id, 'provider_key', p_provider_key, 'method', p_method, 'status', v_initial_status)
    );

    return jsonb_build_object(
        'link_id', v_link_id,
        'challenge_code', v_challenge_code,
        'challenge_expires_at', (now() + interval '7 days'),
        'status', v_initial_status
    );
end;
$$;

create or replace function public.submit_manual_evidence(
    p_link_id uuid,
    p_evidence_asset_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_user_id uuid;
    v_link record;
    v_asset record;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'UNAUTHORIZED: Authentication required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id and user_id = v_user_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found or unauthorized.';
    end if;

    if v_link.status not in ('submitted', 'rejected') then
        raise exception 'INVALID_STATE: Evidence can only be submitted for links awaiting proof or resubmission.';
    end if;

    select * into v_asset from public.media_assets where id = p_evidence_asset_id and owner_id = v_user_id;
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

    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, note)
    values (p_link_id, v_user_id, 'submit_evidence', v_link.status, 'pending_review', 'Evidence uploaded by provider');

    return jsonb_build_object('success', true, 'status', 'pending_review');
end;
$$;

create or replace function public.admin_review_link(
    p_link_id uuid,
    p_decision text,
    p_reject_reason text default null,
    p_reject_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid;
    v_link record;
    v_new_status public.verification_status;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    if p_decision = 'approve' then
        v_new_status := 'verified';

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

        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status)
        values (p_link_id, v_admin_id, 'approve', v_link.status, 'verified');

        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.approved',
            'Portfolio Link Verified',
            'Your ' || v_link.provider_key || ' link has been approved and verified.',
            jsonb_build_object('link_id', p_link_id, 'provider_key', v_link.provider_key)
        );

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

        insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason, note)
        values (p_link_id, v_admin_id, 'reject', v_link.status, 'rejected', p_reject_reason, p_reject_note);

        insert into public.notifications (user_id, type, title, body, data)
        values (
            v_link.user_id,
            'verification.rejected',
            'Portfolio Verification Update',
            'Your ' || v_link.provider_key || ' verification could not be approved: ' || coalesce(p_reject_note, p_reject_reason, 'Verification criteria not met.'),
            jsonb_build_object('link_id', p_link_id, 'reason', p_reject_reason, 'note', p_reject_note)
        );

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

create or replace function public.admin_revoke_link(
    p_link_id uuid,
    p_reason text
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_admin_id uuid;
    v_link record;
begin
    v_admin_id := auth.uid();
    if not public.is_verifier_or_admin() then
        raise exception 'FORBIDDEN: Verifier or Admin role required.';
    end if;

    select * into v_link from public.portfolio_links where id = p_link_id;
    if not found then
        raise exception 'LINK_NOT_FOUND: Portfolio link not found.';
    end if;

    update public.portfolio_links
    set status = 'revoked',
        reject_reason = p_reason,
        reviewed_by = v_admin_id,
        updated_at = now()
    where id = p_link_id;

    insert into public.verification_audit_log (link_id, actor_id, action, from_status, to_status, reason)
    values (p_link_id, v_admin_id, 'revoke', v_link.status, 'revoked', p_reason);

    insert into public.notifications (user_id, type, title, body, data)
    values (
        v_link.user_id,
        'verification.revoked',
        'Portfolio Link Revoked',
        'Your verified ' || v_link.provider_key || ' link was revoked: ' || p_reason,
        jsonb_build_object('link_id', p_link_id, 'reason', p_reason)
    );

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

create or replace function public.system_pause_packages_for_unverified(
    p_provider_id uuid
)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
    v_country_code text;
    v_gate public.publish_gate_mode;
    v_current_status public.provider_verification_aggregate_status;
    v_paused_count integer := 0;
begin
    select country_code into v_country_code from public.profiles where id = p_provider_id;
    select publish_gate into v_gate from public.countries where code = v_country_code;
    v_gate := coalesce(v_gate, 'link_pending_or_verified');

    if v_gate = 'none' then
        return 0;
    end if;

    select status into v_current_status from public.provider_verification where provider_id = p_provider_id;
    v_current_status := coalesce(v_current_status, 'none');

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

create or replace function public.grant_verifier_role(p_user_email text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
    v_uid uuid;
begin
    select id into v_uid from auth.users where email = p_user_email;
    if not found then
        raise exception 'USER_NOT_FOUND: User with specified email does not exist.';
    end if;
    insert into public.user_roles (user_id, role) values (v_uid, 'verifier')
    on conflict (user_id, role) do nothing;
    return true;
end;
$$;

-- 13. RLS Policies
alter table public.portfolio_links enable row level security;
alter table public.oauth_states enable row level security;
alter table public.provider_verification enable row level security;
alter table public.verification_audit_log enable row level security;
alter table public.media_assets enable row level security;
alter table public.package_media enable row level security;

create policy "Owners and verifiers can view portfolio links"
    on public.portfolio_links for select to authenticated
    using (user_id = auth.uid() or public.is_verifier_or_admin());

create policy "Users can insert own portfolio links"
    on public.portfolio_links for insert to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own unverified portfolio links"
    on public.portfolio_links for update to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'))
    with check (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

create policy "Users can delete own unverified portfolio links"
    on public.portfolio_links for delete to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

create policy "Users can manage own oauth states"
    on public.oauth_states for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Public can view provider verification aggregates"
    on public.provider_verification for select to anon, authenticated
    using (true);

create policy "Verifiers can view audit logs"
    on public.verification_audit_log for select to authenticated
    using (public.is_verifier_or_admin());

create policy "Users and verifiers can view media assets"
    on public.media_assets for select to authenticated
    using (owner_id = auth.uid() or public.is_verifier_or_admin() or bucket = 'public-media');

create policy "Users can insert own media asset records"
    on public.media_assets for insert to authenticated
    with check (owner_id = auth.uid());

create policy "Users can update own media asset records"
    on public.media_assets for update to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Users can delete own media assets"
    on public.media_assets for delete to authenticated
    using (owner_id = auth.uid());

create policy "Public can view package media"
    on public.package_media for select to anon, authenticated
    using (true);

create policy "Package owners can manage package media"
    on public.package_media for all to authenticated
    using (exists (select 1 from public.service_packages sp where sp.id = package_id and sp.provider_id = auth.uid()))
    with check (exists (select 1 from public.service_packages sp where sp.id = package_id and sp.provider_id = auth.uid()));

-- Storage Policies
drop policy if exists "Authenticated users can upload to quarantine own folder" on storage.objects;
create policy "Authenticated users can upload to quarantine own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read own quarantine objects" on storage.objects;
create policy "Users can read own quarantine objects"
    on storage.objects for select to authenticated
    using (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own quarantine objects" on storage.objects;
create policy "Users can delete own quarantine objects"
    on storage.objects for delete to authenticated
    using (bucket_id = 'quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload to evidence own folder" on storage.objects;
create policy "Users can upload to evidence own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners and verifiers can view evidence objects" on storage.objects;
create policy "Owners and verifiers can view evidence objects"
    on storage.objects for select to authenticated
    using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_verifier_or_admin()));

drop policy if exists "Public read for public-media" on storage.objects;
create policy "Public read for public-media"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'public-media');

-- Grants
grant select on public.public_verified_portfolio_links to anon, authenticated;
grant select on public.provider_verification to anon, authenticated;
grant select on public.package_media to anon, authenticated;
grant execute on function public.create_portfolio_link(text, text, text, text, public.verification_method) to authenticated;
grant execute on function public.submit_manual_evidence(uuid, uuid) to authenticated;
grant execute on function public.admin_review_link(uuid, text, text, text) to authenticated;
grant execute on function public.admin_revoke_link(uuid, text) to authenticated;
-- ============================================================================
-- Trade Weft — Phase 5: Verification Auto-Pause Event Consumer
-- Wires verification.status.changed events to auto-pause service packages
-- when a provider drops below their country's publish gate requirement.
-- ============================================================================

create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_enqueued integer := 0;
begin
    -- 1. Trust ledger consumer for completed agreements
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'trust_ledger')
    on conflict (event_id, consumer) do nothing;

    -- 2. Reviews reputation consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'reviews_reputation')
    on conflict (event_id, consumer) do nothing;

    -- 3. Verification auto-pause consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'verification_auto_pause', 'pending', now()
    from public.domain_events de
    where de.event_type = 'verification.status.changed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'verification_auto_pause')
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
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
            elsif v_row.consumer = 'verification_auto_pause' and v_de.event_type = 'verification.status.changed' then
                perform public.system_pause_packages_for_unverified(v_de.aggregate_id);
            end if;

            update public.domain_event_deliveries
            set status = 'delivered', attempts = attempts + 1, last_error = null, processed_at = now()
            where id = v_row.id;
            v_processed := v_processed + 1;
        exception when others then
            v_err := SQLERRM;
            if v_row.attempts + 1 >= 5 then
                update public.domain_event_deliveries
                set status = 'dead_letter', attempts = attempts + 1, last_error = v_err, processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                update public.domain_event_deliveries
                set status = 'pending', attempts = attempts + 1, last_error = v_err,
                    next_attempt_at = now() + (power(2, v_row.attempts) * interval '30 seconds')
                where id = v_row.id;
                v_failed := v_failed + 1;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;

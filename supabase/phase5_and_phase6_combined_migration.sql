-- ============================================================================
-- Trade Weft — Consolidated Phases 5 & 6 Migrations
-- Run this in your Supabase SQL Editor to apply both Phase 5 and Phase 6.
-- ============================================================================

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


-- ============================================================================
-- Trade Weft — Phase 6: Monetization Consolidated Migration
-- Run this in your Supabase SQL Editor to apply Phase 6 schema.
-- ============================================================================

-- >>> Start of supabase/migrations/20261016000001_create_monetization_enums_and_tables.sql <<<
-- Migration 20261016000001: Monetization Enums and Tables
-- Payments, append-only ledger, price book, plans, ad products, subscriptions, promotions, and analytics

-- 1. Enums
do $$
begin
    if not exists (select 1 from pg_type where typname = 'payment_provider_code') then
        create type public.payment_provider_code as enum ('mpesa_daraja', 'airtel_money', 'mtn_momo');
    end if;

    if not exists (select 1 from pg_type where typname = 'payment_status') then
        create type public.payment_status as enum ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'timed_out', 'refunded');
    end if;

    if not exists (select 1 from pg_type where typname = 'payment_purpose') then
        create type public.payment_purpose as enum ('top_ad', 'boost_period');
    end if;

    if not exists (select 1 from pg_type where typname = 'ledger_entry_type') then
        create type public.ledger_entry_type as enum ('charge', 'refund', 'adjustment');
    end if;

    if not exists (select 1 from pg_type where typname = 'promotion_status') then
        create type public.promotion_status as enum ('held', 'active', 'expired', 'cancelled');
    end if;

    if not exists (select 1 from pg_type where typname = 'subscription_status') then
        create type public.subscription_status as enum ('pending', 'active', 'grace', 'expired', 'cancelled');
    end if;

    if not exists (select 1 from pg_type where typname = 'billing_mode') then
        create type public.billing_mode as enum ('prepaid_stk', 'standing_order');
    end if;
end $$;

-- 2. Add 'finance' role to app_role enum
alter type public.app_role add value if not exists 'finance';

-- 3. Payment Providers Table
create table if not exists public.payment_providers (
    code public.payment_provider_code primary key,
    name text not null,
    country_code text not null references public.countries(code) on delete cascade,
    is_enabled boolean not null default true,
    amount_granularity_minor integer not null default 100 check (amount_granularity_minor > 0),
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 4. Ad Products Catalog
create table if not exists public.ad_products (
    id text primary key,
    duration_days integer not null check (duration_days in (7, 14, 30)),
    name text not null,
    description text,
    created_at timestamptz not null default now()
);

-- 5. Boost Plans Catalog
create table if not exists public.plans (
    id text primary key,
    name text not null,
    description text,
    billing_cycle_days integer not null default 30 check (billing_cycle_days = 30),
    entitlements jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- 6. Country-Scoped Price Book
create table if not exists public.price_book (
    id uuid primary key default gen_random_uuid(),
    product_id text not null,
    product_type text not null check (product_type in ('ad_product', 'plan')),
    country_code text not null references public.countries(code) on delete cascade,
    currency_code text not null,
    amount_minor bigint not null check (amount_minor >= 0),
    tax_rate_bps integer not null default 1600 check (tax_rate_bps >= 0),
    tax_inclusive boolean not null default true,
    effective_from timestamptz not null default now(),
    effective_to timestamptz,
    created_at timestamptz not null default now(),
    constraint check_effective_window check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_price_book_lookup 
on public.price_book (country_code, product_id, effective_from desc);

-- 7. Payments Table
create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    payer_id uuid not null references public.profiles(id) on delete restrict,
    purpose public.payment_purpose not null,
    target_id uuid not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency_code text not null,
    provider public.payment_provider_code not null,
    status public.payment_status not null default 'created',
    merchant_request_id text,
    checkout_request_id text,
    receipt_number text,
    msisdn text not null,
    idempotency_key text not null,
    failure_code text,
    failure_reason text,
    attempts integer not null default 0 check (attempts >= 0),
    price_book_id uuid references public.price_book(id) on delete set null,
    tax_amount_minor bigint not null default 0 check (tax_amount_minor >= 0),
    price_snapshot jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_payments_payer_idempotency unique (payer_id, idempotency_key)
);

create unique index if not exists idx_payments_provider_checkout
on public.payments (provider, checkout_request_id)
where checkout_request_id is not null;

create index if not exists idx_payments_payer_created
on public.payments (payer_id, created_at desc);

create index if not exists idx_payments_pending_poll
on public.payments (status, created_at)
where status = 'pending';

-- 8. Raw Ingested Payment Events (Restricted/Append-only audit)
create table if not exists public.payment_events_raw (
    id uuid primary key default gen_random_uuid(),
    provider public.payment_provider_code not null,
    event_type text not null,
    checkout_request_id text,
    payload jsonb not null,
    received_at timestamptz not null default now(),
    is_redacted boolean not null default false,
    redacted_at timestamptz
);

create index if not exists idx_payment_events_raw_checkout
on public.payment_events_raw (checkout_request_id)
where checkout_request_id is not null;

-- 9. Append-Only Payment Ledger
create table if not exists public.payment_ledger (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id) on delete restrict,
    payer_id uuid not null references public.profiles(id) on delete restrict,
    entry_type public.ledger_entry_type not null,
    amount_minor bigint not null check (amount_minor > 0),
    currency_code text not null,
    reference_note text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_ledger_payment
on public.payment_ledger (payment_id);

create index if not exists idx_payment_ledger_payer
on public.payment_ledger (payer_id, created_at desc);

-- 10. Listing Promotions Table (Top Ads)
create table if not exists public.listing_promotions (
    id uuid primary key default gen_random_uuid(),
    package_id uuid not null references public.service_packages(id) on delete cascade,
    provider_id uuid not null references public.profiles(id) on delete cascade,
    country_code text not null references public.countries(code) on delete cascade,
    city_id uuid not null references public.locations(id) on delete cascade,
    category_id uuid not null references public.service_categories(id) on delete cascade,
    slot_no integer not null check (slot_no between 1 and 3),
    period tstzrange not null,
    status public.promotion_status not null default 'held',
    payment_id uuid references public.payments(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_listing_promotions_active_lookup
on public.listing_promotions (country_code, city_id, category_id, status)
where status = 'active';

create index if not exists idx_listing_promotions_provider
on public.listing_promotions (provider_id, created_at desc);

-- 11. Subscriptions Table (Boost Packages)
create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id text not null references public.plans(id) on delete restrict,
    status public.subscription_status not null default 'pending',
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    grace_period_end timestamptz not null,
    cancel_at_period_end boolean not null default false,
    billing_mode public.billing_mode not null default 'prepaid_stk',
    mandate_ref text,
    latest_payment_id uuid references public.payments(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint check_subscription_period check (current_period_end > current_period_start),
    constraint check_subscription_grace check (grace_period_end >= current_period_end)
);

create unique index if not exists idx_subscriptions_user_active
on public.subscriptions (user_id)
where status in ('active', 'grace', 'pending');

-- 12. Subscription Invoices Table
create table if not exists public.subscription_invoices (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.subscriptions(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_id text not null references public.plans(id) on delete restrict,
    period_start timestamptz not null,
    period_end timestamptz not null,
    amount_minor bigint not null check (amount_minor >= 0),
    currency_code text not null,
    status text not null check (status in ('pending', 'paid', 'void', 'overdue')),
    payment_id uuid references public.payments(id) on delete set null,
    due_at timestamptz not null,
    paid_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_subscription_invoices_user
on public.subscription_invoices (user_id, created_at desc);

-- 13. Privacy-First Daily Analytics Stats Tables
create table if not exists public.package_daily_stats (
    package_id uuid not null references public.service_packages(id) on delete cascade,
    date date not null default current_date,
    impressions integer not null default 0 check (impressions >= 0),
    views integer not null default 0 check (views >= 0),
    proposal_starts integer not null default 0 check (proposal_starts >= 0),
    primary key (package_id, date)
);

create table if not exists public.promotion_daily_stats (
    promotion_id uuid not null references public.listing_promotions(id) on delete cascade,
    date date not null default current_date,
    impressions integer not null default 0 check (impressions >= 0),
    clicks integer not null default 0 check (clicks >= 0),
    primary key (promotion_id, date)
);

-- 14. Financial Audit Trail
create table if not exists public.payment_audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null references public.profiles(id) on delete restrict,
    action text not null,
    target_type text not null,
    target_id text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_audit_log_target
on public.payment_audit_log (target_type, target_id);


-- >>> Start of supabase/migrations/20261016000002_monetization_constraints_and_triggers.sql <<<
-- Migration 20261016000002: Monetization Constraints, Integrity Triggers, and Append-Only Defenses

-- 1. Enable btree_gist for multi-column exclusion constraints
create extension if not exists btree_gist;

-- 2. Exclusion Constraint on listing_promotions (Overbooking Prevention)
-- Guarantees that at the database level, no two held or active promotions
-- can ever overlap on the same (country, city, category, slot_no) period.
alter table public.listing_promotions
drop constraint if exists no_overlapping_promoted_slots;

alter table public.listing_promotions
add constraint no_overlapping_promoted_slots
exclude using gist (
    country_code with =,
    city_id with =,
    category_id with =,
    slot_no with =,
    period with &&
) where (status in ('held', 'active'));

-- 3. Append-Only Trigger on payment_ledger
create or replace function public.prevent_payment_ledger_mutation()
returns trigger
language plpgsql
security definer
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_ledger cannot be updated or deleted';
end;
$$;

drop trigger if exists tr_payment_ledger_append_only on public.payment_ledger;
create trigger tr_payment_ledger_append_only
before update or delete on public.payment_ledger
for each row
execute function public.prevent_payment_ledger_mutation();

-- 4. Append-Only Trigger on payment_audit_log
create or replace function public.prevent_payment_audit_mutation()
returns trigger
language plpgsql
security definer
as $$
begin
    raise exception 'IMMUTABLE_RECORD: Rows in payment_audit_log cannot be updated or deleted';
end;
$$;

drop trigger if exists tr_payment_audit_append_only on public.payment_audit_log;
create trigger tr_payment_audit_append_only
before update or delete on public.payment_audit_log
for each row
execute function public.prevent_payment_audit_mutation();

-- 5. Updated_At Triggers for Stateful Tables
drop trigger if exists tr_payments_updated_at on public.payments;
create trigger tr_payments_updated_at
before update on public.payments
for each row
execute function public.handle_updated_at();

drop trigger if exists tr_listing_promotions_updated_at on public.listing_promotions;
create trigger tr_listing_promotions_updated_at
before update on public.listing_promotions
for each row
execute function public.handle_updated_at();

drop trigger if exists tr_subscriptions_updated_at on public.subscriptions;
create trigger tr_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.handle_updated_at();


-- >>> Start of supabase/migrations/20261016000003_entitlements_and_pricing_rpc.sql <<<
-- Migration 20261016000003: Entitlements Engine and Publish Gate Integration

-- 1. Get Entitlements SQL Function
-- Single source of truth for user caps and feature access.
create or replace function public.get_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_sub record;
    v_rank_bonus integer := 0;
    v_max_active integer := 10;
    v_max_top_ads integer := 1;
    v_analytics text := 'basic';
    v_csv_export boolean := false;
    v_plan_id text := 'free';
    v_status text := 'none';
    v_is_subscribed boolean := false;
    v_in_grace boolean := false;
begin
    if p_user_id is null then
        return jsonb_build_object(
            'plan_id', 'free',
            'is_subscribed', false,
            'in_grace', false,
            'status', 'none',
            'rank_bonus_days', 0,
            'max_active_packages', 10,
            'max_concurrent_top_ads', 1,
            'analytics_level', 'basic',
            'csv_export', false
        );
    end if;

    -- Query active or grace subscription
    select s.plan_id, s.status, p.entitlements
    into v_sub
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.user_id = p_user_id
      and s.status in ('active', 'grace')
      and clock_timestamp() <= s.grace_period_end
    order by s.created_at desc
    limit 1;

    if v_sub.plan_id is not null then
        v_plan_id := v_sub.plan_id;
        v_status := v_sub.status;
        v_is_subscribed := true;
        v_in_grace := (v_sub.status = 'grace');

        -- Overlay entitlements from plans table
        v_rank_bonus := coalesce((v_sub.entitlements->>'rank_bonus_days')::integer, 0);
        v_max_active := coalesce((v_sub.entitlements->>'max_active_packages')::integer, 10);
        v_max_top_ads := coalesce((v_sub.entitlements->>'max_concurrent_top_ads')::integer, 1);
        v_analytics := coalesce(v_sub.entitlements->>'analytics_level', 'basic');
        v_csv_export := coalesce((v_sub.entitlements->>'csv_export')::boolean, false);
    end if;

    return jsonb_build_object(
        'plan_id', v_plan_id,
        'is_subscribed', v_is_subscribed,
        'in_grace', v_in_grace,
        'status', v_status,
        'rank_bonus_days', v_rank_bonus,
        'max_active_packages', v_max_active,
        'max_concurrent_top_ads', v_max_top_ads,
        'analytics_level', v_analytics,
        'csv_export', v_csv_export
    );
end;
$$;

grant execute on function public.get_entitlements(uuid) to anon, authenticated;

-- 2. Update publish_service_package to evaluate entitlements dynamically
create or replace function public.publish_service_package(
    p_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_pkg record;
    v_onboarding timestamptz;
    v_active_count integer;
    v_max_allowed integer;
    v_next_ver integer;
    v_snapshot jsonb;
    v_version_id uuid;
    v_seeking_categories jsonb;
    v_entitlements jsonb;
    v_rank_bonus integer;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    -- Fetch package
    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    -- Strict Server Ownership Check (No IDOR)
    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if v_pkg.status = 'archived' or v_pkg.status = 'removed' then
        raise exception 'INVALID_STATE: Archived or removed packages cannot be published directly';
    end if;

    -- Verify Provider Onboarding Completion
    select onboarding_completed_at into v_onboarding from public.profiles where id = v_user_id;
    if v_onboarding is null then
        raise exception 'ONBOARDING_REQUIRED: Profile onboarding must be completed before publishing';
    end if;

    -- Dynamic Entitlement Check for Active Packages Limit
    v_entitlements := public.get_entitlements(v_user_id);
    v_max_allowed := coalesce((v_entitlements->>'max_active_packages')::integer, 10);
    v_rank_bonus := coalesce((v_entitlements->>'rank_bonus_days')::integer, 0);

    select count(*) into v_active_count
    from public.service_packages
    where provider_id = v_user_id
      and status in ('published', 'paused')
      and id <> p_package_id;

    if v_active_count >= v_max_allowed then
        raise exception 'LIMIT_EXCEEDED: Active package limit reached (maximum % allowed)', v_max_allowed;
    end if;

    -- Collect Seeking Categories for Snapshot
    select coalesce(jsonb_agg(jsonb_build_object('category_id', sc.category_id)), '[]'::jsonb)
    into v_seeking_categories
    from public.service_package_seeking_categories sc
    where sc.package_id = p_package_id;

    -- Calculate Next Version Number
    select coalesce(max(version_number), 0) + 1 into v_next_ver
    from public.service_package_versions
    where package_id = p_package_id;

    -- Create Immutable Snapshot
    v_snapshot := jsonb_build_object(
        'package_id', v_pkg.id,
        'title', v_pkg.title,
        'summary', v_pkg.summary,
        'description', v_pkg.description,
        'category_id', v_pkg.category_id,
        'delivery_mode', v_pkg.delivery_mode,
        'country_code', v_pkg.country_code,
        'city_id', v_pkg.city_id,
        'area_id', v_pkg.area_id,
        'turnaround_days', v_pkg.turnaround_days,
        'capacity_per_month', v_pkg.capacity_per_month,
        'indicative_value_minor', v_pkg.indicative_value_minor,
        'currency_code', v_pkg.currency_code,
        'deliverables', v_pkg.deliverables,
        'exclusions', v_pkg.exclusions,
        'seeking_categories', v_seeking_categories
    );

    -- Insert Immutable Version
    insert into public.service_package_versions (
        package_id,
        version_number,
        snapshot
    ) values (
        p_package_id,
        v_next_ver,
        v_snapshot
    ) returning id into v_version_id;

    -- Update Service Package State
    update public.service_packages
    set status = 'published',
        current_version_id = v_version_id,
        published_at = coalesce(published_at, clock_timestamp()),
        rank_ts = coalesce(published_at, clock_timestamp()) + (v_rank_bonus || ' days')::interval,
        updated_at = clock_timestamp()
    where id = p_package_id;

    -- Insert Domain Event into Outbox
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'package.published',
        'service_package',
        p_package_id,
        jsonb_build_object(
            'package_id', p_package_id,
            'provider_id', v_user_id,
            'version_id', v_version_id,
            'version_number', v_next_ver,
            'country_code', v_pkg.country_code
        )
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'version_id', v_version_id,
        'version_number', v_next_ver
    );
end;
$$;

-- 3. Recompute Ranking for a Provider (Triggered on Subscription changes)
create or replace function public.sync_provider_rank_ts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rank_bonus integer;
begin
    v_rank_bonus := coalesce((public.get_entitlements(p_user_id)->>'rank_bonus_days')::integer, 0);

    update public.service_packages
    set rank_ts = published_at + (v_rank_bonus || ' days')::interval
    where provider_id = p_user_id
      and status = 'published'
      and published_at is not null;
end;
$$;


-- >>> Start of supabase/migrations/20261016000004_ranking_and_promotions_migration.sql <<<
-- Migration 20261016000004: Ranking and Promotions Migration
-- Expand/contract ranking schema, partial indexing, and promoted search block integration

-- 1. Add rank_ts to service_packages with backward-compatible default
alter table public.service_packages
add column if not exists rank_ts timestamptz not null default now();

-- 2. Backfill existing published packages
update public.service_packages
set rank_ts = published_at
where status = 'published' and published_at is not null;

-- 3. High-Performance Keyset Index on rank_ts
create index if not exists idx_packages_browse_hot
on public.service_packages (country_code, city_id, area_id, category_id, rank_ts desc, id desc)
where status = 'published';

-- 4. Update search_service_packages RPC
-- Drop previous signature before recreating with expanded OUT parameters
drop function if exists public.search_service_packages(text,text,uuid,uuid,uuid,uuid,public.delivery_mode,text,timestamp with time zone,uuid,integer);
drop function if exists public.search_service_packages cascade;

create or replace function public.search_service_packages(
    p_country_code text,
    p_locale text default 'en',
    p_city_id uuid default null,
    p_area_id uuid default null,
    p_category_id uuid default null,
    p_seeking_category_id uuid default null,
    p_delivery_mode public.delivery_mode default null,
    p_query text default null,
    p_cursor_published_at timestamptz default null,
    p_cursor_id uuid default null,
    p_page_size integer default 20
)
returns table (
    id uuid,
    title text,
    summary text,
    category_id uuid,
    category_slug text,
    category_name text,
    delivery_mode public.delivery_mode,
    country_code text,
    city_id uuid,
    city_name text,
    area_id uuid,
    area_name text,
    turnaround_days integer,
    capacity_per_month integer,
    indicative_value_minor bigint,
    currency_code text,
    deliverables jsonb,
    exclusions jsonb,
    seeking_categories jsonb,
    provider_id uuid,
    provider_display_name text,
    provider_business_name text,
    provider_avatar_url text,
    provider_member_since timestamptz,
    published_at timestamptz,
    has_next_page boolean,
    is_promoted boolean,
    promoted_slot integer,
    rank_ts timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
    v_limit integer := least(coalesce(p_page_size, 20), 50);
    v_clean_query text := nullif(trim(p_query), '');
    v_tsquery tsquery := null;
    v_is_first_page boolean := (p_cursor_published_at is null);
begin
    if v_clean_query is not null then
        v_tsquery := plainto_tsquery('simple', v_clean_query);
    end if;

    return query
    with promoted_results as (
        -- Pinned Top Ads: displayed on first page only when browsing a category & city
        select
            sp.id,
            sp.title,
            sp.summary,
            sp.category_id,
            cat.slug as category_slug,
            coalesce(ct.name, cat.slug) as category_name,
            sp.delivery_mode,
            sp.country_code,
            sp.city_id,
            city.name as city_name,
            sp.area_id,
            area.name as area_name,
            sp.turnaround_days,
            sp.capacity_per_month,
            sp.indicative_value_minor,
            sp.currency_code,
            sp.deliverables,
            sp.exclusions,
            coalesce(
                (
                    select jsonb_agg(
                        jsonb_build_object(
                            'category_id', scat.id,
                            'slug', scat.slug,
                            'name', coalesce(sct.name, scat.slug)
                        )
                    )
                    from public.service_package_seeking_categories spsc
                    join public.service_categories scat on scat.id = spsc.category_id
                    left join public.service_category_translations sct 
                    on sct.category_id = scat.id and sct.locale = p_locale
                    where spsc.package_id = sp.id
                ),
                '[]'::jsonb
            ) as seeking_categories,
            sp.provider_id,
            prov.display_name as provider_display_name,
            prov.business_name as provider_business_name,
            prov.avatar_url as provider_avatar_url,
            prov.member_since as provider_member_since,
            sp.published_at,
            false as has_next_page,
            true as is_promoted,
            lp.slot_no as promoted_slot,
            sp.rank_ts,
            lp.slot_no as sort_order_promoted
        from public.listing_promotions lp
        join public.service_packages sp on sp.id = lp.package_id
        join public.countries country on country.code = sp.country_code and country.is_active = true
        join public.public_provider_profiles prov on prov.id = sp.provider_id
        join public.service_categories cat on cat.id = sp.category_id and cat.is_active = true
        left join public.service_category_translations ct 
            on ct.category_id = cat.id and ct.locale = p_locale
        left join public.locations city on city.id = sp.city_id
        left join public.locations area on area.id = sp.area_id
        where v_is_first_page
          and lp.status = 'active'
          and clock_timestamp() <@ lp.period
          and sp.status = 'published'
          and sp.country_code = p_country_code
          and (p_category_id is null or lp.category_id = p_category_id)
          and (p_city_id is null or lp.city_id = p_city_id)
        order by lp.slot_no asc
        limit 3
    ),
    organic_results as (
        select
            sp.id,
            sp.title,
            sp.summary,
            sp.category_id,
            cat.slug as category_slug,
            coalesce(ct.name, cat.slug) as category_name,
            sp.delivery_mode,
            sp.country_code,
            sp.city_id,
            city.name as city_name,
            sp.area_id,
            area.name as area_name,
            sp.turnaround_days,
            sp.capacity_per_month,
            sp.indicative_value_minor,
            sp.currency_code,
            sp.deliverables,
            sp.exclusions,
            coalesce(
                (
                    select jsonb_agg(
                        jsonb_build_object(
                            'category_id', scat.id,
                            'slug', scat.slug,
                            'name', coalesce(sct.name, scat.slug)
                        )
                    )
                    from public.service_package_seeking_categories spsc
                    join public.service_categories scat on scat.id = spsc.category_id
                    left join public.service_category_translations sct 
                    on sct.category_id = scat.id and sct.locale = p_locale
                    where spsc.package_id = sp.id
                ),
                '[]'::jsonb
            ) as seeking_categories,
            sp.provider_id,
            prov.display_name as provider_display_name,
            prov.business_name as provider_business_name,
            prov.avatar_url as provider_avatar_url,
            prov.member_since as provider_member_since,
            sp.published_at,
            case 
                when v_tsquery is not null then
                    ts_rank_cd(sp.search_vector, v_tsquery) + (similarity(sp.title, v_clean_query) * 0.5)
                else 0
            end as relevance_rank,
            false as is_promoted,
            null::integer as promoted_slot,
            sp.rank_ts
        from public.service_packages sp
        join public.countries country on country.code = sp.country_code and country.is_active = true
        join public.public_provider_profiles prov on prov.id = sp.provider_id
        join public.service_categories cat on cat.id = sp.category_id and cat.is_active = true
        left join public.service_category_translations ct 
            on ct.category_id = cat.id and ct.locale = p_locale
        left join public.locations city on city.id = sp.city_id
        left join public.locations area on area.id = sp.area_id
        where sp.status = 'published'
          and sp.country_code = p_country_code
          -- Exclude any package already shown in promoted block on page 1
          and (
              not v_is_first_page
              or sp.id not in (select pr.id from promoted_results pr)
          )
          -- Category filtering (inclusive of child categories)
          and (
              p_category_id is null
              or sp.category_id = p_category_id
              or sp.category_id in (select sub_cat.id from public.service_categories sub_cat where sub_cat.parent_id = p_category_id)
          )
          -- Seeking Category filtering
          and (
              p_seeking_category_id is null
              or exists (
                  select 1 from public.service_package_seeking_categories spsc
                  where spsc.package_id = sp.id
                    and (
                        spsc.category_id = p_seeking_category_id
                        or spsc.category_id in (select sub_seek_cat.id from public.service_categories sub_seek_cat where sub_seek_cat.parent_id = p_seeking_category_id)
                    )
              )
          )
          -- Delivery Mode filter
          and (p_delivery_mode is null or sp.delivery_mode = p_delivery_mode)
          -- Location matching rules
          and (
              p_area_id is null
              or sp.area_id = p_area_id
              or (sp.delivery_mode = 'remote' and (sp.city_id = p_city_id or p_city_id is null))
          )
          and (
              p_city_id is null
              or sp.city_id = p_city_id
              or sp.delivery_mode = 'remote'
          )
          -- Text Query matching
          and (
              v_tsquery is null
              or sp.search_vector @@ v_tsquery
              or sp.title % v_clean_query
          )
          -- Keyset pagination cursor on (rank_ts, id)
          and (
              p_cursor_published_at is null
              or (sp.rank_ts, sp.id) < (p_cursor_published_at, p_cursor_id)
          )
        order by
            case when v_tsquery is not null then relevance_rank else 0 end desc,
            sp.rank_ts desc,
            sp.id desc
        limit v_limit + 1
    ),
    organic_counted as (
        select 
            o.*, 
            count(*) over() as total_organic_fetched
        from organic_results o
    )
    -- Union: Promoted results first (slot_no 1..3), then organic results
    select
        pr.id,
        pr.title,
        pr.summary,
        pr.category_id,
        pr.category_slug,
        pr.category_name,
        pr.delivery_mode,
        pr.country_code,
        pr.city_id,
        pr.city_name,
        pr.area_id,
        pr.area_name,
        pr.turnaround_days,
        pr.capacity_per_month,
        pr.indicative_value_minor,
        pr.currency_code,
        pr.deliverables,
        pr.exclusions,
        pr.seeking_categories,
        pr.provider_id,
        pr.provider_display_name,
        pr.provider_business_name,
        pr.provider_avatar_url,
        pr.provider_member_since,
        pr.published_at,
        false as has_next_page,
        pr.is_promoted,
        pr.promoted_slot,
        pr.rank_ts
    from promoted_results pr

    union all

    select
        oc.id,
        oc.title,
        oc.summary,
        oc.category_id,
        oc.category_slug,
        oc.category_name,
        oc.delivery_mode,
        oc.country_code,
        oc.city_id,
        oc.city_name,
        oc.area_id,
        oc.area_name,
        oc.turnaround_days,
        oc.capacity_per_month,
        oc.indicative_value_minor,
        oc.currency_code,
        oc.deliverables,
        oc.exclusions,
        oc.seeking_categories,
        oc.provider_id,
        oc.provider_display_name,
        oc.provider_business_name,
        oc.provider_avatar_url,
        oc.provider_member_since,
        oc.published_at,
        (oc.total_organic_fetched > v_limit) as has_next_page,
        false as is_promoted,
        null::integer as promoted_slot,
        oc.rank_ts
    from organic_counted oc
    limit case 
        when v_is_first_page then v_limit + (select count(*) from promoted_results)
        else v_limit
    end;
end;
$$;

grant execute on function public.search_service_packages(text, text, uuid, uuid, uuid, uuid, public.delivery_mode, text, timestamptz, uuid, integer) to anon, authenticated;


-- >>> Start of supabase/migrations/20261016000005_monetization_rls_and_policies.sql <<<
-- Migration 20261016000005: Monetization Row Level Security Policies
-- Strict isolation for payments, ledger, subscriptions, promotions, and analytics

-- 1. Helper function for finance or admin role check
create or replace function public.is_finance_or_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role::text in ('finance', 'admin')
    );
$$;

grant execute on function public.is_finance_or_admin() to authenticated;

-- 2. Enable RLS on all monetization tables
alter table public.payment_providers enable row level security;
alter table public.ad_products enable row level security;
alter table public.plans enable row level security;
alter table public.price_book enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events_raw enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.listing_promotions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.package_daily_stats enable row level security;
alter table public.promotion_daily_stats enable row level security;
alter table public.payment_audit_log enable row level security;

-- 3. Catalog and Provider read policies (Public readable for catalog)
create policy "payment_providers_select_policy"
on public.payment_providers for select
to anon, authenticated
using (is_enabled = true or public.is_finance_or_admin());

create policy "ad_products_select_policy"
on public.ad_products for select
to anon, authenticated
using (true);

create policy "plans_select_policy"
on public.plans for select
to anon, authenticated
using (true);

create policy "price_book_select_policy"
on public.price_book for select
to anon, authenticated
using (
    (effective_from <= clock_timestamp() and (effective_to is null or effective_to > clock_timestamp()))
    or public.is_finance_or_admin()
);

-- 4. Payments Policies (Owner or Finance read; NO client write)
create policy "payments_select_policy"
on public.payments for select
to authenticated
using (payer_id = auth.uid() or public.is_finance_or_admin());

-- 5. Payment Events Raw (Finance/Service-role only)
create policy "payment_events_raw_select_policy"
on public.payment_events_raw for select
to authenticated
using (public.is_finance_or_admin());

-- 6. Payment Ledger (Owner or Finance read; NO client write)
create policy "payment_ledger_select_policy"
on public.payment_ledger for select
to authenticated
using (payer_id = auth.uid() or public.is_finance_or_admin());

-- 7. Listing Promotions (Public reads active; Provider or Finance reads own)
create policy "listing_promotions_select_policy"
on public.listing_promotions for select
to anon, authenticated
using (
    status = 'active'
    or provider_id = auth.uid()
    or public.is_finance_or_admin()
);

-- 8. Subscriptions (Owner or Finance read; NO client write)
create policy "subscriptions_select_policy"
on public.subscriptions for select
to authenticated
using (user_id = auth.uid() or public.is_finance_or_admin());

-- 9. Subscription Invoices (Owner or Finance read)
create policy "subscription_invoices_select_policy"
on public.subscription_invoices for select
to authenticated
using (user_id = auth.uid() or public.is_finance_or_admin());

-- 10. Analytics Stats (Package owner reads own; Finance reads all)
create policy "package_daily_stats_select_policy"
on public.package_daily_stats for select
to authenticated
using (
    exists (
        select 1 from public.service_packages sp
        where sp.id = package_daily_stats.package_id
          and sp.provider_id = auth.uid()
    )
    or public.is_finance_or_admin()
);

create policy "promotion_daily_stats_select_policy"
on public.promotion_daily_stats for select
to authenticated
using (
    exists (
        select 1 from public.listing_promotions lp
        where lp.id = promotion_daily_stats.promotion_id
          and lp.provider_id = auth.uid()
    )
    or public.is_finance_or_admin()
);

-- 11. Payment Audit Log (Finance only)
create policy "payment_audit_log_select_policy"
on public.payment_audit_log for select
to authenticated
using (public.is_finance_or_admin());


-- >>> Start of supabase/migrations/20261016000006_seed_catalog_and_price_book.sql <<<
-- Migration 20261016000006: Seed Default Payment Providers, Ad Products, Plans, and PLACEHOLDER Price Book

-- 1. Default Payment Provider for Kenya
insert into public.payment_providers (code, name, country_code, is_enabled, amount_granularity_minor, config)
values (
    'mpesa_daraja',
    'Safaricom M-Pesa Express (STK Push)',
    'KE',
    true,
    100, -- 100 minor units = 1 whole KES
    jsonb_build_object(
        'shortcode', '174379',
        'env', 'sandbox',
        'currency', 'KES'
    )
)
on conflict (code) do update set
    name = excluded.name,
    is_enabled = excluded.is_enabled,
    amount_granularity_minor = excluded.amount_granularity_minor,
    config = excluded.config;

-- 2. Ad Products Catalog (Top Ads)
insert into public.ad_products (id, duration_days, name, description)
values
    ('top_ad_7d', 7, '7-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 7 consecutive days.'),
    ('top_ad_14d', 14, '14-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 14 consecutive days.'),
    ('top_ad_30d', 30, '30-Day Top Ad Pinned Placement', 'Pinned placement in category and city browse for 30 consecutive days.')
on conflict (id) do update set
    name = excluded.name,
    duration_days = excluded.duration_days,
    description = excluded.description;

-- 3. Boost Plans Catalog
insert into public.plans (id, name, description, billing_cycle_days, entitlements)
values
    (
        'basic',
        'Boost Basic',
        'Enhanced visibility and higher package listing capacity for growing providers.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 3,
            'max_active_packages', 15,
            'max_concurrent_top_ads', 2,
            'analytics_level', 'basic',
            'csv_export', false
        )
    ),
    (
        'pro',
        'Boost Pro',
        'Prime freshness boost, generous listing capacity, and 90-day daily analytics performance trends.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 7,
            'max_active_packages', 25,
            'max_concurrent_top_ads', 3,
            'analytics_level', 'pro',
            'csv_export', false
        )
    ),
    (
        'enterprise',
        'Boost Enterprise',
        'Maximum freshness boost, catalog-wide scale, and full CSV analytics export for power agencies.',
        30,
        jsonb_build_object(
            'rank_bonus_days', 14,
            'max_active_packages', 50,
            'max_concurrent_top_ads', 5,
            'analytics_level', 'enterprise',
            'csv_export', true
        )
    )
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    entitlements = excluded.entitlements;

-- 4. Country-Scoped Price Book (Kenya - KES)
-- NOTE: ALL PRICES BELOW ARE CLEARLY MARKED PLACEHOLDERS PER OPERATIONAL SPECIFICATIONS
insert into public.price_book (product_id, product_type, country_code, currency_code, amount_minor, tax_rate_bps, tax_inclusive, effective_from)
values
    -- Top Ads (PLACEHOLDER PRICES)
    ('top_ad_7d', 'ad_product', 'KE', 'KES', 50000, 1600, true, now()),    -- KES 500.00 (PLACEHOLDER)
    ('top_ad_14d', 'ad_product', 'KE', 'KES', 90000, 1600, true, now()),   -- KES 900.00 (PLACEHOLDER)
    ('top_ad_30d', 'ad_product', 'KE', 'KES', 150000, 1600, true, now()),  -- KES 1,500.00 (PLACEHOLDER)
    -- Boost Plans (PLACEHOLDER PRICES)
    ('basic', 'plan', 'KE', 'KES', 100000, 1600, true, now()),             -- KES 1,000.00 / month (PLACEHOLDER)
    ('pro', 'plan', 'KE', 'KES', 250000, 1600, true, now()),               -- KES 2,500.00 / month (PLACEHOLDER)
    ('enterprise', 'plan', 'KE', 'KES', 500000, 1600, true, now())         -- KES 5,000.00 / month (PLACEHOLDER)
on conflict do nothing;


-- >>> Start of supabase/migrations/20261016000007_payment_engine_rpc.sql <<<
-- Migration 20261016000007: Payment Engine Atomic Settlement and Failure RPC Functions
-- Enforces row-level locks, ledger entry insertion, entitlement sync, and notification dispatch in one atomic transaction.

-- 1. Atomic Settlement RPC Function
create or replace function public.settle_payment_transaction(
    p_payment_id uuid,
    p_checkout_request_id text,
    p_receipt_number text,
    p_verified_amount_minor bigint,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
    v_promo record;
    v_sub record;
    v_duration_days integer := 7;
begin
    -- 1. Lock payment row
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    -- Idempotency: If already succeeded, return immediately with success
    if v_payment.status = 'succeeded' then
        return jsonb_build_object(
            'success', true,
            'payment_id', v_payment.id,
            'status', 'succeeded',
            'already_settled', true
        );
    end if;

    if v_payment.status not in ('created', 'pending') then
        raise exception 'INVALID_STATE: Payment status is % and cannot be settled', v_payment.status;
    end if;

    -- Strict Amount Verification (Match what was invoiced vs what provider debited)
    if v_payment.amount_minor <> p_verified_amount_minor then
        raise exception 'AMOUNT_MISMATCH: Invoiced amount (%) does not match provider verified amount (%)',
            v_payment.amount_minor, p_verified_amount_minor;
    end if;

    -- 2. Transition Payment to Succeeded
    update public.payments
    set status = 'succeeded',
        receipt_number = p_receipt_number,
        checkout_request_id = coalesce(checkout_request_id, p_checkout_request_id),
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- 3. Insert Append-Only Ledger Entry
    insert into public.payment_ledger (
        payment_id,
        payer_id,
        entry_type,
        amount_minor,
        currency_code,
        reference_note
    ) values (
        v_payment.id,
        v_payment.payer_id,
        'charge',
        v_payment.amount_minor,
        v_payment.currency_code,
        coalesce(p_note, 'M-Pesa Receipt: ' || p_receipt_number)
    );

    -- 4. Product Fulfillment based on purpose
    if v_payment.purpose = 'top_ad' then
        -- Find promotion record by target_id or payment_id
        select lp.*, ap.duration_days
        into v_promo
        from public.listing_promotions lp
        left join public.ad_products ap on ap.id = (v_payment.price_snapshot->>'product_id')
        where lp.id = v_payment.target_id or lp.payment_id = v_payment.id
        limit 1;

        if v_promo.id is not null then
            v_duration_days := coalesce(v_promo.duration_days, 7);

            -- Activate promotion and extend period to exact duration
            update public.listing_promotions
            set status = 'active',
                payment_id = v_payment.id,
                period = tstzrange(clock_timestamp(), clock_timestamp() + (v_duration_days || ' days')::interval),
                updated_at = clock_timestamp()
            where id = v_promo.id;

            -- In-app notification
            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'promotion.started',
                jsonb_build_object(
                    'promotion_id', v_promo.id,
                    'package_id', v_promo.package_id,
                    'receipt_number', p_receipt_number,
                    'duration_days', v_duration_days
                )
            );
        end if;

    elsif v_payment.purpose = 'boost_period' then
        -- Find subscription by user_id or target_id
        select * into v_sub
        from public.subscriptions
        where id = v_payment.target_id or user_id = v_payment.payer_id
        order by created_at desc
        limit 1;

        if v_sub.id is not null then
            update public.subscriptions
            set status = 'active',
                current_period_start = clock_timestamp(),
                current_period_end = clock_timestamp() + interval '30 days',
                grace_period_end = clock_timestamp() + interval '33 days',
                latest_payment_id = v_payment.id,
                updated_at = clock_timestamp()
            where id = v_sub.id;

            -- Update subscription invoice if present
            update public.subscription_invoices
            set status = 'paid',
                payment_id = v_payment.id,
                paid_at = clock_timestamp()
            where subscription_id = v_sub.id and status = 'pending';

            -- Synchronize freshness bonus on provider's packages
            perform public.sync_provider_rank_ts(v_payment.payer_id);

            -- In-app notification
            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'subscription.renewed',
                jsonb_build_object(
                    'subscription_id', v_sub.id,
                    'plan_id', v_sub.plan_id,
                    'receipt_number', p_receipt_number
                )
            );
        end if;
    end if;

    -- 5. Outbox Domain Event
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'payment.succeeded',
        'payment',
        v_payment.id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'purpose', v_payment.purpose,
            'amount_minor', v_payment.amount_minor,
            'receipt_number', p_receipt_number
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', 'succeeded',
        'receipt_number', p_receipt_number
    );
end;
$$;

-- 2. Atomic Failure / Cancellation RPC Function
create or replace function public.fail_payment_transaction(
    p_payment_id uuid,
    p_failure_code text,
    p_failure_reason text,
    p_terminal_status public.payment_status default 'failed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
begin
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    -- If already finalized as succeeded, cannot fail
    if v_payment.status = 'succeeded' then
        raise exception 'INVALID_STATE: Cannot fail an already settled payment';
    end if;

    update public.payments
    set status = p_terminal_status,
        failure_code = p_failure_code,
        failure_reason = p_failure_reason,
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- If Top Ad was held, release hold
    if v_payment.purpose = 'top_ad' then
        update public.listing_promotions
        set status = 'cancelled',
            updated_at = clock_timestamp()
        where (id = v_payment.target_id or payment_id = v_payment.id)
          and status = 'held';
    end if;

    -- In-app notification
    insert into public.notifications (
        user_id,
        type,
        payload
    ) values (
        v_payment.payer_id,
        'payment.failed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'purpose', v_payment.purpose,
            'reason', p_failure_reason
        )
    );

    -- Domain Event
    insert into public.domain_events (
        event_name,
        aggregate_type,
        aggregate_id,
        payload
    ) values (
        'payment.failed',
        'payment',
        v_payment.id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'failure_code', p_failure_code,
            'status', p_terminal_status
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', p_terminal_status
    );
end;
$$;


-- >>> Start of supabase/migrations/20261016000008_analytics_and_admin_rpc.sql <<<
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



-- Migration: 20261015000002_verification_triggers_and_views.sql
-- Phase 5: Verification Triggers, Quotas, and Views

-- 1. Quota Enforcement Trigger on portfolio_links (max 10 links per user)
create or replace function public.enforce_portfolio_link_limits()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_link_count integer;
begin
    select count(*) into v_link_count
    from public.portfolio_links
    where user_id = new.user_id;

    if v_link_count >= 10 then
        raise exception 'LINK_LIMIT_EXCEEDED: You cannot register more than 10 portfolio links.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_portfolio_link_limits on public.portfolio_links;
create trigger trg_enforce_portfolio_link_limits
    before insert on public.portfolio_links
    for each row
    execute function public.enforce_portfolio_link_limits();

-- 2. Quota Enforcement Trigger on media_assets (max 100 assets, max 200 MB per user)
create or replace function public.enforce_media_asset_limits()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_asset_count integer;
    v_total_bytes bigint;
begin
    select count(*), coalesce(sum(bytes), 0)
    into v_asset_count, v_total_bytes
    from public.media_assets
    where owner_id = new.owner_id and status != 'deleted';

    if v_asset_count >= 100 then
        raise exception 'MEDIA_LIMIT_EXCEEDED: You cannot exceed 100 media assets.';
    end if;

    if (v_total_bytes + new.bytes) > 209715200 then -- 200 MB
        raise exception 'STORAGE_QUOTA_EXCEEDED: You cannot exceed 200 MB of total media storage.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_media_asset_limits on public.media_assets;
create trigger trg_enforce_media_asset_limits
    before insert on public.media_assets
    for each row
    execute function public.enforce_media_asset_limits();

-- 3. Immutability trigger for verification_audit_log
create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
as $$
begin
    raise exception 'FORBIDDEN: verification_audit_log is append-only.';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.verification_audit_log;
create trigger trg_prevent_audit_log_modification
    before update or delete on public.verification_audit_log
    for each row
    execute function public.prevent_audit_log_modification();

-- 4. Recomputation function & trigger for provider_verification aggregate
create or replace function public.recompute_provider_verification(p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_verified_count integer;
    v_pending_count integer;
    v_first_verified timestamptz;
    v_old_status public.provider_verification_aggregate_status := 'none';
    v_new_status public.provider_verification_aggregate_status := 'none';
begin
    -- Get current status if exists
    select status into v_old_status
    from public.provider_verification
    where provider_id = p_provider_id;

    -- Count active verified links
    select count(*), min(verified_at)
    into v_verified_count, v_first_verified
    from public.portfolio_links
    where user_id = p_provider_id and status = 'verified';

    -- Count pending links
    select count(*)
    into v_pending_count
    from public.portfolio_links
    where user_id = p_provider_id and status in ('submitted', 'awaiting_proof', 'pending_review');

    if v_verified_count > 0 then
        v_new_status := 'verified';
    elsif v_pending_count > 0 then
        v_new_status := 'pending';
    else
        v_new_status := 'none';
    end if;

    insert into public.provider_verification (
        provider_id,
        status,
        verified_link_count,
        verified_since,
        updated_at
    )
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

    -- If provider lost verified status, emit domain event to trigger auto-pause check
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

    return jsonb_build_object(
        'provider_id', p_provider_id,
        'status', v_new_status,
        'verified_link_count', v_verified_count
    );
end;
$$;

-- Trigger to recompute on portfolio_links change
create or replace function public.trg_sync_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
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
    for each row
    execute function public.trg_sync_provider_verification();

-- 5. Public View for Verified Portfolio Links (Strict Whitelist)
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

comment on view public.public_verified_portfolio_links is 'Publicly readable list of verified portfolio links. Unverified and pending links are never exposed.';

-- 6. Update public_provider_profiles view with verification fields
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

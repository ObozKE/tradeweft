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

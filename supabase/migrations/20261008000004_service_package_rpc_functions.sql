-- Migration 20261008000004: Service Package Security Definer RPC Functions
-- Atomic state transitions, immutable snapshotting, domain events, and high-performance search

-- 1. Publish Service Package
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
    v_next_ver integer;
    v_snapshot jsonb;
    v_version_id uuid;
    v_seeking_categories jsonb;
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

    -- Enforce Per-Provider Limit on Active (published + paused) Packages (default 10)
    select count(*) into v_active_count
    from public.service_packages
    where provider_id = v_user_id
      and status in ('published', 'paused')
      and id <> p_package_id;

    if v_active_count >= 10 then
        raise exception 'LIMIT_EXCEEDED: Active package limit reached (maximum 10 allowed)';
    end if;

    -- Collect Seeking Categories for Snapshot
    select coalesce(jsonb_agg(jsonb_build_object('category_id', sc.category_id)), '[]'::jsonb)
    into v_seeking_categories
    from public.service_package_seeking_categories sc
    where sc.package_id = p_package_id;

    -- Next Version Number
    select coalesce(max(version_number), 0) + 1
    into v_next_ver
    from public.service_package_versions
    where package_id = p_package_id;

    -- Construct Immutable Snapshot
    v_snapshot := jsonb_build_object(
        'package_id', v_pkg.id,
        'provider_id', v_pkg.provider_id,
        'category_id', v_pkg.category_id,
        'title', v_pkg.title,
        'summary', v_pkg.summary,
        'description', v_pkg.description,
        'content_locale', v_pkg.content_locale,
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
        'seeking_categories', v_seeking_categories,
        'version_number', v_next_ver,
        'snapshot_created_at', now()
    );

    -- Insert Version Snapshot
    insert into public.service_package_versions (package_id, version_number, snapshot)
    values (p_package_id, v_next_ver, v_snapshot)
    returning id into v_version_id;

    -- Update Package Status
    update public.service_packages
    set status = 'published',
        current_version_id = v_version_id,
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = p_package_id;

    -- Insert Domain Event
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        'package.published',
        v_user_id,
        jsonb_build_object(
            'version_number', v_next_ver,
            'version_id', v_version_id,
            'country_code', v_pkg.country_code,
            'category_id', v_pkg.category_id
        )
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'version_number', v_next_ver,
        'status', 'published'
    );
end;
$$;

-- 2. Mutate Service Package Status (Pause / Archive)
create or replace function public.set_service_package_status(
    p_package_id uuid,
    p_status public.package_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_pkg record;
    v_active_count integer;
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if p_status = 'published' then
        raise exception 'INVALID_ACTION: Use publish_service_package to publish or unpause into published state';
    end if;

    if p_status = 'draft' and v_pkg.status <> 'draft' then
        raise exception 'INVALID_STATE: Published or archived packages cannot transition back to draft';
    end if;

    update public.service_packages
    set status = p_status,
        updated_at = now()
    where id = p_package_id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        case when p_status = 'paused' then 'package.paused'
             when p_status = 'archived' then 'package.archived'
             else 'package.status_changed' end,
        v_user_id,
        jsonb_build_object('old_status', v_pkg.status, 'new_status', p_status)
    );

    return jsonb_build_object(
        'success', true,
        'package_id', p_package_id,
        'status', p_status
    );
end;
$$;

-- 3. Delete Draft Package
create or replace function public.delete_service_package(
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
begin
    if v_user_id is null then
        raise exception 'AUTH_REQUIRED: Authenticated session required';
    end if;

    select * into v_pkg from public.service_packages where id = p_package_id;
    if v_pkg.id is null then
        raise exception 'NOT_FOUND: Package not found';
    end if;

    if v_pkg.provider_id <> v_user_id then
        raise exception 'FORBIDDEN: You do not own this package';
    end if;

    if v_pkg.status <> 'draft' then
        raise exception 'INVALID_STATE: Only drafts can be deleted. Published packages must be archived.';
    end if;

    delete from public.service_packages where id = p_package_id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, actor_id, payload)
    values (
        'service_package',
        p_package_id,
        'package.deleted',
        v_user_id,
        jsonb_build_object('title', v_pkg.title)
    );

    return jsonb_build_object('success', true, 'deleted_id', p_package_id);
end;
$$;

-- 4. Search and Browse Service Packages
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
    has_next_page boolean
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
begin
    if v_clean_query is not null then
        v_tsquery := plainto_tsquery('simple', v_clean_query);
    end if;

    return query
    with raw_results as (
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
            end as relevance_rank
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
          -- Category filtering (inclusive of child categories)
          and (
              p_category_id is null
              or sp.category_id = p_category_id
              or sp.category_id in (select sub_cat.id from public.service_categories sub_cat where sub_cat.parent_id = p_category_id)
          )
          -- Seeking Category filtering (inclusive of child categories)
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
          -- Location matching rule:
          -- If area is specified: exact neighborhood match OR remote delivery available
          and (
              p_area_id is null
              or sp.area_id = p_area_id
              or (sp.delivery_mode = 'remote' and (sp.city_id = p_city_id or p_city_id is null))
          )
          -- If city is specified (without area): city match OR remote delivery
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
          -- Keyset pagination cursor
          and (
              p_cursor_published_at is null
              or (sp.published_at, sp.id) < (p_cursor_published_at, p_cursor_id)
          )
        order by
            case when v_tsquery is not null then relevance_rank else 0 end desc,
            sp.published_at desc,
            sp.id desc
        limit v_limit + 1
    ),
    counted as (
        select *, count(*) over() as total_fetched from raw_results
    )
    select
        r.id,
        r.title,
        r.summary,
        r.category_id,
        r.category_slug,
        r.category_name,
        r.delivery_mode,
        r.country_code,
        r.city_id,
        r.city_name,
        r.area_id,
        r.area_name,
        r.turnaround_days,
        r.capacity_per_month,
        r.indicative_value_minor,
        r.currency_code,
        r.deliverables,
        r.exclusions,
        r.seeking_categories,
        r.provider_id,
        r.provider_display_name,
        r.provider_business_name,
        r.provider_avatar_url,
        r.provider_member_since,
        r.published_at,
        (r.total_fetched > v_limit) as has_next_page
    from counted r
    limit v_limit;
end;
$$;

grant execute on function public.publish_service_package(uuid) to authenticated;
grant execute on function public.set_service_package_status(uuid, public.package_status) to authenticated;
grant execute on function public.delete_service_package(uuid) to authenticated;
grant execute on function public.search_service_packages(text, text, uuid, uuid, uuid, uuid, public.delivery_mode, text, timestamptz, uuid, integer) to anon, authenticated;

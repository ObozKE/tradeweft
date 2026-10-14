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

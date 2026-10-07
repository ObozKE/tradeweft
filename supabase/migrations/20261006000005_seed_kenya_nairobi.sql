-- Migration 5: Seed Kenya and Nairobi Location Hierarchy
-- Uses idempotent upserts so re-running migrations is safe.

-- 1. Insert Country: Kenya
insert into public.countries (
    code,
    name,
    currency_code,
    default_locale,
    phone_code,
    timezone,
    is_active
) values (
    'KE',
    'Kenya',
    'KES',
    'en',
    '+254',
    'Africa/Nairobi',
    true
)
on conflict (code) do update set
    name = excluded.name,
    currency_code = excluded.currency_code,
    default_locale = excluded.default_locale,
    phone_code = excluded.phone_code,
    timezone = excluded.timezone,
    is_active = excluded.is_active;

-- 2. Insert Hierarchical Locations for Nairobi
do $$
declare
    v_region_id uuid;
    v_city_id uuid;
begin
    -- Top-level Region: Nairobi County
    insert into public.locations (country_code, parent_id, level, name, slug)
    values ('KE', null, 'region', 'Nairobi County', 'nairobi-county')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_region_id;

    if v_region_id is null then
        select id into v_region_id from public.locations 
        where parent_id is null and slug = 'nairobi-county';
    end if;

    -- City: Nairobi
    insert into public.locations (country_code, parent_id, level, name, slug)
    values ('KE', v_region_id, 'city', 'Nairobi', 'nairobi')
    on conflict (parent_id, slug) do update set name = excluded.name
    returning id into v_city_id;

    if v_city_id is null then
        select id into v_city_id from public.locations 
        where parent_id = v_region_id and slug = 'nairobi';
    end if;

    -- Neighborhood Areas in Nairobi
    insert into public.locations (country_code, parent_id, level, name, slug) values
        ('KE', v_city_id, 'area', 'Westlands', 'westlands'),
        ('KE', v_city_id, 'area', 'Kilimani', 'kilimani'),
        ('KE', v_city_id, 'area', 'Karen', 'karen'),
        ('KE', v_city_id, 'area', 'Upper Hill', 'upper-hill'),
        ('KE', v_city_id, 'area', 'Nairobi Central (CBD)', 'cbd'),
        ('KE', v_city_id, 'area', 'Parklands', 'parklands'),
        ('KE', v_city_id, 'area', 'Kileleshwa', 'kileleshwa'),
        ('KE', v_city_id, 'area', 'Lavington', 'lavington'),
        ('KE', v_city_id, 'area', 'Gigiri', 'gigiri'),
        ('KE', v_city_id, 'area', 'Industrial Area', 'industrial-area')
    on conflict (parent_id, slug) do update set name = excluded.name;

end $$;

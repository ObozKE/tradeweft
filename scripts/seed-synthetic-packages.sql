-- ==============================================================================
-- DEVELOPMENT / BENCHMARK SCRIPT ONLY (DO NOT RUN IN PRODUCTION)
-- Generates 1,000,000 synthetic service packages to verify index usage & EXPLAIN ANALYZE
-- ==============================================================================

do $$
declare
    v_provider_id uuid;
    v_categories uuid[];
    v_cities uuid[];
    v_areas uuid[];
    v_batch_size int := 50000;
    v_total int := 1000000;
    v_batches int := v_total / v_batch_size;
    b int;
begin
    -- 1. Ensure benchmark provider exists
    select id into v_provider_id from public.profiles limit 1;
    if v_provider_id is null then
        insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'benchmark_provider@example.com')
        on conflict (id) do nothing;
        insert into public.profiles (id, display_name, country_code, onboarding_completed_at)
        values ('99999999-9999-9999-9999-999999999999', 'Benchmark Provider', 'KE', now())
        on conflict (id) do nothing;
        v_provider_id := '99999999-9999-9999-9999-999999999999';
    end if;

    -- Collect category, city, and area IDs
    select array_agg(id) into v_categories from public.service_categories;
    select array_agg(id) into v_cities from public.locations where level = 'city';
    select array_agg(id) into v_areas from public.locations where level = 'area';

    raise notice 'Starting insertion of % synthetic packages in % batches...', v_total, v_batches;

    -- Disable triggers temporarily during bulk benchmark population
    alter table public.service_packages disable trigger tr_service_packages_integrity;
    alter table public.service_packages disable trigger tr_service_packages_updated_at;

    for b in 1..v_batches loop
        insert into public.service_packages (
            id,
            provider_id,
            category_id,
            status,
            title,
            summary,
            description,
            delivery_mode,
            country_code,
            city_id,
            area_id,
            turnaround_days,
            capacity_per_month,
            indicative_value_minor,
            currency_code,
            deliverables,
            exclusions,
            published_at,
            created_at,
            updated_at
        )
        select
            public.gen_uuidv7(),
            v_provider_id,
            v_categories[1 + mod(i, array_length(v_categories, 1))],
            'published'::public.package_status,
            'Professional Service Package #' || i || ' for Trade',
            'Synthetic benchmark summary number ' || i || ' offering high-tier professional skills.',
            'Detailed benchmark description for package ' || i || ' covering scope, tools, deliverables, and barter expectations across Nairobi businesses.',
            case mod(i, 3) when 0 then 'remote'::public.delivery_mode when 1 then 'in_person'::public.delivery_mode else 'hybrid'::public.delivery_mode end,
            'KE',
            v_cities[1 + mod(i, array_length(v_cities, 1))],
            v_areas[1 + mod(i, array_length(v_areas, 1))],
            1 + mod(i, 30),
            1 + mod(i, 10),
            (1000 + mod(i, 50000)) * 100,
            'KES',
            '["Benchmark deliverable 1", "Benchmark deliverable 2"]'::jsonb,
            '["Excluded cost item"]'::jsonb,
            now() - (mod(i, 365) || ' days')::interval,
            now() - (mod(i, 365) || ' days')::interval,
            now() - (mod(i, 365) || ' days')::interval
        from generate_series(((b - 1) * v_batch_size) + 1, b * v_batch_size) as s(i);

        raise notice 'Batch % of % completed...', b, v_batches;
    end loop;

    -- Re-enable triggers
    alter table public.service_packages enable trigger tr_service_packages_integrity;
    alter table public.service_packages enable trigger tr_service_packages_updated_at;

    -- Re-index and analyze
    vacuum analyze public.service_packages;

    raise notice 'Synthetic data generation complete. 1,000,000 packages ready for benchmark.';
end $$;

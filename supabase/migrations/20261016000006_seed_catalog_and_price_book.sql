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

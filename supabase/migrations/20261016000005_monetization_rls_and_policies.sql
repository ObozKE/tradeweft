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

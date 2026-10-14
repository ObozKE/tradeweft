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

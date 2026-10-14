-- Migration 20261013000004: Phase 3 Barter Agreements - Row Level Security (RLS) Policies
-- Zero IDOR: Non-parties receive empty rows (not found), never forbidden or existence leaks.
-- All mutations are routed through Security Definer RPCs; direct client mutations are disallowed.

-- 1. Enable RLS on all Phase 3 tables
alter table public.agreements enable row level security;
alter table public.agreement_revisions enable row level security;
alter table public.agreement_lines enable row level security;
alter table public.agreement_fulfilment enable row level security;
alter table public.agreement_events enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.agreement_contact_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_keys enable row level security;

-- 2. Agreements Policies
-- Non-parties cannot see or detect agreements
create policy "Parties can read own agreements"
    on public.agreements
    for select
    to authenticated
    using ((select auth.uid()) in (proposer_id, recipient_id));

-- Direct mutation is blocked for clients (RPC only)
-- No INSERT, UPDATE, DELETE policies granted to authenticated/anon

-- 3. Agreement Revisions Policies
create policy "Parties can read agreement revisions"
    on public.agreement_revisions
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_revisions.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 4. Agreement Lines Policies
create policy "Parties can read agreement lines"
    on public.agreement_lines
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreement_revisions r
            join public.agreements a on a.id = r.agreement_id
            where r.id = agreement_lines.revision_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 5. Fulfilment Policies
create policy "Parties can read fulfilment milestones"
    on public.agreement_fulfilment
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_fulfilment.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 6. Audit Events Policies
create policy "Parties can read agreement audit events"
    on public.agreement_events
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_events.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 7. Profile Contacts Policies (Owner only)
create policy "Users can read own profile contact"
    on public.profile_contacts
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can insert own profile contact"
    on public.profile_contacts
    for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users can update own profile contact"
    on public.profile_contacts
    for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users can delete own profile contact"
    on public.profile_contacts
    for delete
    to authenticated
    using (user_id = (select auth.uid()));

-- 8. Agreement Contact Shares Policies
create policy "Parties can read agreement contact shares"
    on public.agreement_contact_shares
    for select
    to authenticated
    using (
        exists (
            select 1 from public.agreements a
            where a.id = agreement_contact_shares.agreement_id
              and (select auth.uid()) in (a.proposer_id, a.recipient_id)
        )
    );

-- 9. Notifications Policies (Owner only)
create policy "Users can read own notifications"
    on public.notifications
    for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can update own notifications"
    on public.notifications
    for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- 10. Idempotency Keys Policies (Owner only)
create policy "Users can manage own idempotency keys"
    on public.idempotency_keys
    for all
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- 11. RPC Execution Grants
grant execute on function public.propose_agreement(uuid, jsonb, jsonb, text, text[], text) to authenticated;
grant execute on function public.counter_agreement(uuid, int, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.accept_agreement(uuid, int, text[], text) to authenticated;
grant execute on function public.decline_agreement(uuid, int, text) to authenticated;
grant execute on function public.withdraw_agreement(uuid, int, text) to authenticated;
grant execute on function public.mark_delivered(uuid, public.agreement_side, text) to authenticated;
grant execute on function public.confirm_receipt(uuid, public.agreement_side, text) to authenticated;
grant execute on function public.request_cancellation(uuid, text, text) to authenticated;
grant execute on function public.accept_cancellation(uuid, text) to authenticated;
grant execute on function public.open_dispute(uuid, text, text) to authenticated;
grant execute on function public.get_counterparty_contact(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.suggest_mutual_matches(int, int, uuid) to authenticated;

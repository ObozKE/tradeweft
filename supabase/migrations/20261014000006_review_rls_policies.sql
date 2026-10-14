-- Migration 20261014000006: Phase 4 Reviews & Public Trust Ledger - Row Level Security Policies
-- Enforces strict double-blind visibility: author can read their own review;
-- counterparty and the public can ONLY read once status is 'revealed'.

-- 1. Enable RLS
alter table public.trade_terms_versions enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.review_reports enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.provider_reputation enable row level security;
alter table public.reputation_flags enable row level security;
alter table public.review_moderation_log enable row level security;
alter table public.domain_event_deliveries enable row level security;

-- 2. Trade Terms Versions (Public Read)
create policy "Public can read trade terms versions"
    on public.trade_terms_versions for select
    to anon, authenticated
    using (true);

-- 3. Reviews Policies
-- DOUBLE-BLIND ENFORCEMENT:
-- The author can view their own review at any time (status submitted/revealed).
-- The reviewee and anonymous/authenticated public can ONLY read once status = 'revealed'.
create policy "Double-blind reviews select policy"
    on public.reviews for select
    to anon, authenticated
    using (
        reviewer_id = (select auth.uid()) 
        or status = 'revealed'
    );

-- Mutations restricted to Security Definer RPCs (submit_review, edit_review, withdraw_review)
-- No direct client INSERT, UPDATE, or DELETE policies granted on reviews.

-- 4. Review Replies Policies (Public Read)
create policy "Public can view review replies"
    on public.review_replies for select
    to anon, authenticated
    using (true);

-- 5. Review Reports Policies
-- Reporters can see their own filed reports; admins can view all reports
create policy "Reporters and admins can read reports"
    on public.review_reports for select
    to authenticated
    using (
        reporter_id = (select auth.uid())
        or exists (
            select 1 from public.user_roles 
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

-- 6. Public Trust Ledger Policies (Public Read)
-- Every user and anonymous visitor can verify completed trade history
create policy "Public can view trust ledger entries"
    on public.ledger_entries for select
    to anon, authenticated
    using (true);

-- 7. Provider Reputation Policies (Public Read)
create policy "Public can view provider reputation"
    on public.provider_reputation for select
    to anon, authenticated
    using (true);

-- 8. Reputation Flags Policies (Admin-only)
create policy "Admins can view reputation anomaly flags"
    on public.reputation_flags for select
    to authenticated
    using (
        exists (
            select 1 from public.user_roles 
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

-- 9. Review Moderation Log Policies (Admin-only)
create policy "Admins can view review moderation log"
    on public.review_moderation_log for select
    to authenticated
    using (
        exists (
            select 1 from public.user_roles 
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

-- 10. Domain Event Deliveries (Admin & Internal only)
create policy "Admins can view domain event deliveries"
    on public.domain_event_deliveries for select
    to authenticated
    using (
        exists (
            select 1 from public.user_roles 
            where user_id = (select auth.uid()) and role = 'admin'
        )
    );

-- 11. RPC Execution Grants
grant execute on function public.submit_review(uuid, int, int, int, int, boolean, text, text) to authenticated;
grant execute on function public.edit_review(uuid, int, int, int, int, boolean, text) to authenticated;
grant execute on function public.withdraw_review(uuid) to authenticated;
grant execute on function public.reply_to_review(uuid, text, text) to authenticated;
grant execute on function public.report_review(uuid, public.report_reason, text, text) to authenticated;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;
grant execute on function public.recompute_provider_reputation(uuid, timestamptz) to authenticated;
grant execute on function public.dispatch_domain_events(int) to authenticated, service_role;
grant execute on function public.check_review_windows_and_reveal() to authenticated, service_role;

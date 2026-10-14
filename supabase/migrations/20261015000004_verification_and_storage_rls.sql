-- Migration: 20261015000004_verification_and_storage_rls.sql
-- Phase 5: Row-Level Security Policies for Verification & Storage

-- 1. Enable RLS on all Phase 5 tables
alter table public.portfolio_links enable row level security;
alter table public.oauth_states enable row level security;
alter table public.provider_verification enable row level security;
alter table public.verification_audit_log enable row level security;
alter table public.media_assets enable row level security;
alter table public.package_media enable row level security;

-- 2. portfolio_links policies
create policy "Owners and verifiers can view portfolio links"
    on public.portfolio_links for select
    to authenticated
    using (user_id = auth.uid() or public.is_verifier_or_admin());

create policy "Users can insert own portfolio links"
    on public.portfolio_links for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own unverified portfolio links"
    on public.portfolio_links for update
    to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'))
    with check (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

create policy "Users can delete own unverified portfolio links"
    on public.portfolio_links for delete
    to authenticated
    using (user_id = auth.uid() and status in ('submitted', 'awaiting_proof', 'rejected'));

-- 3. oauth_states policies
create policy "Users can manage own oauth states"
    on public.oauth_states for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- 4. provider_verification policies (Public read, system write)
create policy "Public can view provider verification aggregates"
    on public.provider_verification for select
    to anon, authenticated
    using (true);

-- 5. verification_audit_log policies (Verifiers read-only)
create policy "Verifiers can view audit logs"
    on public.verification_audit_log for select
    to authenticated
    using (public.is_verifier_or_admin());

-- 6. media_assets policies
create policy "Users and verifiers can view media assets"
    on public.media_assets for select
    to authenticated
    using (owner_id = auth.uid() or public.is_verifier_or_admin() or bucket = 'public-media');

create policy "Users can insert own media asset records"
    on public.media_assets for insert
    to authenticated
    with check (owner_id = auth.uid());

create policy "Users can update own media asset records"
    on public.media_assets for update
    to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

create policy "Users can delete own media assets"
    on public.media_assets for delete
    to authenticated
    using (owner_id = auth.uid());

-- 7. package_media policies
create policy "Public can view package media"
    on public.package_media for select
    to anon, authenticated
    using (true);

create policy "Package owners can manage package media"
    on public.package_media for all
    to authenticated
    using (
        exists (
            select 1 from public.service_packages sp
            where sp.id = package_id and sp.provider_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.service_packages sp
            where sp.id = package_id and sp.provider_id = auth.uid()
        )
    );

-- 8. Storage RLS Policies on storage.objects
-- A. Quarantine Bucket
drop policy if exists "Authenticated users can upload to quarantine own folder" on storage.objects;
create policy "Authenticated users can upload to quarantine own folder"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'quarantine'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can read own quarantine objects" on storage.objects;
create policy "Users can read own quarantine objects"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'quarantine'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete own quarantine objects" on storage.objects;
create policy "Users can delete own quarantine objects"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'quarantine'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- B. Evidence Bucket
drop policy if exists "Users can upload to evidence own folder" on storage.objects;
create policy "Users can upload to evidence own folder"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'evidence'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Owners and verifiers can view evidence objects" on storage.objects;
create policy "Owners and verifiers can view evidence objects"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'evidence'
        and (
            (storage.foldername(name))[1] = auth.uid()::text
            or public.is_verifier_or_admin()
        )
    );

-- C. Public-Media Bucket
drop policy if exists "Public read for public-media" on storage.objects;
create policy "Public read for public-media"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'public-media');
-- Note: Zero client-facing insert/update/delete on public-media. Written strictly by server Sharp pipeline.

-- 9. Grants
grant select on public.public_verified_portfolio_links to anon, authenticated;
grant select on public.provider_verification to anon, authenticated;
grant select on public.package_media to anon, authenticated;

grant execute on function public.create_portfolio_link(text, text, text, text, public.verification_method) to authenticated;
grant execute on function public.submit_manual_evidence(uuid, uuid) to authenticated;
grant execute on function public.admin_review_link(uuid, text, text, text) to authenticated;
grant execute on function public.admin_revoke_link(uuid, text) to authenticated;

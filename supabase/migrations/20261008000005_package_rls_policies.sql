-- Migration 20261008000005: Row Level Security (RLS) Policies for Phase 2 Packages
-- Enforces Zero IDOR at the Postgres engine level.

-- 1. Enable RLS on all Phase 2 tables
alter table public.service_categories enable row level security;
alter table public.service_category_translations enable row level security;
alter table public.service_packages enable row level security;
alter table public.service_package_seeking_categories enable row level security;
alter table public.service_package_versions enable row level security;
alter table public.domain_events enable row level security;

-- 2. Service Categories Policies (Public reference data)
create policy "Allow read access to service categories"
    on public.service_categories
    for select
    to authenticated, anon
    using (true);

create policy "Allow read access to category translations"
    on public.service_category_translations
    for select
    to authenticated, anon
    using (true);

-- 3. Service Packages Policies
-- SELECT: Anyone can see published packages; providers can see their own packages in any status
create policy "Allow read access to published packages or own packages"
    on public.service_packages
    for select
    to authenticated, anon
    using (
        status = 'published'
        or (select auth.uid()) = provider_id
    );

-- INSERT: Providers can only insert their own draft packages
create policy "Providers can insert own draft packages"
    on public.service_packages
    for insert
    to authenticated
    with check (
        provider_id = (select auth.uid())
        and status = 'draft'
    );

-- UPDATE: Providers can update only their own packages (cannot directly set status to published via client)
create policy "Providers can update own packages"
    on public.service_packages
    for update
    to authenticated
    using (provider_id = (select auth.uid()))
    with check (
        provider_id = (select auth.uid())
        and (status <> 'published' or (select status from public.service_packages where id = service_packages.id) = 'published')
    );

-- DELETE: Providers can delete only their own draft packages
create policy "Providers can delete own draft packages"
    on public.service_packages
    for delete
    to authenticated
    using (
        provider_id = (select auth.uid())
        and status = 'draft'
    );

-- 4. Seeking Categories Policies
create policy "Allow read seeking categories for published or own packages"
    on public.service_package_seeking_categories
    for select
    to authenticated, anon
    using (
        exists (
            select 1 from public.service_packages sp
            where sp.id = service_package_seeking_categories.package_id
              and (sp.status = 'published' or sp.provider_id = (select auth.uid()))
        )
    );

create policy "Providers can manage seeking categories for own packages"
    on public.service_package_seeking_categories
    for all
    to authenticated
    using (
        exists (
            select 1 from public.service_packages sp
            where sp.id = service_package_seeking_categories.package_id
              and sp.provider_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1 from public.service_packages sp
            where sp.id = service_package_seeking_categories.package_id
              and sp.provider_id = (select auth.uid())
        )
    );

-- 5. Service Package Versions Policies
-- Read-only to public for published packages, and to provider for own packages
create policy "Allow read access to versions of published or own packages"
    on public.service_package_versions
    for select
    to authenticated, anon
    using (
        exists (
            select 1 from public.service_packages sp
            where sp.id = service_package_versions.package_id
              and (sp.status = 'published' or sp.provider_id = (select auth.uid()))
        )
    );

-- ZERO INSERT / UPDATE / DELETE policies on service_package_versions.
-- Versions are inserted exclusively by SECURITY DEFINER function `publish_service_package`.

-- 6. Domain Events Outbox
-- ZERO client policies. Table is completely internal to backend operations and background consumers.

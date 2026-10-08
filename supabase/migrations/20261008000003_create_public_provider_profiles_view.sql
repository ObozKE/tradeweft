-- Migration 20261008000003: Public Provider Profiles View
-- Whitelists strictly public metadata for providers who have at least one published package.
-- Runs with view owner privileges (Postgres SECURITY DEFINER semantics) because the underlying
-- `profiles` table is strictly owner-only under RLS (select auth.uid() = id).
-- This view safely exposes public directory fields while protecting all sensitive fields
-- (e.g., terms_accepted_at, terms_version, locale, onboarding state).

create or replace view public.public_provider_profiles
with (security_invoker = false)
as
select
    p.id,
    p.display_name,
    p.business_name,
    p.avatar_url,
    p.city_id,
    p.area_id,
    p.created_at as member_since
from public.profiles p
where exists (
    select 1
    from public.service_packages sp
    where sp.provider_id = p.id
      and sp.status = 'published'
);

comment on view public.public_provider_profiles is 
'Publicly safe provider profiles view for marketplace exploration. Only includes users with active published packages. Protects private columns.';

-- Allow anonymous visitors and authenticated users to view public provider profiles
grant select on public.public_provider_profiles to anon, authenticated;

-- Migration 20261013000002: Phase 3 Barter Agreements - Integrity Triggers & Indexes
-- Enforces immutability, line constraints, turn validation, and scale-optimized indexes.

-- 1. Updated At Triggers
drop trigger if exists tr_agreements_updated_at on public.agreements;
create trigger tr_agreements_updated_at
    before update on public.agreements
    for each row
    execute function public.handle_updated_at();

drop trigger if exists tr_profile_contacts_updated_at on public.profile_contacts;
create trigger tr_profile_contacts_updated_at
    before update on public.profile_contacts
    for each row
    execute function public.handle_updated_at();

-- 2. Partial Unique Index & Query Indexes
-- Exactly one open negotiation per user pair (canonicalized least/greatest)
create unique index if not exists idx_unique_open_negotiation_pair 
    on public.agreements (least(proposer_id, recipient_id), greatest(proposer_id, recipient_id))
    where status = 'proposed';

-- Hot query paths for dashboard tabs
create index if not exists idx_agreements_proposer_status 
    on public.agreements (proposer_id, status, updated_at desc);

create index if not exists idx_agreements_recipient_status 
    on public.agreements (recipient_id, status, updated_at desc);

-- Expiry sweep index (partial for proposed agreements)
create index if not exists idx_agreements_expires_at 
    on public.agreements (expires_at) 
    where status = 'proposed';

-- Revisions and Lines
create index if not exists idx_agreement_revisions_lookup 
    on public.agreement_revisions (agreement_id, revision_no desc);

create index if not exists idx_agreement_lines_revision 
    on public.agreement_lines (revision_id);

create index if not exists idx_agreement_lines_pkg_version 
    on public.agreement_lines (package_version_id);

-- Events and Notifications
create index if not exists idx_agreement_events_timeline 
    on public.agreement_events (agreement_id, created_at asc);

create index if not exists idx_notifications_user_inbox 
    on public.notifications (user_id, read_at, created_at desc);

-- 3. Immutability Triggers (Block UPDATE & DELETE on revisions, lines, events)
create or replace function public.prevent_agreement_revisions_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement revisions are strictly immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_revisions_mutation on public.agreement_revisions;
create trigger tr_block_agreement_revisions_mutation
    before update or delete on public.agreement_revisions
    for each row
    execute function public.prevent_agreement_revisions_mutation();

create or replace function public.prevent_agreement_lines_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement lines are strictly immutable and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_lines_mutation on public.agreement_lines;
create trigger tr_block_agreement_lines_mutation
    before update or delete on public.agreement_lines
    for each row
    execute function public.prevent_agreement_lines_mutation();

create or replace function public.prevent_agreement_events_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Agreement audit events are append-only and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_agreement_events_mutation on public.agreement_events;
create trigger tr_block_agreement_events_mutation
    before update or delete on public.agreement_events
    for each row
    execute function public.prevent_agreement_events_mutation();

-- 4. Line Integrity Trigger (Ownership, capacity, line count & same country)
create or replace function public.validate_agreement_line_integrity()
returns trigger
language plpgsql
as $$
declare
    v_agr record;
    v_pkg_ver record;
    v_line_count integer;
    v_expected_provider uuid;
begin
    -- 1. Fetch parent agreement details
    select a.id, a.country_code, a.proposer_id, a.recipient_id, a.status
    into v_agr
    from public.agreement_revisions r
    join public.agreements a on a.id = r.agreement_id
    where r.id = new.revision_id;

    if v_agr.id is null then
        raise exception 'INVALID_REVISION: Agreement revision not found';
    end if;

    if v_agr.status <> 'proposed' then
        raise exception 'INVALID_STATE: Lines can only be created for proposed agreements';
    end if;

    -- 2. Determine expected provider based on side
    if new.side = 'proposer_gives' then
        v_expected_provider := v_agr.proposer_id;
    elsif new.side = 'recipient_gives' then
        v_expected_provider := v_agr.recipient_id;
    else
        raise exception 'INVALID_SIDE: Unknown agreement side %', new.side;
    end if;

    -- 3. Fetch referenced service package version
    select spv.id, spv.package_id, spv.snapshot
    into v_pkg_ver
    from public.service_package_versions spv
    where spv.id = new.package_version_id;

    if v_pkg_ver.id is null then
        raise exception 'VERSION_NOT_FOUND: Referenced service package version does not exist';
    end if;

    -- 4. Ownership verification: version must belong to the giving side's provider
    if (v_pkg_ver.snapshot->>'provider_id')::uuid <> v_expected_provider then
        raise exception 'PROVIDER_MISMATCH: Service package version does not belong to giving party';
    end if;

    -- 5. Country verification: package country must match agreement country
    if (v_pkg_ver.snapshot->>'country_code') <> v_agr.country_code then
        raise exception 'COUNTRY_MISMATCH: Package country % does not match agreement country %',
            (v_pkg_ver.snapshot->>'country_code'), v_agr.country_code;
    end if;

    -- 6. Capacity verification (if package has capacity_per_month defined)
    if (v_pkg_ver.snapshot->>'capacity_per_month') is not null then
        if new.quantity > (v_pkg_ver.snapshot->>'capacity_per_month')::integer then
            raise exception 'CAPACITY_EXCEEDED: Quantity % exceeds monthly package capacity %',
                new.quantity, (v_pkg_ver.snapshot->>'capacity_per_month')::integer;
        end if;
    end if;

    -- 7. Line count cap: At most 3 lines per side for this revision
    select count(*) into v_line_count
    from public.agreement_lines
    where revision_id = new.revision_id
      and side = new.side;

    if v_line_count >= 3 then
        raise exception 'LINE_LIMIT_EXCEEDED: At most 3 lines allowed per side';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_agreement_line on public.agreement_lines;
create trigger tr_validate_agreement_line
    before insert on public.agreement_lines
    for each row
    execute function public.validate_agreement_line_integrity();

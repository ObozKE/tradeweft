-- Migration 20261014000002: Phase 4 Reviews & Public Trust Ledger - Integrity Triggers
-- Enforces review eligibility, window boundaries, reply authorship, and ledger immutability.

-- 1. Updated At Trigger on Reviews
drop trigger if exists tr_reviews_updated_at on public.reviews;
create trigger tr_reviews_updated_at
    before update on public.reviews
    for each row
    execute function public.handle_updated_at();

-- 2. Immutability Triggers (Ledger entries and Review replies are strictly immutable)
create or replace function public.prevent_ledger_entries_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Ledger entries are strictly insert-only and cannot be updated or deleted.';
end;
$$;

drop trigger if exists tr_block_ledger_entries_mutation on public.ledger_entries;
create trigger tr_block_ledger_entries_mutation
    before update or delete on public.ledger_entries
    for each row
    execute function public.prevent_ledger_entries_mutation();

create or replace function public.prevent_review_replies_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Review replies are strictly immutable once posted.';
end;
$$;

drop trigger if exists tr_block_review_replies_mutation on public.review_replies;
create trigger tr_block_review_replies_mutation
    before update or delete on public.review_replies
    for each row
    execute function public.prevent_review_replies_mutation();

-- 3. Review Submission Integrity Trigger
create or replace function public.validate_review_submission()
returns trigger
language plpgsql
as $$
declare
    v_agr record;
begin
    -- 1. Fetch parent agreement
    select id, proposer_id, recipient_id, status, completed_at
    into v_agr
    from public.agreements
    where id = new.agreement_id;

    if v_agr.id is null then
        raise exception 'AGREEMENT_NOT_FOUND: Referenced barter agreement does not exist';
    end if;

    -- 2. Agreement must be completed
    if v_agr.status <> 'completed' or v_agr.completed_at is null then
        raise exception 'AGREEMENT_NOT_COMPLETED: Reviews can only be submitted for completed barter trades';
    end if;

    -- 3. Parties verification
    if new.reviewer_id not in (v_agr.proposer_id, v_agr.recipient_id) then
        raise exception 'NOT_A_PARTY: Only confirmed participants of the agreement can submit a review';
    end if;

    -- Reviewee must be the other party
    if new.reviewer_id = v_agr.proposer_id and new.reviewee_id <> v_agr.recipient_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;
    if new.reviewer_id = v_agr.recipient_id and new.reviewee_id <> v_agr.proposer_id then
        raise exception 'INVALID_REVIEWEE: Reviewee must be the trade counterparty';
    end if;

    -- 4. Review window check (14 days from completed_at)
    if now() > (v_agr.completed_at + interval '14 days') then
        raise exception 'WINDOW_CLOSED: The 14-day review window for this trade has closed';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_review_submission on public.reviews;
create trigger tr_validate_review_submission
    before insert on public.reviews
    for each row
    execute function public.validate_review_submission();

-- 4. Review Reply Integrity Trigger
create or replace function public.validate_review_reply()
returns trigger
language plpgsql
as $$
declare
    v_rev record;
begin
    select id, reviewee_id, status into v_rev
    from public.reviews
    where id = new.review_id;

    if v_rev.id is null then
        raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist';
    end if;

    -- Must be revealed
    if v_rev.status <> 'revealed' then
        raise exception 'REVIEW_NOT_REVEALED: Replies can only be posted to publicly revealed reviews';
    end if;

    -- Author must be the reviewee
    if new.author_id <> v_rev.reviewee_id then
        raise exception 'FORBIDDEN: Only the recipient (reviewee) of a review can post a public reply';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_review_reply on public.review_replies;
create trigger tr_validate_review_reply
    before insert on public.review_replies
    for each row
    execute function public.validate_review_reply();

-- 5. Review Report Integrity Trigger
create or replace function public.validate_review_report()
returns trigger
language plpgsql
as $$
declare
    v_rev record;
begin
    select id, reviewee_id into v_rev
    from public.reviews
    where id = new.review_id;

    if v_rev.id is null then
        raise exception 'REVIEW_NOT_FOUND: Referenced review does not exist';
    end if;

    -- Only reviewee can report
    if new.reporter_id <> v_rev.reviewee_id then
        raise exception 'FORBIDDEN: Only the reviewee can report a review for moderation';
    end if;

    return new;
end;
$$;

drop trigger if exists tr_validate_review_report on public.review_reports;
create trigger tr_validate_review_report
    before insert on public.review_reports
    for each row
    execute function public.validate_review_report();

-- 6. Expand public_provider_profiles View
-- Include providers with at least one published package OR at least one public ledger entry
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
)
or exists (
    select 1
    from public.ledger_entries le
    where le.provider_id = p.id
);

comment on view public.public_provider_profiles is 
'Publicly safe provider profiles view. Exposes users with active published packages or completed public ledger history. Protects private columns.';

grant select on public.public_provider_profiles to anon, authenticated;

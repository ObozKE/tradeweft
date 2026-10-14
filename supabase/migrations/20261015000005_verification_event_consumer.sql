-- ============================================================================
-- Trade Weft — Phase 5: Verification Auto-Pause Event Consumer
-- Wires verification.status.changed events to auto-pause service packages
-- when a provider drops below their country's publish gate requirement.
-- ============================================================================

create or replace function public.enqueue_pending_domain_event_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_enqueued integer := 0;
begin
    -- 1. Trust ledger consumer for completed agreements
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'trust_ledger', 'pending', now()
    from public.domain_events de
    where de.event_type = 'agreement.completed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'trust_ledger')
    on conflict (event_id, consumer) do nothing;

    -- 2. Reviews reputation consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'reviews_reputation', 'pending', now()
    from public.domain_events de
    where de.event_type in ('review.revealed', 'review.moderated')
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'reviews_reputation')
    on conflict (event_id, consumer) do nothing;

    -- 3. Verification auto-pause consumer
    insert into public.domain_event_deliveries (event_id, consumer, status, next_attempt_at)
    select de.id, 'verification_auto_pause', 'pending', now()
    from public.domain_events de
    where de.event_type = 'verification.status.changed'
      and not exists (select 1 from public.domain_event_deliveries ded where ded.event_id = de.id and ded.consumer = 'verification_auto_pause')
    on conflict (event_id, consumer) do nothing;

    return v_enqueued;
end;
$$;

create or replace function public.dispatch_domain_events(p_batch_size integer default 20)
returns table (processed_count integer, failed_count integer, dead_letter_count integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_processed integer := 0; v_failed integer := 0; v_dead_letter integer := 0;
    v_row record; v_de record; v_err text;
begin
    perform public.enqueue_pending_domain_event_deliveries();

    for v_row in 
        select ded.* from public.domain_event_deliveries ded
        where ded.status in ('pending', 'processing') and ded.next_attempt_at <= now()
        order by ded.next_attempt_at asc limit least(coalesce(p_batch_size, 20), 100)
        for update skip locked
    loop
        select * into v_de from public.domain_events where id = v_row.event_id;

        begin
            if v_row.consumer = 'trust_ledger' and v_de.event_type = 'agreement.completed' then
                perform public.process_agreement_completed_event(v_de.id, v_de.payload);
            elsif v_row.consumer = 'reviews_reputation' and v_de.event_type in ('review.revealed', 'review.moderated') then
                perform public.process_review_events(v_de.id, v_de.event_type, v_de.payload);
            elsif v_row.consumer = 'verification_auto_pause' and v_de.event_type = 'verification.status.changed' then
                perform public.system_pause_packages_for_unverified(v_de.aggregate_id);
            end if;

            update public.domain_event_deliveries
            set status = 'delivered', attempts = attempts + 1, last_error = null, processed_at = now()
            where id = v_row.id;
            v_processed := v_processed + 1;
        exception when others then
            v_err := SQLERRM;
            if v_row.attempts + 1 >= 5 then
                update public.domain_event_deliveries
                set status = 'dead_letter', attempts = attempts + 1, last_error = v_err, processed_at = now()
                where id = v_row.id;
                v_dead_letter := v_dead_letter + 1;
            else
                update public.domain_event_deliveries
                set status = 'pending', attempts = attempts + 1, last_error = v_err,
                    next_attempt_at = now() + (power(2, v_row.attempts) * interval '30 seconds')
                where id = v_row.id;
                v_failed := v_failed + 1;
            end if;
        end;
    end loop;

    return query select v_processed, v_failed, v_dead_letter;
end;
$$;

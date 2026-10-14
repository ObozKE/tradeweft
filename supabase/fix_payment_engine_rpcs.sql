-- Payment Engine RPC Functions
-- Run this in Supabase SQL Editor

-- 1. Helper: Rank Synchronization
create or replace function public.sync_provider_rank_ts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rank_bonus integer := 0;
begin
    -- Safely update rank_ts if column exists on service_packages
    update public.service_packages
    set rank_ts = coalesce(published_at, now()) + (v_rank_bonus || ' days')::interval
    where provider_id = p_user_id
      and status = 'published'
      and published_at is not null;
exception when others then
    null;
end;
$$;

-- 2. Atomic Settlement RPC Function
create or replace function public.settle_payment_transaction(
    p_payment_id uuid,
    p_checkout_request_id text,
    p_receipt_number text,
    p_verified_amount_minor bigint,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
    v_promo record;
    v_sub record;
    v_duration_days integer := 7;
begin
    -- 1. Lock payment row
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    -- Idempotency: If already succeeded, return immediately with success
    if v_payment.status = 'succeeded' then
        return jsonb_build_object(
            'success', true,
            'payment_id', v_payment.id,
            'status', 'succeeded',
            'already_settled', true
        );
    end if;

    if v_payment.status not in ('created', 'pending') then
        raise exception 'INVALID_STATE: Payment status is % and cannot be settled', v_payment.status;
    end if;

    -- Strict Amount Verification
    if v_payment.amount_minor <> p_verified_amount_minor then
        raise exception 'AMOUNT_MISMATCH: Invoiced amount (%) does not match provider verified amount (%)',
            v_payment.amount_minor, p_verified_amount_minor;
    end if;

    -- 2. Transition Payment to Succeeded
    update public.payments
    set status = 'succeeded',
        receipt_number = p_receipt_number,
        checkout_request_id = coalesce(checkout_request_id, p_checkout_request_id),
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- 3. Insert Append-Only Ledger Entry
    insert into public.payment_ledger (
        payment_id,
        payer_id,
        entry_type,
        amount_minor,
        currency_code,
        reference_note
    ) values (
        v_payment.id,
        v_payment.payer_id,
        'charge',
        v_payment.amount_minor,
        v_payment.currency_code,
        coalesce(p_note, 'M-Pesa Receipt: ' || p_receipt_number)
    );

    -- 4. Product Fulfillment based on purpose
    if v_payment.purpose = 'top_ad' then
        select lp.*, ap.duration_days
        into v_promo
        from public.listing_promotions lp
        left join public.ad_products ap on ap.id = (v_payment.price_snapshot->>'productId')
        where lp.id = v_payment.target_id or lp.payment_id = v_payment.id
        limit 1;

        if v_promo.id is not null then
            v_duration_days := coalesce(v_promo.duration_days, 7);

            update public.listing_promotions
            set status = 'active',
                payment_id = v_payment.id,
                period = tstzrange(clock_timestamp(), clock_timestamp() + (v_duration_days || ' days')::interval),
                updated_at = clock_timestamp()
            where id = v_promo.id;

            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'promotion.started',
                jsonb_build_object(
                    'promotion_id', v_promo.id,
                    'package_id', v_promo.package_id,
                    'receipt_number', p_receipt_number,
                    'duration_days', v_duration_days
                )
            );
        end if;

    elsif v_payment.purpose = 'boost_period' then
        select * into v_sub
        from public.subscriptions
        where id = v_payment.target_id or user_id = v_payment.payer_id
        order by created_at desc
        limit 1;

        if v_sub.id is not null then
            update public.subscriptions
            set status = 'active',
                current_period_start = clock_timestamp(),
                current_period_end = clock_timestamp() + interval '30 days',
                grace_period_end = clock_timestamp() + interval '33 days',
                latest_payment_id = v_payment.id,
                updated_at = clock_timestamp()
            where id = v_sub.id;

            update public.subscription_invoices
            set status = 'paid',
                payment_id = v_payment.id,
                paid_at = clock_timestamp()
            where subscription_id = v_sub.id and status = 'pending';

            begin
                perform public.sync_provider_rank_ts(v_payment.payer_id);
            exception when others then
                null;
            end;

            insert into public.notifications (
                user_id,
                type,
                payload
            ) values (
                v_payment.payer_id,
                'subscription.renewed',
                jsonb_build_object(
                    'subscription_id', v_sub.id,
                    'plan_id', v_sub.plan_id,
                    'receipt_number', p_receipt_number
                )
            );
        end if;
    end if;

    -- 5. Outbox Domain Event
    insert into public.domain_events (
        event_type,
        aggregate_type,
        aggregate_id,
        actor_id,
        payload
    ) values (
        'payment.succeeded',
        'payment',
        v_payment.id,
        v_payment.payer_id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'purpose', v_payment.purpose,
            'amount_minor', v_payment.amount_minor,
            'receipt_number', p_receipt_number
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', 'succeeded',
        'receipt_number', p_receipt_number
    );
end;
$$;

-- 3. Atomic Failure / Cancellation RPC Function
create or replace function public.fail_payment_transaction(
    p_payment_id uuid,
    p_failure_code text,
    p_failure_reason text,
    p_terminal_status public.payment_status default 'failed'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment record;
begin
    select * into v_payment
    from public.payments
    where id = p_payment_id
    for update;

    if v_payment.id is null then
        raise exception 'PAYMENT_NOT_FOUND: Payment with ID % not found', p_payment_id;
    end if;

    if v_payment.status = 'succeeded' then
        raise exception 'INVALID_STATE: Cannot fail an already settled payment';
    end if;

    update public.payments
    set status = p_terminal_status,
        failure_code = p_failure_code,
        failure_reason = p_failure_reason,
        updated_at = clock_timestamp()
    where id = v_payment.id;

    -- Release held promotion
    if v_payment.purpose = 'top_ad' then
        update public.listing_promotions
        set status = 'cancelled',
            updated_at = clock_timestamp()
        where (id = v_payment.target_id or payment_id = v_payment.id)
          and status = 'held';
    end if;

    -- In-app notification
    insert into public.notifications (
        user_id,
        type,
        payload
    ) values (
        v_payment.payer_id,
        'payment.failed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'purpose', v_payment.purpose,
            'reason', p_failure_reason
        )
    );

    -- Domain Event
    insert into public.domain_events (
        event_type,
        aggregate_type,
        aggregate_id,
        actor_id,
        payload
    ) values (
        'payment.failed',
        'payment',
        v_payment.id,
        v_payment.payer_id,
        jsonb_build_object(
            'payment_id', v_payment.id,
            'payer_id', v_payment.payer_id,
            'failure_code', p_failure_code,
            'status', p_terminal_status
        )
    );

    return jsonb_build_object(
        'success', true,
        'payment_id', v_payment.id,
        'status', p_terminal_status
    );
end;
$$;

-- 4. Reload PostgREST Schema Cache
notify pgrst, 'reload schema';

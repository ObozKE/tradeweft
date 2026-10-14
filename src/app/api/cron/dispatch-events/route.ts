import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  return handleCron(req);
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  // Verify Bearer token authorization
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn({ event: 'cron.unauthorized_attempt' }, 'Unauthorized cron execution attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('CRON_SECRET environment variable is missing in production. Failing closed.');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const startTime = Date.now();
  let supabase;

  try {
    supabase = createAdminClient();
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to initialize Supabase admin client for cron');
    return NextResponse.json({ error: 'Database client initialization failed' }, { status: 500 });
  }

  try {
    // 1. Dispatch and consume pending domain events
    const { data: dispatchResult, error: dispatchError } = await supabase.rpc(
      'dispatch_domain_events',
      { p_batch_size: 50 }
    );

    if (dispatchError) {
      logger.error(
        { error: dispatchError.message, event: 'cron.dispatch_domain_events_error' },
        'Error during dispatch_domain_events RPC'
      );
    }

    // 2. Check expired review windows and trigger double-blind reveals
    const { data: revealResult, error: revealError } = await supabase.rpc(
      'check_review_windows_and_reveal'
    );

    if (revealError) {
      logger.error(
        { error: revealError.message, event: 'cron.check_review_windows_error' },
        'Error during check_review_windows_and_reveal RPC'
      );
    }

    // 3. Payments reconciliation and subscription/promotions sweep
    const { runPaymentsReconciliation } = await import(
      '@/features/payments/services/reconciliation.service'
    );
    const reconciliationResult = await runPaymentsReconciliation();

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        dispatchResult,
        revealResult,
        reconciliationResult,
        durationMs,
        event: 'cron.events_dispatched_successfully',
      },
      'Domain event dispatcher, review window sweep, and payments reconciliation completed'
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      events: dispatchResult ?? null,
      reviewWindows: revealResult ?? null,
      paymentsReconciliation: reconciliationResult ?? null,
    });
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Unhandled error in cron event dispatcher');
    return NextResponse.json(
      { error: 'Internal worker execution error', details: error?.message },
      { status: 500 }
    );
  }
}

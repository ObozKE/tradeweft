import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runPaymentsReconciliation } from '@/features/payments/services/reconciliation.service';

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

  try {
    const summary = await runPaymentsReconciliation();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      summary,
    });
  } catch (error: any) {
    logger.error({ error: error?.message, event: 'cron.reconciliation_failed' });
    return NextResponse.json(
      { error: 'Internal worker execution error', details: error?.message },
      { status: 500 }
    );
  }
}

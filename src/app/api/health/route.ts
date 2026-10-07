import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'healthy';
  let latencyMs = 0;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('countries').select('code').limit(1);
    latencyMs = Date.now() - startTime;

    if (error) {
      dbStatus = 'degraded';
    }
  } catch {
    dbStatus = 'unreachable';
  }

  const responseBody = {
    status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
    service: 'tradeweft-api',
    database: dbStatus,
    latencyMs,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    launchRegion: 'Nairobi (KE)',
  };

  return NextResponse.json(responseBody, {
    status: dbStatus === 'healthy' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

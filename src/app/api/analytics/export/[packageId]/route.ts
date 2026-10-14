import { NextRequest, NextResponse } from 'next/server';
import { requireOnboardedUser } from '@/server/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserEntitlements } from '@/features/payments/utils/entitlements';

interface RouteProps {
  params: Promise<{ packageId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  const { packageId } = await params;
  const { user } = await requireOnboardedUser();

  const adminSupabase = createAdminClient();

  // 1. Verify Ownership
  const { data: pkg, error: pkgErr } = await adminSupabase
    .from('service_packages')
    .select('id, provider_id, title')
    .eq('id', packageId)
    .single();

  if (pkgErr || !pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  if (pkg.provider_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Check Entitlements (Enterprise or CSV Export Entitlement)
  const entitlements = await getUserEntitlements(user.id);
  if (!entitlements.csv_export && entitlements.plan_id !== 'enterprise') {
    return NextResponse.json(
      { error: 'CSV export requires Boost Enterprise plan' },
      { status: 403 }
    );
  }

  // 3. Query Daily Stats
  const { data: stats, error: statsErr } = await adminSupabase
    .from('package_daily_stats')
    .select('*')
    .eq('package_id', packageId)
    .order('date', { ascending: false });

  if (statsErr) {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }

  // 4. Format CSV Stream
  const csvRows = ['Date,Impressions,Views,Proposal Starts,Conversion Rate (%)'];

  (stats || []).forEach((row) => {
    const ctr =
      row.impressions > 0
        ? ((row.views / row.impressions) * 100).toFixed(2)
        : '0.00';
    csvRows.push(
      `${row.date},${row.impressions},${row.views},${row.proposal_starts},${ctr}`
    );
  });

  const csvContent = csvRows.join('\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tradeweft-analytics-${packageId.slice(0, 8)}.csv"`,
    },
  });
}

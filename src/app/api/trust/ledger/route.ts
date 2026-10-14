import { NextRequest, NextResponse } from 'next/server';
import { getProviderLedgerKeyset } from '@/features/trust/queries/trust.queries';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get('providerId');
  const cursorCompletedAt = searchParams.get('cursorCompletedAt') || undefined;
  const cursorId = searchParams.get('cursorId') || undefined;
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 10));

  if (!providerId) {
    return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
  }

  const result = await getProviderLedgerKeyset({
    providerId,
    limit,
    cursorCompletedAt,
    cursorId,
  });

  return NextResponse.json(result);
}

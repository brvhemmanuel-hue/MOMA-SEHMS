import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { exportEntity } from '@/lib/templates';
import { IMPORT_ORDER, type EntityKey } from '@/lib/import-defs';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { entity: string } }) {
  const s = await getSession();
  if (!s || s.role !== 'school_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!IMPORT_ORDER.includes(params.entity as EntityKey)) return NextResponse.json({ error: 'Unknown type' }, { status: 404 });
  await audit(s.userId, 'export.reconciliation', 'export', params.entity);
  return new NextResponse(await exportEntity(params.entity as EntityKey) as any, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="MOMA-${params.entity}-export.xlsx"`, 'Cache-Control': 'private, no-store' } });
}

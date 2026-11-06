import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { entityTemplate, templateWorkbook } from '@/lib/templates';
import { IMPORT_ORDER, type EntityKey } from '@/lib/import-defs';

export const dynamic = 'force-dynamic';

/** GET /api/templates                      all sheets in one workbook
 *  GET /api/templates?entity=classes&format=xlsx|csv   one sheet, Excel or CSV */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const entity = req.nextUrl.searchParams.get('entity') as EntityKey | null;
  const allowed = s && (s.role === 'school_admin' || (s.role === 'teacher' && entity === 'students'));
  if (!s || !allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (entity) {
    if (!IMPORT_ORDER.includes(entity)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
    const f = await entityTemplate(entity, req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx');
    return new NextResponse(f.body as any, { headers: { ...headers, 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.name}"` } });
  }
  return new NextResponse(await templateWorkbook() as any, { headers: { ...headers,
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="School_Data_Import_Templates.xlsx"' } });
}

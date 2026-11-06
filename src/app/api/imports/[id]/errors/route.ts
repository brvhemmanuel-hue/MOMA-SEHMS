import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { ENTITIES, type EntityKey } from '@/lib/import-defs';
import { safeCell } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || (s.role !== 'school_admin' && s.role !== 'teacher') || !/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await one<any>('select entity_type from import_batches where id=$1 and uploaded_by=$2', [params.id, s.userId]);
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const headers = ENTITIES[b.entity_type as EntityKey].headers;
  const rows = await query<any>(`select row_number, outcome, payload, messages from import_rows where batch_id=$1 and (outcome in ('error','failed','warning')) order by row_number`, [params.id]);
  const format = req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const table = [['row', ...headers, 'problem'], ...rows.map((r) => [r.row_number, ...headers.map((h) => safeCell(r.payload?.raw?.[h] ?? '')), (r.messages as string[]).join(' ')])];
  if (format === 'csv') {
    const csv = table.map((r) => r.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n');
    return new NextResponse('\ufeff' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="import-errors.csv"', 'Cache-Control': 'private, no-store' } });
  }
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Rejected rows');
  table.forEach((r) => ws.addRow(r)); ws.getRow(1).font = { bold: true }; ws.columns.forEach((c) => { c.width = 22; });
  return new NextResponse(Buffer.from(await wb.xlsx.writeBuffer()) as any, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="import-errors.xlsx"', 'Cache-Control': 'private, no-store' } });
}

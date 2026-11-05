import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateWorkbook } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  if (!s || s.role !== 'school_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return new NextResponse(await templateWorkbook() as any, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="School_Data_Import_Templates.xlsx"', 'Cache-Control': 'private, no-store' } });
}

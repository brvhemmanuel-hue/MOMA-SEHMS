import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const r = await one<any>(`select file_name, content_type, file_data from report_runs where id=$1 and requested_by=$2 and status='ready' and expires_at > now()`, [params.id, s.userId]);
  if (!r) return NextResponse.json({ error: 'This file has expired or does not exist.' }, { status: 404 });
  return new NextResponse(r.file_data, { headers: { 'Content-Type': r.content_type, 'Content-Disposition': `attachment; filename="${r.file_name}"`, 'Cache-Control': 'private, no-store' } });
}

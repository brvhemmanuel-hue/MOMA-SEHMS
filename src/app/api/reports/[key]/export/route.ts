import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { parseFilters, runReport } from '@/lib/reports';
import { buildReportFile, type Format } from '@/lib/report-files';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const s = await getSession();
  if (!s || s.mustChangePassword) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') as Format;
  if (!['pdf', 'xlsx', 'csv'].includes(format)) return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
  const filters = parseFilters(sp);
  try {
    const st = await getSettings();
    // Cheap size probe: big reports take the asynchronous path (queued, built in the background, private and expiring).
    const probe = await runReport(params.key, filters, s);
    if (probe.result.rows.length > st.report_async_threshold) {
      const [run] = await query<{ id: string }>('insert into report_runs (report_type, format, filters, requested_by) values ($1,$2,$3,$4) returning id', [params.key, format, JSON.stringify(filters), s.userId]);
      return NextResponse.json({ queued: true, runId: run.id }, { status: 202 });
    }
    const file = await buildReportFile(params.key, filters, format, s);
    await audit(s.userId, 'report.export', 'report', params.key, { format, rows: file.rows });
    return new NextResponse(file.body as any, {
      headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.fileName}"`, 'Cache-Control': 'private, no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message === 'Report not available.' ? e.message : 'Could not generate the report.' }, { status: e?.message === 'Report not available.' ? 403 : 500 });
  }
}

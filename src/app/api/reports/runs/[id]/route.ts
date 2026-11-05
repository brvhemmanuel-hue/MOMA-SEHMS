import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { buildReportFile } from '@/lib/report-files';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Polling this endpoint advances the job (serverless has no background process); the daily cron also sweeps stragglers. */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const run = await one<any>('select id, status, report_type, format, filters, expires_at from report_runs where id=$1 and requested_by=$2', [params.id, s.userId]);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (run.status === 'queued' || run.status === 'running') {
    const claimed = await one<any>(`update report_runs set status='running' where id=$1 and (status='queued' or (status='running' and created_at < now() - interval '3 minutes')) returning id`, [params.id]);
    if (claimed) {
      try {
        const st = await getSettings();
        const file = await buildReportFile(run.report_type, run.filters, run.format, s);
        await query(`update report_runs set status='ready', file_name=$2, content_type=$3, file_data=$4, completed_at=now(), expires_at = now() + ($5 || ' days')::interval where id=$1`,
          [params.id, file.fileName, file.contentType, file.body, String(st.report_retention_days)]);
        await query(`insert into notifications (user_id, type, message, link) values ($1,'report_ready',$2,$3)`, [s.userId, `Your ${run.report_type.replace(/_/g, ' ')} report is ready to download.`, '/reports']);
        await audit(s.userId, 'report.export', 'report', run.report_type, { format: run.format, async: true, rows: file.rows });
      } catch (e: any) {
        await query(`update report_runs set status='failed', error=$2 where id=$1`, [params.id, String(e?.message ?? 'failed').slice(0, 200)]);
      }
    }
    const again = await one<any>('select status from report_runs where id=$1', [params.id]);
    return NextResponse.json({ status: again?.status, downloadUrl: again?.status === 'ready' ? `/api/reports/runs/${params.id}/file` : null });
  }
  if (run.status === 'ready' && run.expires_at && new Date(run.expires_at) < new Date()) return NextResponse.json({ status: 'expired' });
  return NextResponse.json({ status: run.status, downloadUrl: run.status === 'ready' ? `/api/reports/runs/${params.id}/file` : null });
}

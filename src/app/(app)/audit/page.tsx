import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { PageHead, Pager } from '@/components/ui';

export const metadata = { title: 'Audit log' };
const PER = 50;

export default async function AuditPage({ searchParams }: { searchParams: { page?: string } }) {
  await requireSession(['school_admin']);
  const tz = (await getSettings()).timezone;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const total = Number((await query<any>('select count(*) n from activity_logs'))[0].n);
  const rows = await query<any>(`select l.*, u.full_name from activity_logs l left join users u on u.id=l.user_id order by l.created_at desc limit ${PER} offset ${(page - 1) * PER}`);
  return (
    <div className="stack">
      <PageHead title="Audit log" sub="Who changed what and when. Passwords and other secrets are never recorded." />
      <div className="card flat"><div className="tablewrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id}><td className="nowrap small">{fmtDateTime(r.created_at, tz)}</td><td>{r.full_name ?? 'System'}</td><td>{r.action}</td><td className="small">{r.entity}</td><td className="small muted">{JSON.stringify(r.metadata).slice(0, 140)}</td></tr>)}</tbody></table></div>
        <Pager base="/audit" page={page} pages={Math.max(1, Math.ceil(total / PER))} /></div>
    </div>
  );
}

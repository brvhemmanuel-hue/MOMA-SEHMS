import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { reportsFor } from '@/lib/reports';
import { PageHead } from '@/components/ui';

export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const s = await requireSession(['school_admin', 'external_admin']);
  const list = reportsFor(s.role);
  return (
    <div className="stack">
      <PageHead title="Reports" sub={s.role === 'teacher' ? 'Reports cover only your assigned classes and subjects.' : 'View on screen first, then export to PDF, Excel or CSV.'} />
      <div className="grid cols-2">{list.map((r) => (
        <Link key={r.key} href={`/reports/${r.key}`} className="card" style={{ textDecoration: 'none', color: 'inherit', borderLeft: '5px solid var(--gold)' }}>
          <h2>{r.title}</h2><p className="muted" style={{ margin: 0 }}>{r.description}</p></Link>))}</div>
    </div>
  );
}

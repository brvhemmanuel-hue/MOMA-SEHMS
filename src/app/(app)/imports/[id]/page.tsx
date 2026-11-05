import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { ENTITIES, type EntityKey } from '@/lib/import-defs';
import CommitPanel from '@/components/CommitPanel';
import { Badge, PageHead, Stat } from '@/components/ui';

export const metadata = { title: 'Import preview' };

export default async function ImportPreview({ params, searchParams }: { params: { id: string }; searchParams: { ignored?: string } }) {
  const s = await requireSession(['school_admin']);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const b = await one<any>('select * from import_batches where id=$1 and uploaded_by=$2', [params.id, s.userId]);
  if (!b) notFound();
  const def = ENTITIES[b.entity_type as EntityKey];
  const rows = await query<any>(`select row_number, outcome, action, messages, payload from import_rows where batch_id=$1 and outcome <> 'ready' order by row_number limit 300`, [params.id]);
  const dups = b.entity_type === 'students' ? rows.filter((r: any) => r.outcome === 'warning' && r.action === 'skip' && /Possible duplicate/.test((r.messages as string[]).join(' '))).map((r: any) => ({ row: r.row_number, text: `${r.payload?.raw?.first_name ?? ''} ${r.payload?.raw?.last_name ?? ''} in ${r.payload?.raw?.class_name ?? ''}` })) : [];
  const ignored = (searchParams.ignored || '').split(',').filter(Boolean);
  return (
    <div className="stack">
      <PageHead title={`Preview: ${def.label}`} sub={`${b.file_name} | ${b.mode === 'create_only' ? 'Create only' : 'Create and update'}`}><Link className="btn ghost" href="/imports">Import Centre</Link></PageHead>
      {ignored.length > 0 && <div className="alert info"><strong>Columns ignored:</strong> {ignored.join(', ')}. IDs and passwords are never imported or stored. The system generates its own IDs.</div>}
      <div className="grid cols-4">
        <Stat label="Rows in file" value={b.total_rows} /><Stat label="Ready to import" value={b.ready_rows} tone="ok" hint="IDs are generated when you confirm" />
        <Stat label="Warnings" value={b.warning_rows} tone="gold" /><Stat label="Rejected (errors)" value={b.error_rows} tone="bad" /></div>
      {b.status === 'previewed' ? <CommitPanel batchId={b.id} errorRows={b.error_rows} readyRows={b.ready_rows} duplicates={dups} /> : <div className="alert ok">This import is {b.status}: {b.created_count} created, {b.updated_count} updated, {b.skipped_count} skipped, {b.failed_count} failed.</div>}
      <section className="card flat"><div style={{ padding: '1rem 1rem 0' }} className="row spread"><h2>Rows needing attention</h2>
        {rows.length > 0 && <span className="row"><a className="btn ghost sm" href={`/api/imports/${b.id}/errors?format=xlsx`}>Download Excel</a><a className="btn ghost sm" href={`/api/imports/${b.id}/errors?format=csv`}>Download CSV</a></span>}</div>
        <div className="tablewrap"><table><thead><tr><th>Row</th><th>Result</th><th>Action</th><th>Message</th></tr></thead>
          <tbody>{rows.map((r: any) => <tr key={r.row_number}><td>{r.row_number}</td><td><Badge tone={r.outcome === 'error' || r.outcome === 'failed' ? 'bad' : 'late'}>{r.outcome}</Badge></td><td>{r.action ?? 'rejected'}</td><td className="small">{(r.messages as string[]).join(' ')}</td></tr>)}
            {!rows.length && <tr><td colSpan={4} className="empty">No problems found. Every row is ready.</td></tr>}</tbody></table></div>
        <p className="small muted" style={{ padding: '0 1rem 1rem' }}>Download the rejected rows with their messages, correct them, and upload again.</p></section>
    </div>
  );
}

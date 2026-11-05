import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmtDateTime } from '@/lib/time';
import { ENTITIES, IMPORT_ORDER } from '@/lib/import-defs';
import ImportUpload from '@/components/ImportUpload';
import { Badge, PageHead } from '@/components/ui';

export const metadata = { title: 'Import Centre' };

export default async function ImportsPage() {
  await requireSession(['school_admin']);
  const st = await getSettings();
  const [c, history] = await Promise.all([
    query<any>(`select (select count(*)::int from academic_years) years, (select count(*)::int from terms) terms, (select count(*)::int from classes) classes, (select count(*)::int from subjects) subjects,
                       (select count(*)::int from teacher_profiles) teachers, (select count(*)::int from student_profiles) students`),
    query<any>(`select b.*, u.full_name from import_batches b join users u on u.id=b.uploaded_by order by b.created_at desc limit 30`),
  ]);
  const n = c[0];
  const warn = n.years === 0 || n.terms === 0 ? 'Create an academic year and its terms first (Years, terms, departments). Classes, students and teacher assignments depend on them.' : '';
  return (
    <div className="stack">
      <PageHead title="Import Centre" sub="Load school setup data from Excel or CSV. Every file is checked and previewed before anything is saved." />
      {warn && <div className="alert info"><strong>Before you import:</strong> {warn} <Link href="/setup">Open setup</Link></div>}
      <div className="grid cols-2">
        <section className="card"><h2>1. Get the template</h2>
          <p>One workbook with a sheet for each type. Keep the headers exactly as shown. IDs and passwords are never imported.</p>
          <a className="btn" href="/api/templates">Download template workbook</a>
          <h3 style={{ marginTop: '1.25rem' }}>Recommended order</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Academic years, terms and departments (in the app)</li>{IMPORT_ORDER.map((k) => <li key={k}>{ENTITIES[k].label}</li>)}</ol>
          <p className="small muted" style={{ marginTop: '.75rem' }}>Now in the system: {n.classes} classes, {n.subjects} subjects, {n.teachers} teachers, {n.students} students.</p></section>
        <section className="card"><h2>2. Upload and check</h2>
          <ImportUpload entities={IMPORT_ORDER.map((k) => ({ key: k, label: ENTITIES[k].label, hint: ENTITIES[k].hint }))} />
          <p className="small muted" style={{ marginTop: '.75rem' }}>Limits: {st.import_max_rows} rows and {st.import_max_mb} MB per file. Uploaded files are not kept.</p></section>
      </div>
      <section className="card"><h2>Export current data</h2><p className="small muted">Downloads in the template layout with a read-only reference column, so you can correct offline and re-import with Create and update.</p>
        <div className="row">{IMPORT_ORDER.map((k) => <a key={k} className="btn ghost sm" href={`/api/exports/${k}`}>{ENTITIES[k].label}</a>)}</div></section>
      <section className="card flat"><div style={{ padding: '1rem 1rem 0' }}><h2>Import history</h2></div>
        <div className="tablewrap"><table><thead><tr><th>When</th><th>By</th><th>Type</th><th>File</th><th className="num">Rows</th><th className="num">Created</th><th className="num">Updated</th><th className="num">Skipped</th><th className="num">Failed</th><th>Status</th><th></th></tr></thead>
          <tbody>{history.map((b: any) => <tr key={b.id}><td className="small nowrap">{fmtDateTime(b.created_at, st.timezone)}</td><td>{b.full_name}</td><td>{ENTITIES[b.entity_type as keyof typeof ENTITIES]?.label}</td><td className="small">{b.file_name}</td>
            <td className="num">{b.total_rows}</td><td className="num">{b.created_count}</td><td className="num">{b.updated_count}</td><td className="num">{b.skipped_count}</td><td className="num">{b.failed_count}</td>
            <td><Badge tone={b.status === 'committed' ? 'ok' : 'info'}>{b.status}</Badge></td><td>{b.status === 'previewed' && <Link href={`/imports/${b.id}`}>Resume</Link>}</td></tr>)}
            {!history.length && <tr><td colSpan={11} className="empty">No imports yet.</td></tr>}</tbody></table></div></section>
    </div>
  );
}

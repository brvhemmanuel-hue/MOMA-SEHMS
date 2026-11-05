import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { query, one } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { parseFilters, reportsFor, runReport } from '@/lib/reports';
import { addDays, startOfWeek, todayInTz } from '@/lib/time';
import ExportButtons from '@/components/ExportButtons';
import { Empty, PageHead } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params, searchParams }: { params: { key: string }; searchParams: Record<string, string | undefined> }) {
  const s = await requireSession();
  const def = reportsFor(s.role).find((r) => r.key === params.key);
  if (!def) notFound();
  const st = await getSettings();
  const f = parseFilters(searchParams);
  const { meta, result } = await runReport(params.key, f, s);
  const has = (k: string) => (def.filters as string[]).includes(k);

  const teacherScoped = s.role === 'teacher';
  const [terms, classes, subjects, teachers, depts, curTerm] = await Promise.all([
    query<any>('select id, name from terms order by start_date desc'),
    teacherScoped ? query<any>('select distinct c.id, c.name from teacher_class_subject_assignments a join classes c on c.id=a.class_id where a.teacher_id=$1', [s.teacherId]) : query<any>('select id, name from classes order by name'),
    teacherScoped ? query<any>('select distinct b.id, b.name from teacher_class_subject_assignments a join subjects b on b.id=a.subject_id where a.teacher_id=$1', [s.teacherId]) : query<any>('select id, name from subjects order by name'),
    teacherScoped ? Promise.resolve([]) : query<any>("select id, first_name||' '||last_name name from teacher_profiles order by last_name"),
    query<any>('select id, name from departments order by name'),
    one<any>('select start_date::text s, end_date::text e from terms where is_current limit 1'),
  ]);
  const today = todayInTz(st.timezone), wkStart = startOfWeek(today);
  const presets: [string, string, string][] = [
    ['This week', wkStart, today], ['Last week', addDays(wkStart, -7), addDays(wkStart, -1)], ['This month', today.slice(0, 8) + '01', today],
    ...(curTerm ? [['This term', curTerm.s, curTerm.e < today ? curTerm.e : today] as [string, string, string]] : []),
  ];
  const keep = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== 'from' && k !== 'to') as [string, string][]);
  const q = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== 'format') as [string, string][]).toString();
  const sel = (name: string, label: string, opts: any[]) => (
    <div style={{ flex: '1 1 160px' }}><label htmlFor={name}>{label}</label><select id={name} name={name} defaultValue={searchParams[name] ?? ''}><option value="">All</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>);
  const maxChart = result.chart ? Math.max(100, ...result.chart.values) : 100;

  return (
    <div className="stack">
      <PageHead title={def.title} sub={def.description}><Link className="btn ghost sm" href="/reports">All reports</Link></PageHead>
      <form className="card row no-print" aria-label="Report filters">
        {has('from') && <div style={{ flex: '1 1 150px' }}><label htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={f.from} /></div>}
        {has('to') && <div style={{ flex: '1 1 150px' }}><label htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={f.to} /></div>}
        {has('termId') && sel('termId', 'Term', terms)}{has('classId') && sel('classId', 'Class', classes)}{has('subjectId') && sel('subjectId', 'Subject', subjects)}
        {has('teacherId') && !teacherScoped && sel('teacherId', 'Teacher', teachers)}{has('departmentId') && sel('departmentId', 'Department', depts)}
        {has('studentNo') && <div style={{ flex: '1 1 180px' }}><label htmlFor="studentNo">Student number</label><input id="studentNo" name="studentNo" defaultValue={f.studentNo} placeholder="S-2026-0001" /></div>}
        {has('threshold') && <div style={{ flex: '1 1 120px' }}><label htmlFor="threshold">Threshold</label><input id="threshold" type="number" min={1} name="threshold" defaultValue={f.threshold ?? st.repeat_threshold} /></div>}
        {has('groupBy') && <div style={{ flex: '1 1 140px' }}><label htmlFor="groupBy">Group by</label><select id="groupBy" name="groupBy" defaultValue={f.groupBy ?? 'week'}><option value="week">Week</option><option value="month">Month</option></select></div>}
        <button className="btn" style={{ alignSelf: 'end' }}>Run report</button>
      </form>
      {has('from') && <div className="row small no-print"><span className="muted">Presets:</span>{presets.map(([label, a, b]) => {
        const p = new URLSearchParams(keep); p.set('from', a); p.set('to', b); return <Link key={label} className="btn ghost sm" href={`/reports/${params.key}?${p}`}>{label}</Link>; })}</div>}

      <ExportButtons reportKey={params.key} query={q} />

      <section className="card" aria-label="Report header">
        <h2 style={{ marginBottom: '.5rem' }}>{meta.school}: {meta.title}</h2>
        <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '.15rem 1rem', margin: 0 }}>
          {[['Date range', meta.dateRange], ['Scope', meta.scope], ['Filters applied', meta.filtersApplied], ['Generated by', meta.generatedBy], ['Generated at', meta.generatedAt], ['Figures', meta.basis]].map(([k, v]) => <><dt key={k} className="muted">{k}</dt><dd key={k + 'v'} style={{ margin: 0 }}>{v}</dd></>)}
        </dl>
        {result.note && <p className="alert info" style={{ margin: '.75rem 0 0' }}>{result.note}</p>}
      </section>

      {result.chart && result.chart.values.length > 0 && (
        <section className="card"><h2>{result.chart.title}</h2>
          <div role="img" aria-label={result.chart.title} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 180, overflowX: 'auto' }}>
            {result.chart.values.map((v, i) => <div key={i} style={{ flex: '1 0 44px', textAlign: 'center' }}><div className="small">{v}%</div><div style={{ height: `${(v / maxChart) * 130}px`, background: 'var(--navy)', borderRadius: '4px 4px 0 0' }} /><div className="small muted" style={{ fontSize: '.7rem' }}>{result.chart!.labels[i].replace('Week of ', '')}</div></div>)}</div></section>)}

      <section className="card flat">
        {result.columns.length ? <div className="tablewrap"><table>
          <thead><tr>{result.columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>{result.rows.slice(0, 500).map((r, i) => <tr key={i}>{result.columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{String(r[c.key] ?? '')}</td>)}</tr>)}
            {!result.rows.length && <tr><td colSpan={result.columns.length}><Empty>No records match these filters.</Empty></td></tr>}</tbody></table>
          {result.rows.length > 500 && <p className="small muted" style={{ padding: '.75rem' }}>Showing the first 500 of {result.rows.length} rows. Exports contain every row.</p>}</div>
          : <Empty>{result.note || 'No data.'}</Empty>}
      </section>
    </div>
  );
}

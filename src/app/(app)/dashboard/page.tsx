import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { assignmentStatus, STATUS_LABEL } from '@/lib/rbac';
import { dashboardStats, parseFilters, runReport } from '@/lib/reports';
import { fmtDateTime, startOfWeek, toLocalInput } from '@/lib/time';
import { Badge, Empty, Meter, PageHead, Stat, STATUS_TONE } from '@/components/ui';
import TrendChart from '@/components/TrendChart';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const s = await requireSession();
  const st = await getSettings();
  const f = parseFilters(searchParams);
  const rows = await dashboardStats(f, s);
  const now = new Date();
  const status = (r: any) => assignmentStatus(r, st.reminder_window_hours, now);
  const count = (k: string) => rows.filter((r: any) => status(r) === k).length;
  const open = rows.filter((r: any) => !r.closed_at && new Date(r.current_due_at) >= now);
  const overdue = rows.filter((r: any) => status(r) === 'overdue');
  const openExpected = open.reduce((a: number, r: any) => a + r.expected_count, 0);
  const openSub = open.reduce((a: number, r: any) => a + r.submitted, 0);

  const weeks = new Map<string, { exp: number; on: number; late: number }>();
  for (const r of rows) {
    const wk = startOfWeek(toLocalInput(r.assigned_at, st.timezone).slice(0, 10));
    const x = weeks.get(wk) ?? { exp: 0, on: 0, late: 0 };
    x.exp += r.expected_count; x.on += r.on_time; x.late += r.late; weeks.set(wk, x);
  }
  const wk = [...weeks.entries()].sort().slice(-8);
  const pc = (n: number, d: number) => (d ? Math.round((n * 1000) / d) / 10 : 0);

  const repeated = await runReport('repeated', {}, s);
  const isAdmin = s.role !== 'teacher';
  const [totals, activity, filterOpts] = isAdmin ? await Promise.all([
    query<any>(`select (select count(*)::int from teacher_profiles) teachers, (select count(*)::int from student_profiles where status='active') students,
                       (select count(*)::int from classes where status='active') classes, (select count(*)::int from subjects where status='active') subjects`),
    runReport('teacher_activity', f.termId ? { termId: f.termId } : {}, s),
    Promise.all([query<any>('select id,name from terms order by start_date desc'), query<any>("select id,name from classes where status='active' order by name"), query<any>("select id,name from subjects where status='active' order by name"), query<any>("select id, first_name||' '||last_name name from teacher_profiles order by last_name")]),
  ]) : [null, null, null] as any;

  const recent = [...rows].sort((a: any, b: any) => +new Date(a.current_due_at) - +new Date(b.current_due_at)).filter((r: any) => !r.closed_at).slice(0, 8);
  const created7 = rows.filter((r: any) => +new Date(r.assigned_at) > Date.now() - 7 * 864e5).length;
  const created30 = rows.filter((r: any) => +new Date(r.assigned_at) > Date.now() - 30 * 864e5).length;

  return (
    <div className="stack">
      <PageHead title={s.role === 'teacher' ? `Welcome, ${s.fullName.split(' ')[0]}` : s.role === 'school_admin' ? 'School overview' : 'School oversight (read-only)'}
        sub={s.role === 'teacher' ? 'Your assigned classes and subjects only.' : 'Participation across all classes, subjects and teachers.'}>
        {s.role === 'teacher' && <Link className="btn gold" href="/work/new">New assignment</Link>}</PageHead>

      {isAdmin && (
        <form className="card row no-print" aria-label="Filters">
          {[['termId', 'Term', filterOpts[0]], ['classId', 'Class', filterOpts[1]], ['subjectId', 'Subject', filterOpts[2]], ['teacherId', 'Teacher', filterOpts[3]]].map(([k, label, opts]: any) => (
            <div key={k} style={{ flex: '1 1 150px' }}><label htmlFor={k}>{label}</label><select id={k} name={k} defaultValue={(searchParams as any)[k] ?? ''}><option value="">All</option>{opts.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>))}
          <div style={{ flex: '1 1 140px' }}><label htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={f.from} /></div>
          <div style={{ flex: '1 1 140px' }}><label htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={f.to} /></div>
          <button className="btn" style={{ alignSelf: 'end' }}>Apply</button><Link className="btn ghost" style={{ alignSelf: 'end' }} href="/dashboard">Clear</Link></form>)}

      {isAdmin && totals && <div className="grid cols-4">
        <Stat label="Teachers" value={totals[0].teachers} /><Stat label="Active students" value={totals[0].students} /><Stat label="Classes" value={totals[0].classes} /><Stat label="Subjects" value={totals[0].subjects} /></div>}

      <div className="grid cols-4">
        <Stat label="Assignments" value={rows.length} hint={s.role === 'teacher' ? `${created7} this week, ${created30} in 30 days` : 'In the selected range'} />
        <Stat label="Open" value={count('in_progress') + count('due_soon') + count('scheduled')} tone="ok" />
        <Stat label="Due soon" value={count('due_soon')} tone="gold" hint={`Within ${st.reminder_window_hours} hours`} />
        <Stat label="Overdue" value={overdue.length} tone="bad" hint="Late submissions may still be recorded" />
      </div>

      <div className="grid cols-2">
        <section className="card"><h2>Live submission progress</h2>
          <div className="bigfig">{openExpected ? `${pc(openSub, openExpected)}%` : 'N/A'}</div>
          <p className="muted">{openSub} of {openExpected} expected submissions recorded across {open.length} open assignments.</p>
          <Meter onTime={open.reduce((a: number, r: any) => a + r.on_time, 0)} late={open.reduce((a: number, r: any) => a + r.late, 0)} expected={openExpected} /></section>
        <section className="card"><h2>Weekly trend</h2>{wk.length ? <TrendChart labels={wk.map(([k]) => `Wk ${k.slice(5)}`)} onTime={wk.map(([, v]) => pc(v.on, v.exp))} late={wk.map(([, v]) => pc(v.late, v.exp))} /> : <Empty>Trends appear once assignments are created.</Empty>}</section>
      </div>

      <section className="card flat"><div style={{ padding: '1rem 1rem 0' }}><h2>Next deadlines and open work</h2></div>
        {recent.length ? <div className="tablewrap"><table><thead><tr><th>Assignment</th><th>Class and subject</th>{isAdmin && <th>Teacher</th>}<th>Due</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>{recent.map((r: any) => { const t = status(r); return <tr key={r.id}><td><Link href={`/work/${r.id}`}><strong>{r.title}</strong></Link></td><td>{r.class_name}<div className="small muted">{r.subject_name}</div></td>{isAdmin && <td>{r.teacher_name}</td>}
            <td className="small nowrap">{fmtDateTime(r.current_due_at, st.timezone)}</td><td><Badge tone={STATUS_TONE[t]}>{STATUS_LABEL[t]}</Badge></td><td style={{ minWidth: 140 }}><Meter onTime={r.on_time} late={r.late} expected={r.expected_count} /></td></tr>; })}</tbody></table></div>
          : <Empty>No open assignments.</Empty>}</section>

      <div className="grid cols-2">
        <section className="card flat"><div style={{ padding: '1rem 1rem 0' }}><h2>Repeated non-submission or late work</h2><p className="small muted">At or above {st.repeat_threshold} missed or late submissions.</p></div>
          {repeated.result.rows.length ? <div className="tablewrap"><table><thead><tr><th>Student</th><th>Class</th><th className="num">Missed</th><th className="num">Late</th></tr></thead>
            <tbody>{repeated.result.rows.slice(0, 8).map((r: any) => <tr key={r.student_no}><td>{r.student}</td><td>{r.class}</td><td className="num">{r.missed}</td><td className="num">{r.late}</td></tr>)}</tbody></table></div> : <Empty>No students at the threshold.</Empty>}
          <div style={{ padding: '.5rem 1rem 1rem' }}><Link href="/reports/repeated">Open full report</Link></div></section>
        {isAdmin && activity && <section className="card flat"><div style={{ padding: '1rem 1rem 0' }}><h2>Teacher activity</h2><p className="small muted">Registers updated and incomplete records.</p></div>
          <div className="tablewrap"><table><thead><tr><th>Teacher</th><th className="num">Created</th><th className="num">Updated</th><th className="num">Incomplete</th><th>Last update</th></tr></thead>
            <tbody>{[...activity.result.rows].sort((a: any, b: any) => b.incomplete - a.incomplete).slice(0, 8).map((r: any) => <tr key={r.teacher_no}><td>{r.teacher}</td><td className="num">{r.created}</td><td className="num">{r.updated}</td><td className="num">{r.incomplete}</td><td className="small">{r.last_update}</td></tr>)}</tbody></table></div>
          <div style={{ padding: '.5rem 1rem 1rem' }}><Link href="/reports/teacher_activity">Open full report</Link></div></section>}
      </div>
    </div>
  );
}

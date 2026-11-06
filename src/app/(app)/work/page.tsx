import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { assignmentStatus, STATUS_LABEL, teacherScopeSql } from '@/lib/rbac';
import { fmtDateTime, toLocalInput } from '@/lib/time';
import AssignmentActions from '@/components/AssignmentActions';
import { Badge, Empty, Meter, PageHead, Pager, STATUS_TONE } from '@/components/ui';

export const metadata = { title: 'Assignments' };
const PER = 25;

export default async function WorkPage({ searchParams }: { searchParams: { class?: string; subject?: string; status?: string; page?: string } }) {
  const s = await requireSession();
  const st = await getSettings();
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : '');
  const classId = uuid(searchParams.class), subjectId = uuid(searchParams.subject), status = searchParams.status || '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const params: any[] = []; const w: string[] = [];
  if (s.role === 'teacher') w.push(teacherScopeSql('a', params.push(s.teacherId)));
  if (classId) w.push(`a.class_id = $${params.push(classId)}`);
  if (subjectId) w.push(`a.subject_id = $${params.push(subjectId)}`);
  if (status === 'overdue') w.push('a.closed_at is null and a.current_due_at < now()');
  if (status === 'open') w.push('a.closed_at is null and a.current_due_at >= now()');
  if (status === 'closed') w.push('a.closed_at is not null');
  const where = w.length ? 'where ' + w.join(' and ') : '';
  const total = Number((await query<any>(`select count(*) n from assignments a ${where}`, params))[0].n);
  const rows = await query<any>(
    `select a.id, a.title, a.type, a.description, a.teacher_id, a.assigned_at, a.current_due_at, a.closed_at, a.expected_count, c.name class_name, sb.name subject_name, tp.first_name||' '||tp.last_name teacher,
            (select count(*) from submission_records r where r.assignment_id=a.id and r.status='on_time')::int on_time,
            (select count(*) from submission_records r where r.assignment_id=a.id and r.status='late')::int late
       from assignments a join classes c on c.id=a.class_id join subjects sb on sb.id=a.subject_id join teacher_profiles tp on tp.id=a.teacher_id
       ${where} order by a.assigned_at desc limit ${PER} offset ${(page - 1) * PER}`, params);
  const filt = s.role === 'teacher'
    ? await query<any>(`select distinct c.id cid, c.name cname, sb.id sid, sb.name sname from teacher_class_subject_assignments t join classes c on c.id=t.class_id join subjects sb on sb.id=t.subject_id where t.teacher_id=$1 and t.status='active'`, [s.teacherId])
    : await query<any>(`select c.id cid, c.name cname, sb.id sid, sb.name sname from classes c cross join subjects sb where c.status='active' and sb.status='active'`);
  const cls = [...new Map(filt.map((x: any) => [x.cid, x.cname]))]; const subs = [...new Map(filt.map((x: any) => [x.sid, x.sname]))];
  return (
    <div className="stack">
      <PageHead title={s.role === 'teacher' ? 'My assignments' : 'Assignments'} sub={s.role === 'teacher' ? 'Class exercises and homework for your classes and subjects.' : 'All class exercises and homework across the school.'}>
        {s.role === 'teacher' && <Link className="btn gold" href="/work/new">New assignment</Link>}</PageHead>
      <form className="row card">
        <div style={{ flex: '1 1 160px' }}><label htmlFor="fc">Class</label><select id="fc" name="class" defaultValue={classId}><option value="">All</option>{cls.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <div style={{ flex: '1 1 160px' }}><label htmlFor="fs">Subject</label><select id="fs" name="subject" defaultValue={subjectId}><option value="">All</option>{subs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <div style={{ flex: '1 1 140px' }}><label htmlFor="fst">Show</label><select id="fst" name="status" defaultValue={status}><option value="">Everything</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="closed">Closed</option></select></div>
        <button className="btn" style={{ alignSelf: 'end' }}>Filter</button></form>
      <div className="card flat">
        {rows.length ? <div className="tablewrap"><table>
          <thead><tr><th>Assignment</th><th>Class and subject</th>{s.role !== 'teacher' && <th>Teacher</th>}<th>Due</th><th>Status</th><th>Submitted</th>{s.role !== 'external_admin' && <th></th>}</tr></thead>
          <tbody>{rows.map((r: any) => { const stt = assignmentStatus(r, st.reminder_window_hours); return (
            <tr key={r.id}><td><Link href={`/work/${r.id}`}><strong>{r.title}</strong></Link><div className="small muted">{r.type === 'homework' ? 'Homework' : 'Class exercise'}</div></td>
              <td>{r.class_name}<div className="small muted">{r.subject_name}</div></td>{s.role !== 'teacher' && <td>{r.teacher}</td>}
              <td className="small nowrap">{fmtDateTime(r.current_due_at, st.timezone)}</td><td><Badge tone={STATUS_TONE[stt]}>{STATUS_LABEL[stt]}</Badge></td>
              <td style={{ minWidth: 150 }}><Meter onTime={r.on_time} late={r.late} expected={r.expected_count} /></td>
              {s.role !== 'external_admin' && <td>{(s.role === 'school_admin' || (r.teacher_id === s.teacherId && !r.closed_at)) && <AssignmentActions id={r.id} title={r.title} type={r.type} description={r.description ?? ''} dueLocal={toLocalInput(r.current_due_at, st.timezone)} recorded={r.on_time + r.late} tz={st.timezone} />}</td>}</tr>); })}</tbody></table></div>
          : <Empty action={s.role === 'teacher' ? <Link className="btn gold" href="/work/new">Create your first assignment</Link> : undefined}>No assignments match.</Empty>}
        <Pager base="/work" page={page} pages={Math.max(1, Math.ceil(total / PER))} params={{ class: classId, subject: subjectId, status }} />
      </div>
    </div>
  );
}

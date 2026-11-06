import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmtDateTime } from '@/lib/time';
import QuickMark from '@/components/QuickMark';
import { Badge, Empty, PageHead } from '@/components/ui';

export const metadata = { title: 'Find a student' };
export const dynamic = 'force-dynamic';

const label = (st: string) => st === 'on_time' ? ['Submitted on time', 'ok'] : st === 'late' ? ['Submitted late', 'late'] : st === 'not_submitted' ? ['Not submitted', 'bad'] : ['Pending', 'info'];

export default async function FindStudentPage({ searchParams }: { searchParams: { q?: string } }) {
  const s = await requireSession(['teacher']);
  const st = await getSettings();
  const q = (searchParams.q || '').trim().slice(0, 60);
  let students: any[] = [];
  let work: any[] = [];
  if (q.length >= 2) {
    const like = `%${q.toLowerCase()}%`;
    students = await query<any>(
      `select distinct p.id, p.student_no, p.first_name, p.last_name, p.other_names, c.id as class_id, c.name as class_name
         from student_profiles p join student_class_history h on h.student_id = p.id and h.effective_to is null join classes c on c.id = h.class_id
        where p.status = 'active'
          and exists (select 1 from teacher_class_subject_assignments t where t.teacher_id = $1 and t.class_id = c.id and t.status = 'active')
          and (lower(p.first_name || ' ' || p.last_name) like $2 or lower(p.last_name || ' ' || p.first_name) like $2 or lower(p.student_no) like $2 or lower(coalesce(p.other_names, '')) like $2)
        order by p.last_name, p.first_name limit 30`, [s.teacherId, like]);
    if (students.length) {
      work = await query<any>(
        `select r.student_id, r.status, a.id as assignment_id, a.title, a.type, a.current_due_at, sb.name as subject_name
           from submission_records r join assignments a on a.id = r.assignment_id join subjects sb on sb.id = a.subject_id
          where r.student_id = any($1::uuid[]) and a.closed_at is null
            and exists (select 1 from teacher_class_subject_assignments t where t.teacher_id = $2 and t.class_id = a.class_id and t.subject_id = a.subject_id and t.status = 'active')
          order by a.current_due_at desc`, [students.map((x) => x.id), s.teacherId]);
    }
  }
  return (
    <div className="stack">
      <PageHead title="Find a student" sub="Search by name or student number, then mark their homework or classwork." />
      <form className="card" role="search">
        <label htmlFor="q">Student name or number</label>
        <div className="row"><input id="q" name="q" defaultValue={q} placeholder="Start typing a name" autoFocus style={{ flex: '1 1 260px' }} /><button className="btn gold">Search</button></div>
        <p className="small muted" style={{ margin: '.5rem 0 0' }}>You can only find students in the classes you have chosen. <Link href="/my-classes">Change my classes</Link></p>
      </form>
      {q.length > 0 && q.length < 2 && <div className="alert info">Type at least 2 letters.</div>}
      {q.length >= 2 && !students.length && <div className="card"><Empty>No student in your classes matches &quot;{q}&quot;.</Empty></div>}
      {students.map((p) => {
        const mine = work.filter((w) => w.student_id === p.id);
        return (
          <section className="card" key={p.id}>
            <div className="row spread"><div><h2 style={{ margin: 0 }}>{p.last_name}, {p.first_name} {p.other_names ?? ''}</h2><span className="small muted">{p.student_no} | {p.class_name}</span></div></div>
            {mine.length ? <div className="tablewrap" style={{ marginTop: '.75rem' }}><table>
              <thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th>Mark</th></tr></thead>
              <tbody>{mine.map((w) => { const [text, tone] = label(w.status); return (
                <tr key={w.assignment_id}><td><Link href={`/work/${w.assignment_id}`}><strong>{w.title}</strong></Link><div className="small muted">{w.subject_name} | {w.type === 'homework' ? 'Homework' : 'Class exercise'}</div></td>
                  <td className="small nowrap">{fmtDateTime(w.current_due_at, st.timezone)}</td><td><Badge tone={tone as any}>{text}</Badge></td>
                  <td><QuickMark assignmentId={w.assignment_id} studentId={p.id} status={w.status} /></td></tr>); })}</tbody></table></div>
              : <p className="muted" style={{ margin: '.75rem 0 0' }}>No open assignments for this student. <Link href="/work/new">Create one</Link></p>}
          </section>);
      })}
    </div>
  );
}

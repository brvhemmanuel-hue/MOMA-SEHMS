import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';
import { Badge, PageHead } from '@/components/ui';
import { createTeacherAssignment, toggleTeacherAssignment } from '../../actions/admin';

export const metadata = { title: 'Teacher assignments' };

export default async function TeacherAssignmentsPage({ searchParams }: { searchParams: { teacher?: string } }) {
  await requireSession(['school_admin']);
  const [teachers, classes, subjects, terms] = await Promise.all([
    query<any>("select t.id, t.first_name||' '||t.last_name n, t.teacher_no from teacher_profiles t join users u on u.id=t.user_id where u.status='active' order by t.last_name"),
    query<any>("select c.id, c.name, y.name y from classes c join academic_years y on y.id=c.academic_year_id where c.status='active' order by y.start_date desc, c.name"),
    query<any>("select id, name from subjects where status='active' order by name"),
    query<any>('select t.id, t.name, y.name y, t.is_current from terms t join academic_years y on y.id=t.academic_year_id order by t.start_date desc'),
  ]);
  const filter = /^[0-9a-f-]{36}$/i.test(searchParams.teacher || '') ? searchParams.teacher! : '';
  const rows = await query<any>(
    `select a.id, a.status, tp.first_name||' '||tp.last_name teacher, c.name class_name, s.name subject_name, t.name as term_name, y.name as year_name
       from teacher_class_subject_assignments a join teacher_profiles tp on tp.id=a.teacher_id join classes c on c.id=a.class_id join subjects s on s.id=a.subject_id
       join terms t on t.id=a.term_id join academic_years y on y.id=a.academic_year_id ${filter ? 'where a.teacher_id=$1' : ''}
      order by y.name desc, t.name, tp.last_name, c.name, s.name`, filter ? [filter] : []);
  return (
    <div className="stack">
      <PageHead title="Teacher assignments" sub="These decide exactly which classes and subjects each teacher can see and use. One teacher can have many; a class can have many teachers across different subjects." />
      <details className="panel" open={!rows.length}><summary>Assign a teacher to a class and subject</summary><div>
        <ActionForm action={createTeacherAssignment} submit="Save assignment" className="form-grid" resetOnSuccess={false}>
          <div><label>Teacher</label><select name="teacher" required><option value="">Choose</option>{teachers.map((t: any) => <option key={t.id} value={t.id}>{t.n} ({t.teacher_no})</option>)}</select></div>
          <div><label>Class</label><select name="class" required><option value="">Choose</option>{classes.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.y})</option>)}</select></div>
          <div><label>Subject</label><select name="subject" required><option value="">Choose</option>{subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label>Term</label><select name="term" required defaultValue={terms.find((t: any) => t.is_current)?.id}>{terms.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.y})</option>)}</select></div>
        </ActionForm></div></details>
      <form className="row"><label htmlFor="tf" className="sr-only">Teacher</label><select id="tf" name="teacher" defaultValue={filter} style={{ width: 'auto' }}><option value="">All teachers</option>{teachers.map((t: any) => <option key={t.id} value={t.id}>{t.n}</option>)}</select><button className="btn ghost sm">Filter</button></form>
      <div className="card flat tablewrap"><table><thead><tr><th>Teacher</th><th>Class</th><th>Subject</th><th>Term</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{r.teacher}</td><td>{r.class_name}</td><td>{r.subject_name}</td><td>{r.term_name} ({r.year_name})</td><td><Badge tone={r.status === 'active' ? 'ok' : ''}>{r.status}</Badge></td>
            <td><ActionForm action={toggleTeacherAssignment} submit={r.status === 'active' ? 'Deactivate' : 'Reactivate'} submitClass="btn ghost sm" resetOnSuccess={false}>
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === 'active' ? 'inactive' : 'active'} /></ActionForm></td></tr>))}
          {!rows.length && <tr><td colSpan={6} className="empty">No assignments yet.</td></tr>}</tbody></table></div>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';
import { Badge, PageHead } from '@/components/ui';
import { resetUserPassword, setUserStatus, toggleTeacherAssignment, updateTeacher } from '../../../actions/admin';

export const metadata = { title: 'Manage teacher' };

export default async function TeacherPage({ params }: { params: { id: string } }) {
  await requireSession(['school_admin']);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const t = await one<any>('select t.*, u.email, u.status, u.id as user_id from teacher_profiles t join users u on u.id=t.user_id where t.id=$1', [params.id]);
  if (!t) notFound();
  const [depts, loads] = await Promise.all([
    query<any>("select id,name from departments where status='active' order by name"),
    query<any>(`select a.id, a.status, c.name class_name, s.name subject_name, tm.name term_name, y.name year_name
                  from teacher_class_subject_assignments a join classes c on c.id=a.class_id join subjects s on s.id=a.subject_id join terms tm on tm.id=a.term_id join academic_years y on y.id=a.academic_year_id
                 where a.teacher_id=$1 order by y.name desc, tm.name, c.name, s.name`, [params.id]),
  ]);
  return (
    <div className="stack">
      <PageHead title={`${t.first_name} ${t.last_name}`} sub={`${t.teacher_no} | ${t.email}`}><Link className="btn ghost" href="/teachers">All teachers</Link><Badge tone={t.status === 'active' ? 'ok' : ''}>{t.status}</Badge></PageHead>
      <div className="grid cols-2">
        <section className="card"><h2>Details</h2>
          <ActionForm action={updateTeacher} submit="Save details" resetOnSuccess={false} className="form-grid">
            <input type="hidden" name="id" value={t.id} />
            <div><label>First name</label><input name="first" defaultValue={t.first_name} required /></div>
            <div><label>Last name</label><input name="last" defaultValue={t.last_name} required /></div>
            <div><label>Phone</label><input name="phone" defaultValue={t.phone ?? ''} inputMode="tel" /></div>
            <div><label>Department</label><select name="department" defaultValue={t.department_id ?? ''}><option value="">None</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          </ActionForm></section>
        <section className="card stack"><h2>Account</h2>
          <ActionForm action={resetUserPassword} submit="Reset password" submitClass="btn gold" resetOnSuccess={false}><input type="hidden" name="user" value={t.user_id} /></ActionForm>
          <p className="small muted">Issues a new temporary password and signs the teacher out everywhere. They must change it at next sign-in.</p>
          <ActionForm action={setUserStatus} submit={t.status === 'active' ? 'Deactivate account' : 'Activate account'} submitClass={t.status === 'active' ? 'btn danger' : 'btn'} resetOnSuccess={false}>
            <input type="hidden" name="user" value={t.user_id} /><input type="hidden" name="status" value={t.status === 'active' ? 'inactive' : 'active'} />
          </ActionForm></section>
      </div>
      <section className="card flat"><div style={{ padding: '1rem 1rem 0' }}><h2>Classes and subjects handled</h2></div>
        <div className="tablewrap"><table><thead><tr><th>Year</th><th>Term</th><th>Class</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>{loads.map((l: any, i: number) => <tr key={i}><td>{l.year_name}</td><td>{l.term_name}</td><td>{l.class_name}</td><td>{l.subject_name}</td><td><Badge tone={l.status === 'active' ? 'ok' : ''}>{l.status}</Badge></td><td><ActionForm action={toggleTeacherAssignment} submit={l.status === 'active' ? 'Deactivate' : 'Reactivate'} submitClass="btn ghost sm" resetOnSuccess={false}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value={l.status === 'active' ? 'inactive' : 'active'} /></ActionForm></td></tr>)}
            {!loads.length && <tr><td colSpan={6} className="empty">This teacher has not chosen any classes yet.</td></tr>}</tbody></table></div></section>
    </div>
  );
}

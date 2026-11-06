import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '@/components/ActionForm';
import { Badge, PageHead } from '@/components/ui';
import Modal from '@/components/Modal';
import { regenerateRegistrationCode, resetUserPassword, setRegistrationOpen } from '../../actions/admin';

export const metadata = { title: 'Teachers' };
export const dynamic = 'force-dynamic';

export default async function TeachersPage() {
  await requireSession(['school_admin']);
  const st = await getSettings();
  const teachers = await query<any>(
    `select t.id, t.user_id, t.teacher_no, t.first_name, t.last_name, u.email, u.status, u.last_login_at, d.name as dept,
            (select count(*)::int from teacher_class_subject_assignments a where a.teacher_id = t.id and a.status = 'active') as loads
       from teacher_profiles t join users u on u.id = t.user_id left join departments d on d.id = t.department_id order by t.last_name, t.first_name`);
  return (
    <div className="stack">
      <PageHead title="Teachers" sub="Teachers create their own accounts and choose their level, classes and subjects. You can review, deactivate and reset passwords here." />
      <section className="card">
        <div className="row spread">
          <div><h2 style={{ marginBottom: '.25rem' }}>Teacher sign-up</h2>
            <p style={{ margin: 0 }}>Teachers register at <strong>/register</strong> on your site with this school access code:</p></div>
          <Badge tone={st.registration_open ? 'ok' : 'bad'}>{st.registration_open ? 'Open' : 'Closed'}</Badge>
        </div>
        <p style={{ margin: '.75rem 0' }}><span className="codebox">{st.registration_code || 'not set'}</span></p>
        <p className="small muted">Share the code only with your teachers, for example on the staff WhatsApp group. Anyone with the code can create a teacher account and see the students of the classes they choose, so change the code if it leaks, and close sign-up once everyone has registered.</p>
        <div className="row">
          <ActionForm action={regenerateRegistrationCode} submit="Generate a new code" submitClass="btn ghost sm" resetOnSuccess={false} />
          <ActionForm action={setRegistrationOpen} submit={st.registration_open ? 'Close sign-up' : 'Open sign-up'} submitClass={st.registration_open ? 'btn danger sm' : 'btn sm'} resetOnSuccess={false}>
            <input type="hidden" name="open" value={st.registration_open ? '0' : '1'} /></ActionForm>
        </div>
      </section>
      <div className="card flat tablewrap"><table>
        <thead><tr><th>No.</th><th>Name</th><th>Sign-in</th><th className="num">Classes and subjects</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
        <tbody>{teachers.map((t: any) => (
          <tr key={t.id}><td>{t.teacher_no}</td><td><strong>{t.last_name}, {t.first_name}</strong></td><td className="small">{t.email}</td><td className="num">{t.loads}</td>
            <td className="small">{t.last_login_at ? fmtDateTime(t.last_login_at, st.timezone) : 'Never'}</td><td><Badge tone={t.status === 'active' ? 'ok' : ''}>{t.status}</Badge></td>
            <td><div className="row-actions"><Link className="btn ghost sm" href={`/teachers/${t.id}`}>Edit</Link>
              <Modal trigger="Reset password" title={`Reset password for ${t.first_name} ${t.last_name}`}>
                <p>Use this when a teacher forgets their password. They will be signed out everywhere and must change the new password the first time they sign in.</p>
                <ActionForm action={resetUserPassword} submit="Reset password" submitClass="btn gold" resetOnSuccess={false} className="stack">
                  <input type="hidden" name="user" value={t.user_id} />
                  <div><label htmlFor={`tp-${t.id}`}>New temporary password (optional)</label><input id={`tp-${t.id}`} name="temp" autoComplete="off" placeholder="Leave blank to generate one" /><span className="small muted">At least 8 characters with letters and numbers.</span></div>
                </ActionForm></Modal></div></td></tr>))}
          {!teachers.length && <tr><td colSpan={7} className="empty">No teacher has registered yet. Give your teachers the sign-up link and the access code above.</td></tr>}
        </tbody></table></div>
    </div>
  );
}

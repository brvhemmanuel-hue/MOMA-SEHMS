import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '@/components/ActionForm';
import { Badge, PageHead } from '@/components/ui';
import DeleteButton from '@/components/DeleteButton';
import { createExternalAdmin, resetUserPassword, setUserStatus } from '../../actions/admin';

export const metadata = { title: 'External Administrator' };

export default async function AccountsPage() {
  await requireSession(['school_admin']);
  const tz = (await getSettings()).timezone;
  const rows = await query<any>("select id, email, full_name, phone, status, last_login_at from users where role='external_admin' order by full_name");
  return (
    <div className="stack">
      <PageHead title="External Administrator" sub="Read-only school-wide oversight. Accounts are created only here; there is no self-registration." />
      <details className="panel" open={!rows.length}><summary>Create External Administrator account</summary><div>
        <ActionForm action={createExternalAdmin} submit="Create account" className="form-grid">
          <div><label>Full name</label><input name="name" required /></div><div><label>Email or username</label><input name="email" required autoCapitalize="none" /></div>
          <div><label>Phone</label><input name="phone" inputMode="tel" /></div>
        </ActionForm></div></details>
      <div className="card flat tablewrap"><table><thead><tr><th>Name</th><th>Sign-in</th><th>Last sign-in</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{rows.map((u: any) => (
          <tr key={u.id}><td>{u.full_name}</td><td className="small">{u.email}</td><td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at, tz) : 'Never'}</td><td><Badge tone={u.status === 'active' ? 'ok' : ''}>{u.status}</Badge></td>
            <td><div className="row">
              <ActionForm action={resetUserPassword} submit="Reset password" submitClass="btn ghost sm" resetOnSuccess={false}><input type="hidden" name="user" value={u.id} /></ActionForm>
              <DeleteButton kind="external_admin" id={u.id} name={u.full_name} />
              <ActionForm action={setUserStatus} submit={u.status === 'active' ? 'Deactivate' : 'Activate'} submitClass="btn ghost sm" resetOnSuccess={false}><input type="hidden" name="user" value={u.id} /><input type="hidden" name="status" value={u.status === 'active' ? 'inactive' : 'active'} /></ActionForm>
            </div></td></tr>))}
          {!rows.length && <tr><td colSpan={5} className="empty">No External Administrator yet.</td></tr>}</tbody></table></div>
    </div>
  );
}

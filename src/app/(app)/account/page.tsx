import { requireSession } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { PageHead } from '@/components/ui';
import { changePasswordAction } from '../../actions/auth';

export const metadata = { title: 'Password' };

export default async function AccountPage() {
  const s = await requireSession();
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <PageHead title="Password" sub={`Signed in as ${s.email}`} />
      <div className="card"><ActionForm action={changePasswordAction} submit="Change password" className="stack" resetOnSuccess={false}>
        <div><label htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
        <div><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required /></div>
        <div><label htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></div>
      </ActionForm><p className="small muted" style={{ marginTop: '.75rem' }}>Changing your password signs you out on other devices.</p></div>
    </div>
  );
}

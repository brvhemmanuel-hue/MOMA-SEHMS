import { requireSession } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import PasswordInput from '@/components/PasswordInput';
import { PageHead } from '@/components/ui';
import { changePasswordAction } from '../../actions/auth';

export const metadata = { title: 'Password' };

export default async function AccountPage() {
  const s = await requireSession();
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <PageHead title="Password" sub={`Signed in as ${s.email}`} />
      <div className="card"><ActionForm action={changePasswordAction} submit="Change password" className="stack" resetOnSuccess={false}>
        <div><label htmlFor="current">Current password</label><PasswordInput id="current" name="current" autoComplete="current-password" /></div>
        <div><label htmlFor="next">New password</label><PasswordInput id="next" name="next" autoComplete="new-password" minLength={8} /></div>
        <div><label htmlFor="confirm">Confirm new password</label><PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} /></div>
      </ActionForm><p className="small muted" style={{ marginTop: '.75rem' }}>Changing your password signs you out on other devices.</p></div>
    </div>
  );
}

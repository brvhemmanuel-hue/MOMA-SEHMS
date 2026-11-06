import Image from 'next/image';
import { requireSession } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import PasswordInput from '@/components/PasswordInput';
import { changePasswordAction, logoutAction } from '../actions/auth';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const s = await requireSession(undefined, { allowMustChange: true });
  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: '2rem 1rem' }}>
      <Image src="/logo.jpg" alt="Mount Olivet Methodist Academy" width={588} height={279} style={{ width: 240, height: 'auto' }} />
      <h1 style={{ marginTop: '1rem' }}>{s.mustChangePassword ? 'Choose a new password' : 'Change password'}</h1>
      {s.mustChangePassword && <p className="muted">For security, replace the temporary password before you continue.</p>}
      <div className="card">
        <ActionForm action={changePasswordAction} submit="Save new password" className="stack" resetOnSuccess={false}>
          <div><label htmlFor="current">{s.mustChangePassword ? 'Temporary password' : 'Current password'}</label><PasswordInput id="current" name="current" autoComplete="current-password" /></div>
          <div><label htmlFor="next">New password</label><PasswordInput id="next" name="next" autoComplete="new-password" minLength={8} /><span className="small muted">At least 8 characters, with letters and numbers.</span></div>
          <div><label htmlFor="confirm">Confirm new password</label><PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} /></div>
        </ActionForm>
      </div>
      <form action={logoutAction} style={{ marginTop: '1rem' }}><button className="btn ghost sm">Sign out</button></form>
    </main>
  );
}

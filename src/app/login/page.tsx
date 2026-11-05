import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { loginAction } from '../actions/auth';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect('/dashboard');
  return (
    <main className="login">
      <section className="login-art" aria-label="Mount Olivet Methodist Academy">
        <div>
          <h2>Know who has handed in work, and when.</h2>
          <p>Record exercises and homework, track submissions against deadlines, and keep every class on schedule.</p>
        </div>
      </section>
      <section className="login-panel">
        <Image className="logo" src="/logo.jpg" alt="Mt. Olivet Methodist Academy, Dansoman-Accra. The Truth Stands." width={588} height={279} priority style={{ height: 'auto' }} />
        <h1>Sign in</h1>
        <p className="muted">Use the account issued by the School Administrator.</p>
        <ActionForm action={loginAction} submit="Sign in" resetOnSuccess={false} className="stack" submitClass="btn gold">
          <div><label htmlFor="email">Email or username</label><input id="email" name="email" autoComplete="username" required autoCapitalize="none" /></div>
          <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        </ActionForm>
        <p className="small muted" style={{ marginTop: '1.5rem' }}>Students do not sign in. Teachers record submissions on their behalf.</p>
      </section>
    </main>
  );
}

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import PasswordInput from '@/components/PasswordInput';
import Link from 'next/link';
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
        <p className="muted">Teachers and administrators sign in here.</p>
        <ActionForm action={loginAction} submit="Sign in" resetOnSuccess={false} className="stack" submitClass="btn gold">
          <div><label htmlFor="email">Email or username</label><input id="email" name="email" autoComplete="username" required autoCapitalize="none" /></div>
          <div><label htmlFor="password">Password</label><PasswordInput id="password" name="password" autoComplete="current-password" /></div>
        </ActionForm>
        <p style={{ marginTop: '1.25rem' }}>New teacher? <Link href="/register"><strong>Create your account</strong></Link></p>
        <p className="small muted">Students do not sign in. Teachers record submissions on their behalf.</p>
      </section>
    </main>
  );
}

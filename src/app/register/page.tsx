import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { registrationContext } from '@/lib/registration';
import { ActionForm } from '@/components/ActionForm';
import PasswordInput from '@/components/PasswordInput';
import ClassSubjectPicker from '@/components/ClassSubjectPicker';
import { registerTeacher } from '../actions/register';

export const metadata = { title: 'Teacher sign-up' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await getSession()) redirect('/dashboard');
  const ctx = await registrationContext();
  return (
    <main className="login">
      <section className="login-art" aria-label="Mount Olivet Methodist Academy">
        <div>
          <h2>Create your teacher account.</h2>
          <p>Choose your level, your classes and your subjects. You will see only those students and can start recording submissions straight away.</p>
        </div>
      </section>
      <section className="login-panel wide">
        <Image className="logo" src="/logo.jpg" alt="Mt. Olivet Methodist Academy, Dansoman-Accra. The Truth Stands." width={588} height={279} priority style={{ height: 'auto', width: 240 }} />
        <h1>Teacher sign-up</h1>
        {!ctx.ready ? (
          <div className="alert info" role="status">{ctx.message}</div>
        ) : (
          <ActionForm action={registerTeacher} submit="Create my account" resetOnSuccess={false} className="stack" submitClass="btn gold">
            <p className="muted" style={{ margin: 0 }}>Academic year {ctx.yearName}. Your School Administrator gives you the school access code.</p>
            <div className="form-grid" style={{ alignItems: 'start' }}>
              <div><label htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" required placeholder="First and last name" /></div>
              <div><label htmlFor="email">Email or username</label><input id="email" name="email" autoComplete="username" autoCapitalize="none" required /></div>
              <div><label htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="0244 000 000" /></div>
              <div><label htmlFor="code">School access code</label><input id="code" name="code" autoCapitalize="characters" autoComplete="off" required /></div>
              <div><label htmlFor="password">Password</label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} /><span className="small muted">At least 8 characters, with letters and numbers.</span></div>
              <div><label htmlFor="confirm">Confirm password</label><PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} /></div>
            </div>
            <ClassSubjectPicker classes={ctx.classes} subjects={ctx.subjects} />
          </ActionForm>
        )}
        <p className="small" style={{ marginTop: '1.25rem' }}>Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}

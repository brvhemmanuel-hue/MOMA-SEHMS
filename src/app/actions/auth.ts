'use server';
import { redirect } from 'next/navigation';
import { one, query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { clearRateLimit, clientIp, endSession, getSession, hashPassword, rateLimit, requireSession, startSession, verifyPassword } from '@/lib/auth';
import { clean, passwordProblem } from '@/lib/validators';
import type { FormState } from '@/components/ActionForm';

const GENERIC = 'Sign-in failed. Check your username and password, or contact the School Administrator.';
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5pQ5lq1dK0v6z1fJm2l1o0bq7oV3a3W';

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = clean(fd.get('email')).toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your username or email and your password.' };
  const allowed = (await rateLimit(`login:ip:${clientIp()}`, 40, 900)) && (await rateLimit(`login:user:${email}`, 6, 900));
  if (!allowed) return { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' };

  const u = await one<any>('select id, password_hash, status, must_change_password, temp_password_expires_at, session_version from users where lower(email) = $1', [email]);
  const good = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !good || u.status !== 'active') {
    await audit(u?.id ?? null, 'auth.login_failed', 'user', u?.id, { reason: !u ? 'unknown' : u.status !== 'active' ? 'inactive' : 'bad_password' });
    return { error: GENERIC };
  }
  if (u.must_change_password && u.temp_password_expires_at && new Date(u.temp_password_expires_at) < new Date()) {
    return { error: 'Your temporary password has expired. Ask the School Administrator for a new one.' };
  }
  await clearRateLimit(`login:user:${email}`);
  await query('update users set last_login_at = now() where id = $1', [u.id]);
  await startSession(u.id, u.session_version);
  await audit(u.id, 'auth.login', 'user', u.id);
  redirect(u.must_change_password ? '/change-password' : '/dashboard');
}

export async function logoutAction() {
  const s = await getSession();
  endSession();
  if (s) await audit(s.userId, 'auth.logout', 'user', s.userId);
  redirect('/login');
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(undefined, { allowMustChange: true });
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('next') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  const u = await one<any>('select password_hash from users where id = $1', [s.userId]);
  if (!u || !(await verifyPassword(current, u.password_hash))) return { error: 'The current password is not correct.' };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== confirm) return { error: 'The new password and confirmation do not match.' };
  if (next === current) return { error: 'Choose a password different from the current one.' };
  const rows = await query<{ session_version: number }>(
    `update users set password_hash = $2, must_change_password = false, temp_password_expires_at = null,
            session_version = session_version + 1, updated_at = now() where id = $1 returning session_version`,
    [s.userId, await hashPassword(next)],
  );
  await startSession(s.userId, rows[0].session_version); // other devices are signed out
  await audit(s.userId, 'auth.password_changed', 'user', s.userId);
  redirect('/dashboard');
}

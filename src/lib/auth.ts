import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { one, query } from './db';

export type Role = 'school_admin' | 'external_admin' | 'teacher';
export type Session = {
  userId: string; email: string; fullName: string; role: Role;
  mustChangePassword: boolean; teacherId: string | null; teacherNo: string | null;
};

const COOKIE = 'moma_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 24) throw new Error('AUTH_SECRET must be set to a long random string');
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw: string, cost = 12) => bcrypt.hash(pw, cost);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Unambiguous characters; shown once to the administrator, never stored in plain text. */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out.slice(0, 5) + '-' + out.slice(5) + '7';
}

export async function startSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export function endSession() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Validates the cookie AND the database row on every request so deactivation/reset revokes sessions immediately. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const row = await one<any>(
      `select u.id, u.email, u.full_name, u.role, u.status, u.must_change_password, u.session_version,
              t.id as teacher_id, t.teacher_no
       from users u left join teacher_profiles t on t.user_id = u.id where u.id = $1`,
      [payload.sub],
    );
    if (!row || row.status !== 'active' || row.session_version !== payload.sv) return null;
    return {
      userId: row.id, email: row.email, fullName: row.full_name, role: row.role,
      mustChangePassword: row.must_change_password, teacherId: row.teacher_id, teacherNo: row.teacher_no,
    };
  } catch (e: any) {
    // Expired or tampered tokens are normal. Anything else (for example a database problem) must be visible in the logs.
    if (!String(e?.code ?? '').startsWith('ERR_JW')) console.error('getSession failed:', e);
    return null;
  }
});

/** Use in server components and actions. Redirects to /login or /change-password as needed. */
export async function requireSession(roles?: Role[], opts: { allowMustChange?: boolean } = {}): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.mustChangePassword && !opts.allowMustChange) redirect('/change-password');
  if (roles && !roles.includes(s.role)) redirect('/dashboard');
  return s;
}

export function clientIp(): string {
  const h = headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Database-backed rate limiter (serverless instances share no memory). Returns true when allowed. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const rows = await query<{ count: number }>(
    `insert into rate_limits (key, count, reset_at) values ($1, 1, now() + ($2 || ' seconds')::interval)
     on conflict (key) do update set
       count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
       reset_at = case when rate_limits.reset_at < now() then now() + ($2 || ' seconds')::interval else rate_limits.reset_at end
     returning count`,
    [key, String(windowSeconds)],
  );
  return rows[0].count <= max;
}

export async function clearRateLimit(key: string) {
  await query('delete from rate_limits where key = $1', [key]);
}

/** Revokes every session of a user (used on reset, deactivation, password change). */
export async function revokeSessions(userId: string) {
  await query('update users set session_version = session_version + 1, updated_at = now() where id = $1', [userId]);
}

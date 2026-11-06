'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, query, tx, type Db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { clientIp, hashPassword, rateLimit, requireSession, startSession } from '@/lib/auth';
import { clean, isEmailOrUsername, normalisePhone, passwordProblem } from '@/lib/validators';
import { nextRef } from '@/lib/ids';
import { getSettings } from '@/lib/settings';
import { codesMatch, registrationContext } from '@/lib/registration';
import type { FormState } from '@/components/ActionForm';

const UUID = /^[0-9a-f-]{36}$/i;

/** Saves the class x subject combinations for a teacher in the current term. Returns how many were saved. */
async function saveLoads(db: Db, teacherId: string, ctx: { termId: string; yearId: string }, classIds: string[], subjectIds: string[]) {
  let n = 0;
  for (const c of classIds) for (const s of subjectIds) {
    await db.query(
      `insert into teacher_class_subject_assignments (teacher_id, class_id, subject_id, academic_year_id, term_id, status)
       values ($1,$2,$3,$4,$5,'active') on conflict (teacher_id, class_id, subject_id, term_id) do update set status = 'active'`,
      [teacherId, c, s, ctx.yearId, ctx.termId]);
    n++;
  }
  return n;
}

function pickIds(fd: FormData, key: string) {
  return [...new Set(fd.getAll(key).map((v) => String(v)).filter((v) => UUID.test(v)))];
}

export async function registerTeacher(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await rateLimit(`register:${clientIp()}`, 10, 3600))) return { error: 'Too many attempts from this device. Please wait an hour and try again.' };
  const ctx = await registrationContext();
  if (!ctx.ready) return { error: ctx.message };
  const st = await getSettings();
  if (!codesMatch(String(fd.get('code') ?? ''), st.registration_code)) return { error: 'The school access code is not correct. Ask the School Administrator for the current code.' };

  const name = clean(fd.get('name')), email = clean(fd.get('email')), phone = normalisePhone(fd.get('phone'));
  const password = String(fd.get('password') ?? ''), confirm = String(fd.get('confirm') ?? '');
  if (name.split(' ').length < 2) return { error: 'Enter your first and last name.' };
  if (!isEmailOrUsername(email)) return { error: 'Enter a valid email address, or a username of 3 to 40 letters, numbers, dots, dashes or underscores.' };
  if (phone === null) return { error: 'The phone number does not look right.' };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem };
  if (password !== confirm) return { error: 'The password and its confirmation do not match.' };

  const validClass = new Set(ctx.classes.map((c) => c.id)), validSubject = new Set(ctx.subjects.map((s) => s.id));
  const classIds = pickIds(fd, 'class').filter((c) => validClass.has(c)), subjectIds = pickIds(fd, 'subject').filter((s) => validSubject.has(s));
  if (!classIds.length) return { error: 'Choose at least one class.' };
  if (!subjectIds.length) return { error: 'Choose at least one subject.' };

  const exists = await one('select 1 from users where lower(email) = lower($1)', [email]);
  if (exists) return { error: 'An account with that email or username already exists. Try signing in instead.' };

  const [first, ...rest] = name.split(' ');
  const hash = await hashPassword(password);
  const teacherNo = await nextRef('teacher');
  let userId = '', sv = 1;
  try {
    await tx(async (db) => {
      const [u] = await db.query<{ id: string; session_version: number }>(
        `insert into users (email, full_name, phone, password_hash, role, status, must_change_password) values ($1,$2,$3,$4,'teacher','active',false) returning id, session_version`,
        [email, name, phone || null, hash]);
      userId = u.id; sv = u.session_version;
      const [t] = await db.query<{ id: string }>('insert into teacher_profiles (user_id, teacher_no, first_name, last_name, phone) values ($1,$2,$3,$4,$5) returning id', [u.id, teacherNo, first, rest.join(' '), phone || null]);
      await saveLoads(db, t.id, ctx, classIds, subjectIds);
      await audit(u.id, 'teacher.register', 'teacher', t.id, { teacherNo, classes: classIds.length, subjects: subjectIds.length }, db);
      await db.query(
        `insert into notifications (user_id, type, message, link) select id, 'teacher_registered', $1, '/teachers' from users where role = 'school_admin' and status = 'active'`,
        [`${name} registered as a teacher (${teacherNo}).`]);
    });
  } catch (e: any) {
    if (e?.code === '23505') return { error: 'An account with that email or username already exists.' };
    console.error('registerTeacher failed', e);
    return { error: 'Something went wrong while creating your account. Nothing was saved. Please try again.' };
  }
  await startSession(userId, sv);
  redirect('/dashboard');
}

export async function addMyClasses(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher']);
  const ctx = await registrationContext(false);
  if (!ctx.ready) return { error: ctx.message };
  const validClass = new Set(ctx.classes.map((c) => c.id)), validSubject = new Set(ctx.subjects.map((x) => x.id));
  const classIds = pickIds(fd, 'class').filter((c) => validClass.has(c)), subjectIds = pickIds(fd, 'subject').filter((x) => validSubject.has(x));
  if (!classIds.length) return { error: 'Choose at least one class.' };
  if (!subjectIds.length) return { error: 'Choose at least one subject.' };
  const n = await tx(async (db) => {
    const n = await saveLoads(db, s.teacherId!, ctx, classIds, subjectIds);
    await audit(s.userId, 'teacher.add_classes', 'teacher', s.teacherId!, { combinations: n }, db);
    return n;
  });
  revalidatePath('/my-classes');
  return { ok: `Saved ${n} class and subject ${n === 1 ? 'combination' : 'combinations'}. The students in those classes are now available to you.` };
}

export async function removeMyLoad(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher']);
  const id = clean(fd.get('id'));
  if (!UUID.test(id)) return { error: 'Not found.' };
  const r = await query('update teacher_class_subject_assignments set status = $3 where id = $1 and teacher_id = $2 returning id', [id, s.teacherId, 'inactive']);
  if (!r.length) return { error: 'Not found.' };
  await audit(s.userId, 'teacher.remove_class', 'teacher_assignment', id);
  revalidatePath('/my-classes');
  return { ok: 'Removed. Past assignments and their records are kept.' };
}

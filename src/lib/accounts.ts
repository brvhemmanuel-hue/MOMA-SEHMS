import 'server-only';
import { generateTempPassword, hashPassword } from './auth';
import { nextRef } from './ids';
import { getSettings } from './settings';
import type { Db } from './db';

/** Creates a user + teacher profile. Returns the one-time temporary password (never stored in plain text). */
export async function createTeacherAccount(
  db: Db,
  d: { email: string; firstName: string; lastName: string; phone?: string | null; departmentId?: string | null; status?: string },
) {
  const settings = await getSettings();
  const temp = generateTempPassword();
  const hash = await hashPassword(temp, 10);
  const teacherNo = await nextRef('teacher');
  const [u] = await db.query<{ id: string }>(
    `insert into users (email, full_name, phone, password_hash, role, status, must_change_password, temp_password_expires_at)
     values ($1,$2,$3,$4,'teacher',$5,true, now() + ($6 || ' hours')::interval) returning id`,
    [d.email, `${d.firstName} ${d.lastName}`.trim(), d.phone || null, hash, d.status || 'active', String(settings.temp_password_hours)],
  );
  const [t] = await db.query<{ id: string }>(
    `insert into teacher_profiles (user_id, teacher_no, first_name, last_name, phone, department_id)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [u.id, teacherNo, d.firstName, d.lastName, d.phone || null, d.departmentId || null],
  );
  return { userId: u.id, teacherId: t.id, teacherNo, tempPassword: temp };
}

export async function createExternalAdminAccount(db: Db, d: { email: string; fullName: string; phone?: string | null; status?: string }) {
  const settings = await getSettings();
  const temp = generateTempPassword();
  const [u] = await db.query<{ id: string }>(
    `insert into users (email, full_name, phone, password_hash, role, status, must_change_password, temp_password_expires_at)
     values ($1,$2,$3,$4,'external_admin',$5,true, now() + ($6 || ' hours')::interval) returning id`,
    [d.email, d.fullName, d.phone || null, await hashPassword(temp, 10), d.status || 'active', String(settings.temp_password_hours)],
  );
  return { userId: u.id, tempPassword: temp };
}

/** Admin password reset: issues a new temporary password, forces change at next login, revokes sessions. */
export async function resetPassword(db: Db, userId: string, chosen?: string) {
  const settings = await getSettings();
  const temp = chosen || generateTempPassword();
  await db.query(
    `update users set password_hash=$2, must_change_password=true, session_version=session_version+1,
            temp_password_expires_at = now() + ($3 || ' hours')::interval, updated_at=now() where id=$1`,
    [userId, await hashPassword(temp, 10), String(settings.temp_password_hours)],
  );
  return temp;
}

export async function enrollStudent(db: Db, studentId: string, classId: string, effectiveFrom?: string) {
  const open = await db.query<{ id: string; class_id: string }>(
    'select id, class_id from student_class_history where student_id=$1 and effective_to is null', [studentId]);
  if (open[0]?.class_id === classId) return false;
  const from = effectiveFrom || new Date().toISOString().slice(0, 10);
  if (open[0]) await db.query('update student_class_history set effective_to=$2 where id=$1', [open[0].id, from]);
  await db.query('insert into student_class_history (student_id, class_id, effective_from) values ($1,$2,$3)', [studentId, classId, from]);
  return true;
}

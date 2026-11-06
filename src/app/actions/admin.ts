'use server';
import { revalidatePath } from 'next/cache';
import { one, query, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireSession, revokeSessions } from '@/lib/auth';
import { clean, isEmailOrUsername, normalisePhone, passwordProblem } from '@/lib/validators';
import { nextRef } from '@/lib/ids';
import { createExternalAdminAccount, enrollStudent, resetPassword } from '@/lib/accounts';
import { detectSection, type SectionKey } from '@/lib/levels';
import { newRegistrationCode } from '@/lib/registration';
import type { FormState } from '@/components/ActionForm';

const admin = () => requireSession(['school_admin']);
const f = (fd: FormData, k: string) => clean(fd.get(k));
const id = (fd: FormData, k: string) => { const v = f(fd, k); return /^[0-9a-f-]{36}$/i.test(v) ? v : ''; };
const date = (fd: FormData, k: string) => { const v = f(fd, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };

function problem(e: any): FormState {
  if (e?.code === '23505') return { error: 'That already exists. Check the name, email or combination and try again.' };
  if (e?.code === '23503') return { error: 'A referenced record was not found or is still in use.' };
  if (e?.code === '23514') return { error: 'One of the values is not allowed (for example an end date before the start date).' };
  console.error(e);
  return { error: 'Something went wrong while saving. Nothing was changed. Please try again.' };
}
const done = (path: string, ok: string): FormState => { revalidatePath(path); return { ok }; };

/** When a new term becomes current, teachers keep their classes and subjects for the same academic year. */
async function carryOver(db: { query: (t: string, p?: unknown[]) => Promise<any[]> }, newTermId: string) {
  await db.query(
    `insert into teacher_class_subject_assignments (teacher_id, class_id, subject_id, academic_year_id, term_id, status)
     select a.teacher_id, a.class_id, a.subject_id, a.academic_year_id, $1, 'active'
       from teacher_class_subject_assignments a join terms nt on nt.id = $1
      where a.status = 'active' and a.academic_year_id = nt.academic_year_id and a.term_id <> $1
     on conflict (teacher_id, class_id, subject_id, term_id) do nothing`, [newTermId]);
}

/* ---------- academic structure ---------- */
export async function createYear(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const name = f(fd, 'name'), start = date(fd, 'start'), end = date(fd, 'end');
  if (!name || !start || !end) return { error: 'Enter a name, start date and end date.' };
  if (end < start) return { error: 'The end date must be on or after the start date.' };
  try {
    await tx(async (db) => {
      if (fd.get('current')) await db.query('update academic_years set is_current=false');
      const [y] = await db.query<{ id: string }>('insert into academic_years (name,start_date,end_date,is_current) values ($1,$2,$3,$4) returning id', [name, start, end, !!fd.get('current')]);
      await audit(s.userId, 'year.create', 'academic_year', y.id, { name }, db);
    });
  } catch (e) { return problem(e); }
  return done('/setup', `Academic year ${name} created.`);
}

export async function createTerm(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const yearId = id(fd, 'year'), name = f(fd, 'name'), start = date(fd, 'start'), end = date(fd, 'end');
  if (!yearId || !name || !start || !end) return { error: 'Choose a year and enter a name, start date and end date.' };
  if (end < start) return { error: 'The end date must be on or after the start date.' };
  try {
    await tx(async (db) => {
      if (fd.get('current')) { await db.query('update terms set is_current=false'); await db.query('update academic_years set is_current=(id=$1)', [yearId]); }
      const [t] = await db.query<{ id: string }>('insert into terms (academic_year_id,name,start_date,end_date,is_current) values ($1,$2,$3,$4,$5) returning id', [yearId, name, start, end, !!fd.get('current')]);
      if (fd.get('current')) await carryOver(db, t.id);
      await audit(s.userId, 'term.create', 'term', t.id, { name }, db);
    });
  } catch (e) { return problem(e); }
  return done('/setup', `${name} created.`);
}

export async function updateYear(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const yId = id(fd, 'id'), name = f(fd, 'name'), start = date(fd, 'start'), end = date(fd, 'end');
  if (!yId || !name || !start || !end) return { error: 'Enter a name, start date and end date.' };
  if (end < start) return { error: 'The end date must be on or after the start date.' };
  try { await query('update academic_years set name=$2, start_date=$3, end_date=$4 where id=$1', [yId, name, start, end]); await audit(s.userId, 'year.update', 'academic_year', yId, { name }); }
  catch (e) { return problem(e); }
  return done('/setup', 'Academic year updated.');
}

export async function updateTerm(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const tId = id(fd, 'id'), name = f(fd, 'name'), start = date(fd, 'start'), end = date(fd, 'end');
  if (!tId || !name || !start || !end) return { error: 'Enter a name, start date and end date.' };
  if (end < start) return { error: 'The end date must be on or after the start date.' };
  try { await query('update terms set name=$2, start_date=$3, end_date=$4 where id=$1', [tId, name, start, end]); await audit(s.userId, 'term.update', 'term', tId, { name }); }
  catch (e) { return problem(e); }
  return done('/setup', 'Term updated.');
}

export async function setCurrentTerm(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const termId = id(fd, 'term');
  const t = await one<{ academic_year_id: string; name: string }>('select academic_year_id, name from terms where id=$1', [termId]);
  if (!t) return { error: 'Term not found.' };
  await tx(async (db) => {
    await db.query('update terms set is_current = (id=$1)', [termId]);
    await db.query('update academic_years set is_current = (id=$1)', [t.academic_year_id]);
    await carryOver(db, termId);
    await audit(s.userId, 'term.set_current', 'term', termId, {}, db);
  });
  return done('/setup', `${t.name} is now the current term.`);
}

export async function saveDepartment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const dId = id(fd, 'id'), name = f(fd, 'name'), status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!name) return { error: 'Enter a department name.' };
  try {
    if (dId) await query('update departments set name=$2, status=$3 where id=$1', [dId, name, status]);
    else await query('insert into departments (name) values ($1)', [name]);
    await audit(s.userId, dId ? 'department.update' : 'department.create', 'department', dId || undefined, { name });
  } catch (e) { return problem(e); }
  return done('/setup', dId ? 'Department updated.' : `Department ${name} created.`);
}

/* ---------- classes & subjects ---------- */
export async function saveClass(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const cId = id(fd, 'id'), name = f(fd, 'name'), level = f(fd, 'level') || null, programme = f(fd, 'programme') || null;
  const dept = id(fd, 'department') || null, year = id(fd, 'year'), status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!name) return { error: 'Enter a class name.' };
  const picked = f(fd, 'section');
  const section: SectionKey | null = ['lower_primary', 'upper_primary', 'jhs'].includes(picked) ? (picked as SectionKey) : detectSection(name, level);
  if (!section) return { error: 'Choose the level (Lower Primary, Upper Primary or JHS) for this class.' };
  try {
    if (cId) {
      await query('update classes set name=$2, level=$3, programme=$4, department_id=$5, status=$6, section=$7 where id=$1', [cId, name, level, programme, dept, status, section]);
      await audit(s.userId, 'class.update', 'class', cId, { name });
      return done('/classes', 'Class updated.');
    }
    if (!year) return { error: 'Choose an academic year.' };
    const code = await nextRef('class');
    const [c] = await query<{ id: string }>('insert into classes (class_code,name,level,section,programme,department_id,academic_year_id,status) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [code, name, level, section, programme, dept, year, status]);
    await audit(s.userId, 'class.create', 'class', c.id, { name, code });
    return done('/classes', `Class ${name} created with code ${code}.`);
  } catch (e) { return problem(e); }
}

export async function saveSubject(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const sId = id(fd, 'id'), name = f(fd, 'name'), dept = id(fd, 'department') || null, status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!name) return { error: 'Enter a subject name.' };
  try {
    if (sId) {
      await query('update subjects set name=$2, department_id=$3, status=$4 where id=$1', [sId, name, dept, status]);
      await audit(s.userId, 'subject.update', 'subject', sId, { name });
      return done('/subjects', 'Subject updated.');
    }
    const code = await nextRef('subject');
    const [r] = await query<{ id: string }>('insert into subjects (subject_code,name,department_id,status) values ($1,$2,$3,$4) returning id', [code, name, dept, status]);
    await audit(s.userId, 'subject.create', 'subject', r.id, { name, code });
    return done('/subjects', `Subject ${name} created with code ${code}.`);
  } catch (e) { return problem(e); }
}

/* ---------- accounts ---------- */
export async function updateTeacher(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const tId = id(fd, 'id'), first = f(fd, 'first'), last = f(fd, 'last'), dept = id(fd, 'department') || null, phone = normalisePhone(fd.get('phone'));
  if (!tId || !first || !last) return { error: 'Enter the first and last name.' };
  if (phone === null) return { error: 'The phone number does not look right.' };
  const t = await one<{ user_id: string }>('select user_id from teacher_profiles where id=$1', [tId]);
  if (!t) return { error: 'Teacher not found.' };
  await tx(async (db) => {
    await db.query('update teacher_profiles set first_name=$2,last_name=$3,phone=$4,department_id=$5 where id=$1', [tId, first, last, phone || null, dept]);
    await db.query('update users set full_name=$2, phone=$3, updated_at=now() where id=$1', [t.user_id, `${first} ${last}`, phone || null]);
    await audit(s.userId, 'teacher.update', 'teacher', tId, {}, db);
  });
  return done(`/teachers/${tId}`, 'Teacher details saved.');
}

export async function setUserStatus(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const uId = id(fd, 'user'), status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!uId) return { error: 'User not found.' };
  if (uId === s.userId) return { error: 'You cannot deactivate your own account.' };
  await query('update users set status=$2, updated_at=now() where id=$1', [uId, status]);
  if (status === 'inactive') await revokeSessions(uId);
  await audit(s.userId, status === 'inactive' ? 'user.deactivate' : 'user.activate', 'user', uId);
  revalidatePath('/teachers'); revalidatePath('/accounts');
  return { ok: status === 'inactive' ? 'Account deactivated and signed out everywhere.' : 'Account activated.' };
}

export async function resetUserPassword(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const uId = id(fd, 'user');
  const u = await one<{ email: string; full_name: string; role: string }>('select email, full_name, role from users where id=$1', [uId]);
  if (!u) return { error: 'User not found.' };
  if (uId === s.userId) return { error: 'Change your own password from the Password page.' };
  const chosen = String(fd.get('temp') ?? '').trim();
  if (chosen) { const bad = passwordProblem(chosen); if (bad) return { error: bad }; }
  const temp = await tx(async (db) => { const t = await resetPassword(db, uId, chosen || undefined); await audit(s.userId, 'user.password_reset', 'user', uId, { chosen: !!chosen }, db); return t; });
  return { ok: 'Password reset. The user must change it at next login.', credential: { name: u.full_name, username: u.email, password: temp, role: u.role === 'teacher' ? 'Teacher' : 'External Administrator' } };
}

export async function createExternalAdmin(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const name = f(fd, 'name'), email = f(fd, 'email'), phone = normalisePhone(fd.get('phone'));
  if (!name) return { error: 'Enter the full name.' };
  if (!isEmailOrUsername(email)) return { error: 'Enter a valid email address or username.' };
  if (phone === null) return { error: 'The phone number does not look right.' };
  try {
    const r = await tx(async (db) => { const a = await createExternalAdminAccount(db, { email, fullName: name, phone }); await audit(s.userId, 'external_admin.create', 'user', a.userId, {}, db); return a; });
    revalidatePath('/accounts');
    return { ok: 'External Administrator account created.', credential: { name, username: email, password: r.tempPassword, role: 'External Administrator' } };
  } catch (e) { return problem(e); }
}

/* ---------- students ---------- */
export async function saveStudent(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const sId = id(fd, 'id'), first = f(fd, 'first'), last = f(fd, 'last'), other = f(fd, 'other') || null, classId = id(fd, 'class');
  const gender = ['male', 'female'].includes(f(fd, 'gender')) ? f(fd, 'gender') : null, status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  if (!first || !last) return { error: 'Enter the first and last name.' };
  if (!classId) return { error: 'Choose a class.' };
  try {
    const cls = await one<{ y: number; name: string }>('select extract(year from y.start_date)::int y, c.name from classes c join academic_years y on y.id=c.academic_year_id where c.id=$1', [classId]);
    if (!cls) return { error: 'Class not found.' };
    if (sId) {
      let moved = false;
      await tx(async (db) => {
        await db.query('update student_profiles set first_name=$2,last_name=$3,other_names=$4,gender=$5,status=$6,updated_at=now() where id=$1', [sId, first, last, other, gender, status]);
        moved = await enrollStudent(db, sId, classId, date(fd, 'effective') || undefined);
        await audit(s.userId, 'student.update', 'student', sId, { movedClass: moved }, db);
      });
      return done('/students', moved ? 'Student updated and moved to the new class. Existing assignments keep their original registers.' : 'Student updated.');
    }
    const no = await nextRef('student', cls.y);
    await tx(async (db) => {
      const [st] = await db.query<{ id: string }>('insert into student_profiles (student_no,first_name,last_name,other_names,gender,status) values ($1,$2,$3,$4,$5,$6) returning id', [no, first, last, other, gender, status]);
      await enrollStudent(db, st.id, classId);
      await audit(s.userId, 'student.create', 'student', st.id, { studentNo: no }, db);
    });
    return done('/students', `Student ${first} ${last} created with number ${no} in ${cls.name}.`);
  } catch (e) { return problem(e); }
}

/* ---------- teacher assignments ---------- */
export async function createTeacherAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const teacherId = id(fd, 'teacher'), classId = id(fd, 'class'), subjectId = id(fd, 'subject'), termId = id(fd, 'term');
  if (!teacherId || !classId || !subjectId || !termId) return { error: 'Choose a teacher, class, subject and term.' };
  const chk = await one<any>(
    `select t.academic_year_id, c.academic_year_id as class_year, u.status from terms t, classes c, teacher_profiles tp join users u on u.id=tp.user_id
      where t.id=$1 and c.id=$2 and tp.id=$3`, [termId, classId, teacherId]);
  if (!chk) return { error: 'One of the selections was not found.' };
  if (chk.status !== 'active') return { error: 'The teacher account must be active.' };
  if (chk.academic_year_id !== chk.class_year) return { error: 'That class belongs to a different academic year from the chosen term.' };
  try {
    await query('insert into teacher_class_subject_assignments (teacher_id,class_id,subject_id,academic_year_id,term_id) values ($1,$2,$3,$4,$5)', [teacherId, classId, subjectId, chk.academic_year_id, termId]);
    await audit(s.userId, 'teacher_assignment.create', 'teacher', teacherId, { classId, subjectId, termId });
  } catch (e) { return problem(e); }
  return done('/teacher-assignments', 'Teacher assignment saved.');
}

export async function toggleTeacherAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const aId = id(fd, 'id'), status = f(fd, 'status') === 'inactive' ? 'inactive' : 'active';
  await query('update teacher_class_subject_assignments set status=$2 where id=$1', [aId, status]);
  await audit(s.userId, 'teacher_assignment.' + status, 'teacher_assignment', aId);
  return done('/teacher-assignments', status === 'active' ? 'Assignment reactivated.' : 'Assignment deactivated. The teacher no longer sees this class and subject.');
}

/* ---------- settings ---------- */
export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const tz = f(fd, 'timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return { error: 'That timezone is not recognised. Use a name like Africa/Accra.' }; }
  const num = (k: string, min: number, max: number) => Math.min(Math.max(Math.round(Number(f(fd, k)) || min), min), max);
  const rows: [string, unknown][] = [
    ['timezone', tz], ['reminder_window_hours', num('reminder_window_hours', 1, 168)], ['repeat_threshold', num('repeat_threshold', 1, 50)],
    ['stale_register_days', num('stale_register_days', 1, 60)], ['import_max_rows', num('import_max_rows', 10, 5000)], ['import_max_mb', num('import_max_mb', 1, 20)],
    ['temp_password_hours', num('temp_password_hours', 1, 720)], ['report_async_threshold', num('report_async_threshold', 100, 50000)], ['report_retention_days', num('report_retention_days', 1, 30)],
  ];
  await tx(async (db) => {
    for (const [k, v] of rows) await db.query('insert into system_settings (key,value) values ($1,$2) on conflict (key) do update set value=$2, updated_at=now()', [k, JSON.stringify(v)]);
    await audit(s.userId, 'settings.update', 'settings', undefined, {}, db);
  });
  return done('/settings', 'Settings saved.');
}

/* ---------- teacher sign-up controls ---------- */
export async function setRegistrationOpen(_: FormState, fd: FormData): Promise<FormState> {
  const s = await admin();
  const open = f(fd, 'open') === '1';
  await query(`insert into system_settings (key,value) values ('registration_open',$1) on conflict (key) do update set value=$1, updated_at=now()`, [JSON.stringify(open)]);
  await audit(s.userId, open ? 'registration.open' : 'registration.close', 'settings');
  return done('/teachers', open ? 'Teacher sign-up is open.' : 'Teacher sign-up is closed. Existing teachers are not affected.');
}

export async function regenerateRegistrationCode(_: FormState, _fd: FormData): Promise<FormState> {
  const s = await admin();
  const code = newRegistrationCode();
  await query(`insert into system_settings (key,value) values ('registration_code',$1) on conflict (key) do update set value=$1, updated_at=now()`, [JSON.stringify(code)]);
  await audit(s.userId, 'registration.code_changed', 'settings');
  return done('/teachers', `New access code: ${code}`);
}

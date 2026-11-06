'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, query, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireSession } from '@/lib/auth';
import { clean } from '@/lib/validators';
import { getSettings } from '@/lib/settings';
import { zonedToUtc } from '@/lib/time';
import { canViewAssignment, teacherCanUse } from '@/lib/rbac';
import { ensureSnapshot } from '@/lib/snapshot';
import type { FormState } from '@/components/ActionForm';

const UUID = /^[0-9a-f-]{36}$/i;

export async function createAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher']);
  const st = await getSettings();
  const [classId, subjectId] = clean(fd.get('pair')).split('|');
  const title = clean(fd.get('title')), type = clean(fd.get('type'));
  const description = String(fd.get('description') ?? '').trim().slice(0, 4000) || null;
  if (!title) return { error: 'Enter a title, for example Algebra Exercise 1.' };
  if (!['class_exercise', 'homework'].includes(type)) return { error: 'Choose class exercise or homework.' };
  if (!UUID.test(classId || '') || !UUID.test(subjectId || '')) return { error: 'Choose one of your classes and subjects.' };
  const assigned = fd.get('assigned') ? zonedToUtc(String(fd.get('assigned')), st.timezone) : new Date();
  const due = zonedToUtc(String(fd.get('due') ?? ''), st.timezone);
  if (!assigned) return { error: 'The assigned date is not valid.' };
  if (!due) return { error: 'Enter a due date and time.' };
  if (due < assigned) return { error: 'The due date must be on or after the assigned date.' };
  if (!s.teacherId || !(await teacherCanUse(s.teacherId, classId, subjectId))) return { error: 'You are not assigned to that class and subject.' };

  const id = await tx(async (db) => {
    const term = (await db.query<{ id: string }>('select id from terms where is_current limit 1'))[0];
    const students = await db.query<{ student_id: string }>(
      `select h.student_id from student_class_history h join student_profiles p on p.id=h.student_id
        where h.class_id=$1 and h.effective_to is null and p.status='active'`, [classId]);
    const [a] = await db.query<{ id: string }>(
      `insert into assignments (title,type,class_id,subject_id,teacher_id,term_id,assigned_at,original_due_at,current_due_at,description,expected_count,created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11) returning id`,
      [title, type, classId, subjectId, s.teacherId, term?.id ?? null, assigned, due, description, students.length, s.userId]);
    if (students.length) {
      // snapshot of the class register at this moment; later class changes never alter it
      await db.query('insert into assignment_expected_students (assignment_id, student_id) select $1, unnest($2::uuid[])', [a.id, students.map((x) => x.student_id)]);
      await db.query('insert into submission_records (assignment_id, student_id, status) select $1, unnest($2::uuid[]), $3', [a.id, students.map((x) => x.student_id), 'pending']);
    }
    await audit(s.userId, 'assignment.create', 'assignment', a.id, { title, expected: students.length }, db);
    return a.id;
  });
  redirect(`/work/${id}`);
}

type Entry = { studentId: string; status: 'submitted' | 'pending' | 'not_submitted'; submittedAt?: string; note?: string };

export async function saveRegister(assignmentId: string, entries: Entry[]): Promise<FormState> {
  const s = await requireSession(['teacher', 'school_admin']);
  if (!UUID.test(assignmentId) || !(await canViewAssignment(s, assignmentId))) return { error: 'You do not have access to this assignment.' };
  if (!Array.isArray(entries) || entries.length === 0) return { error: 'Nothing to save.' };
  if (entries.length > 1000) return { error: 'Too many changes at once. Save in smaller groups.' };
  const st = await getSettings();
  const a = await one<any>('select id, current_due_at, closed_at, class_id, subject_id from assignments where id=$1', [assignmentId]);
  if (!a) return { error: 'Assignment not found.' };
  if (s.role === 'teacher' && !(await teacherCanUse(s.teacherId!, a.class_id, a.subject_id))) return { error: 'You are no longer assigned to this class and subject.' };
  if (a.closed_at && s.role !== 'school_admin') return { error: 'This assignment is closed. Ask the School Administrator to reopen it.' };
  const due = new Date(a.current_due_at);
  const now = new Date();

  const prepared: { studentId: string; status: string; at: Date | null; note: string | null }[] = [];
  for (const e of entries) {
    if (!UUID.test(e.studentId || '') || !['submitted', 'pending', 'not_submitted'].includes(e.status)) return { error: 'One of the entries is not valid.' };
    let at: Date | null = null; let status: string = e.status;
    if (e.status === 'submitted') {
      at = e.submittedAt ? zonedToUtc(e.submittedAt, st.timezone) : now;
      if (!at) return { error: 'A submission date and time is not valid.' };
      if (at.getTime() > now.getTime() + 5 * 60_000) return { error: 'A submission time cannot be in the future.' };
      status = at <= due ? 'on_time' : 'late'; // classified at the moment of recording against the deadline in force
    }
    prepared.push({ studentId: e.studentId, status, at, note: clean(e.note).slice(0, 300) || null });
  }
  try {
    const changed = await tx(async (db) => {
      const ids = prepared.map((p) => p.studentId);
      const before = await db.query<{ student_id: string; status: string }>('select student_id, status from submission_records where assignment_id=$1 and student_id = any($2::uuid[])', [assignmentId, ids]);
      if (before.length !== new Set(ids).size) throw new Error('A student is not on the expected register for this assignment.');
      const prev = new Map(before.map((b) => [b.student_id, b.status]));
      let corrections = 0;
      for (const p of prepared) {
        if (prev.get(p.studentId) !== 'pending' && prev.get(p.studentId) !== p.status) corrections++;
        await db.query(
          `update submission_records set status=$3, submitted_at=$4, note=$5, entered_by=$6, updated_at=now() where assignment_id=$1 and student_id=$2`,
          [assignmentId, p.studentId, p.status, p.at, p.note, s.userId]);
      }
      await db.query('update assignments set updated_at=now() where id=$1', [assignmentId]);
      await audit(s.userId, corrections ? 'register.correct' : 'register.update', 'assignment', assignmentId, { students: prepared.length, corrections }, db);
      if (due <= now) await ensureSnapshot(assignmentId, 'lazy', db);
      return prepared.length;
    });
    revalidatePath(`/work/${assignmentId}`);
    return { ok: `Saved ${changed} ${changed === 1 ? 'record' : 'records'}.` };
  } catch (e: any) {
    return { error: e?.message?.startsWith('A student') ? e.message : 'Could not save the register. Nothing was changed. Try again.' };
  }
}

export async function extendDeadline(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['school_admin']);
  const id = clean(fd.get('id')), reason = clean(fd.get('reason'));
  const st = await getSettings();
  const next = zonedToUtc(String(fd.get('due') ?? ''), st.timezone);
  if (!UUID.test(id)) return { error: 'Assignment not found.' };
  if (!reason) return { error: 'Give a reason for the change.' };
  if (!next) return { error: 'Enter the new deadline.' };
  const a = await one<any>('select current_due_at, teacher_id, title from assignments where id=$1', [id]);
  if (!a) return { error: 'Assignment not found.' };
  if (next <= new Date(a.current_due_at)) return { error: 'The new deadline must be later than the current one.' };
  await tx(async (db) => {
    if (new Date(a.current_due_at) <= new Date()) await ensureSnapshot(id, 'lazy', db); // preserve the final figures for the deadline being replaced
    await db.query('insert into assignment_deadline_history (assignment_id, previous_due_at, new_due_at, reason, changed_by) values ($1,$2,$3,$4,$5)', [id, a.current_due_at, next, reason, s.userId]);
    await db.query('update assignments set current_due_at=$2, closed_at=null, closed_by=null, updated_at=now() where id=$1', [id, next]);
    await db.query(`update submission_records set status = case when submitted_at <= $2 then 'on_time' else 'late' end where assignment_id=$1 and status in ('on_time','late')`, [id, next]);
    const t = await db.query<{ user_id: string }>('select user_id from teacher_profiles where id=$1', [a.teacher_id]);
    if (t[0]) await db.query(`insert into notifications (user_id,type,message,link) values ($1,'deadline_changed',$2,$3)`, [t[0].user_id, `The deadline for "${a.title}" was extended by the School Administrator.`, `/work/${id}`]);
    await audit(s.userId, 'assignment.deadline_extended', 'assignment', id, { reason }, db);
  });
  revalidatePath(`/work/${id}`);
  return { ok: 'Deadline extended. The original deadline and the earlier on-time figures are kept.' };
}

export async function setClosed(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher', 'school_admin']);
  const id = clean(fd.get('id')), close = clean(fd.get('close')) === '1';
  if (!UUID.test(id) || !(await canViewAssignment(s, id))) return { error: 'You do not have access to this assignment.' };
  if (!close && s.role !== 'school_admin') return { error: 'Only the School Administrator can reopen an assignment.' };
  await query('update assignments set closed_at = $2, closed_by = $3, updated_at=now() where id=$1', [id, close ? new Date() : null, close ? s.userId : null]);
  await audit(s.userId, close ? 'assignment.close' : 'assignment.reopen', 'assignment', id);
  revalidatePath(`/work/${id}`);
  return { ok: close ? 'Assignment closed. History stays viewable.' : 'Assignment reopened.' };
}

/** The creator (teacher) or the School Administrator may change or remove an assignment. */
async function manageable(assignmentId: string, s: { role: string; teacherId: string | null }) {
  const a = await one<any>('select id, title, type, teacher_id, class_id, subject_id, assigned_at, original_due_at, current_due_at, closed_at from assignments where id=$1', [assignmentId]);
  if (!a) return { error: 'Assignment not found.' as const };
  if (s.role === 'teacher') {
    if (a.teacher_id !== s.teacherId) return { error: 'You can only change assignments you created.' as const };
    if (!(await teacherCanUse(s.teacherId!, a.class_id, a.subject_id))) return { error: 'You are no longer assigned to this class and subject.' as const };
    if (a.closed_at) return { error: 'This assignment is closed. Ask the School Administrator.' as const };
  }
  return { a };
}

export async function updateAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher', 'school_admin']);
  const id = clean(fd.get('id'));
  if (!UUID.test(id)) return { error: 'Assignment not found.' };
  const m = await manageable(id, s);
  if ('error' in m) return { error: m.error };
  const a = m.a;
  const st = await getSettings();
  const title = clean(fd.get('title')), type = clean(fd.get('type'));
  const description = String(fd.get('description') ?? '').trim().slice(0, 4000) || null;
  if (!title) return { error: 'Enter a title.' };
  if (!['class_exercise', 'homework'].includes(type)) return { error: 'Choose class exercise or homework.' };
  const due = zonedToUtc(String(fd.get('due') ?? ''), st.timezone);
  if (!due) return { error: 'Enter a due date and time.' };
  if (due < new Date(a.assigned_at)) return { error: 'The due date must be on or after the assigned date.' };
  const dueChanged = +due !== +new Date(a.current_due_at);
  const now = new Date();
  if (dueChanged) {
    if (new Date(a.current_due_at) <= now) return { error: 'The deadline has already passed. Only the School Administrator can extend it, using Extend deadline on the assignment page.' };
    if (due <= now) return { error: 'Choose a due time in the future.' };
  }
  await tx(async (db) => {
    const hasHistory = Number((await db.query<{ n: string }>('select count(*) n from assignment_deadline_history where assignment_id=$1', [id]))[0].n) > 0;
    await db.query(
      `update assignments set title=$2, type=$3, description=$4, current_due_at=$5, original_due_at = case when $6 then original_due_at else $5 end, updated_at=now() where id=$1`,
      [id, title, type, description, due, hasHistory]);
    if (dueChanged) {
      // the deadline had not passed, so this is a correction: re-classify against the new deadline
      await db.query(`update submission_records set status = case when submitted_at <= $2 then 'on_time' else 'late' end where assignment_id=$1 and status in ('on_time','late')`, [id, due]);
    }
    await audit(s.userId, 'assignment.update', 'assignment', id, { title, dueChanged, previousTitle: a.title }, db);
  });
  revalidatePath(`/work/${id}`); revalidatePath('/work');
  return { ok: 'Assignment updated.' };
}

export async function deleteAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher', 'school_admin']);
  const id = clean(fd.get('id'));
  if (!UUID.test(id)) return { error: 'Assignment not found.' };
  const m = await manageable(id, s);
  if ('error' in m) return { error: m.error };
  const a = m.a;
  await tx(async (db) => {
    const n = (await db.query<{ n: string }>(`select count(*) n from submission_records where assignment_id=$1 and status <> 'pending'`, [id]))[0].n;
    // the audit entry keeps what was removed; the assignment, its register and its snapshots are deleted together
    await audit(s.userId, 'assignment.delete', 'assignment', id, { title: a.title, recordedSubmissions: Number(n) }, db);
    await db.query('delete from assignments where id=$1', [id]);
  });
  revalidatePath('/work'); revalidatePath('/dashboard');
  redirect('/work');
}

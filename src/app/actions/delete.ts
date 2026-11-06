'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireSession } from '@/lib/auth';
import { clean } from '@/lib/validators';
import type { FormState } from '@/components/ActionForm';

const KEEP = 'Set its status to inactive instead. That hides it and keeps the history.';
const count = async (sql: string, p: unknown[]) => Number((await one<{ n: string }>(sql, p))?.n ?? 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Deletes one record the administrator owns. Refuses when it would orphan history, and says why. */
export async function deleteRecord(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['school_admin']);
  const kind = clean(fd.get('kind')), id = clean(fd.get('id')), redirectTo = clean(fd.get('redirectTo'));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Not found.' };
  let paths: string[] = [];
  try {
    if (kind === 'subject') {
      const n = await count('select count(*) n from assignments where subject_id=$1', [id]);
      if (n) return { error: `This subject has ${plural(n, 'assignment')} recorded. ${KEEP}` };
      await tx(async (db) => { await db.query('delete from subjects where id=$1', [id]); await audit(s.userId, 'subject.delete', 'subject', id, {}, db); });
      paths = ['/subjects'];
    } else if (kind === 'class') {
      const a = await count('select count(*) n from assignments where class_id=$1', [id]);
      if (a) return { error: `This class has ${plural(a, 'assignment')} recorded. ${KEEP}` };
      const st = await count('select count(*) n from student_class_history where class_id=$1', [id]);
      if (st) return { error: `${plural(st, 'student')} ${st === 1 ? 'is' : 'are'} or ${st === 1 ? 'was' : 'were'} in this class. Move or delete them first, or ${KEEP.toLowerCase()}` };
      await tx(async (db) => { await db.query('delete from classes where id=$1', [id]); await audit(s.userId, 'class.delete', 'class', id, {}, db); });
      paths = ['/classes'];
    } else if (kind === 'teacher') {
      const a = await count('select count(*) n from assignments where teacher_id=$1', [id]);
      if (a) return { error: `This teacher has created ${plural(a, 'assignment')}. Deactivate the account instead, which keeps the records.` };
      const t = await one<{ user_id: string }>('select user_id from teacher_profiles where id=$1', [id]);
      if (!t) return { error: 'Not found.' };
      await tx(async (db) => { await db.query('delete from users where id=$1', [t.user_id]); await audit(s.userId, 'teacher.delete', 'teacher', id, {}, db); });
      paths = ['/teachers', '/teacher-assignments'];
    } else if (kind === 'student') {
      const n = await count('select count(*) n from submission_records where student_id=$1', [id]);
      if (n) return { error: `This student appears on ${plural(n, 'assignment register')}. ${KEEP}` };
      await tx(async (db) => { await db.query('delete from student_profiles where id=$1', [id]); await audit(s.userId, 'student.delete', 'student', id, {}, db); });
      paths = ['/students', '/my-students'];
    } else if (kind === 'term') {
      const t = await one<{ is_current: boolean }>('select is_current from terms where id=$1', [id]);
      if (!t) return { error: 'Not found.' };
      if (t.is_current) return { error: 'This is the current term. Make another term current first.' };
      const n = await count('select count(*) n from assignments where term_id=$1', [id]);
      if (n) return { error: `This term has ${plural(n, 'assignment')} recorded, so it cannot be deleted.` };
      await tx(async (db) => {
        await db.query('delete from teacher_class_subject_assignments where term_id=$1', [id]);
        await db.query('delete from terms where id=$1', [id]);
        await audit(s.userId, 'term.delete', 'term', id, {}, db);
      });
      paths = ['/setup'];
    } else if (kind === 'year') {
      const c = await count('select count(*) n from classes where academic_year_id=$1', [id]);
      if (c) return { error: `This year has ${plural(c, 'class')}. Delete or move the classes first.` };
      await tx(async (db) => {
        await db.query('delete from teacher_class_subject_assignments where academic_year_id=$1', [id]);
        await db.query('delete from academic_years where id=$1', [id]);
        await audit(s.userId, 'year.delete', 'academic_year', id, {}, db);
      });
      paths = ['/setup'];
    } else if (kind === 'department') {
      await tx(async (db) => { await db.query('delete from departments where id=$1', [id]); await audit(s.userId, 'department.delete', 'department', id, {}, db); });
      paths = ['/setup'];
    } else if (kind === 'external_admin') {
      if (id === s.userId) return { error: 'You cannot delete your own account.' };
      const u = await one('select 1 from users where id=$1 and role=$2', [id, 'external_admin']);
      if (!u) return { error: 'Not found.' };
      await tx(async (db) => { await db.query('delete from users where id=$1', [id]); await audit(s.userId, 'external_admin.delete', 'user', id, {}, db); });
      paths = ['/accounts'];
    } else return { error: 'Unknown item.' };
  } catch (e: any) {
    if (e?.code === '23503') return { error: 'This item is still used by other records, so it cannot be deleted. ' + KEEP };
    console.error('deleteRecord failed', e);
    return { error: 'Could not delete. Nothing was changed.' };
  }
  for (const p of paths) revalidatePath(p);
  if (redirectTo.startsWith('/')) redirect(redirectTo);
  return { ok: 'Deleted.' };
}

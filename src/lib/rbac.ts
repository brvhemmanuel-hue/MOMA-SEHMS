import 'server-only';
import { one, query, type Db, defaultDb } from './db';
import type { Session } from './auth';

/** A teacher may act on a class+subject only through an active teacher assignment in the current term
 *  (or any active assignment when no current term is configured). Enforced on the server for every write. */
export async function teacherCanUse(teacherId: string, classId: string, subjectId: string, db: Db = defaultDb) {
  const rows = await db.query(
    `select 1 from teacher_class_subject_assignments a
       join terms t on t.id = a.term_id
      where a.teacher_id = $1 and a.class_id = $2 and a.subject_id = $3 and a.status = 'active'
        and (t.is_current or not exists (select 1 from terms where is_current))
      limit 1`,
    [teacherId, classId, subjectId],
  );
  return rows.length > 0;
}

/** Classes and subjects a teacher currently handles. */
export async function teacherPairs(teacherId: string) {
  return query<{ class_id: string; class_name: string; subject_id: string; subject_name: string; term_id: string }>(
    `select a.class_id, c.name as class_name, a.subject_id, s.name as subject_name, a.term_id
       from teacher_class_subject_assignments a
       join classes c on c.id = a.class_id join subjects s on s.id = a.subject_id join terms t on t.id = a.term_id
      where a.teacher_id = $1 and a.status = 'active' and c.status = 'active' and s.status = 'active'
        and (t.is_current or not exists (select 1 from terms where is_current))
      order by c.name, s.name`,
    [teacherId],
  );
}

/** SQL fragment restricting assignment alias `a` to a teacher's classes/subjects. `p` is the 1-based parameter index. */
export function teacherScopeSql(alias: string, p: number) {
  return `exists (select 1 from teacher_class_subject_assignments tcs
                   where tcs.teacher_id = $${p} and tcs.class_id = ${alias}.class_id
                     and tcs.subject_id = ${alias}.subject_id and tcs.status = 'active')`;
}

/** Can this session view the given assignment? Admins: yes. Teachers: only their own class+subject. */
export async function canViewAssignment(s: Session, assignmentId: string) {
  const a = await one<{ class_id: string; subject_id: string }>('select class_id, subject_id from assignments where id = $1', [assignmentId]);
  if (!a) return false;
  if (s.role !== 'teacher') return true;
  if (!s.teacherId) return false;
  const rows = await query(
    `select 1 from teacher_class_subject_assignments where teacher_id=$1 and class_id=$2 and subject_id=$3 and status='active' limit 1`,
    [s.teacherId, a.class_id, a.subject_id],
  );
  return rows.length > 0;
}

export type AssignmentStatus = 'scheduled' | 'in_progress' | 'due_soon' | 'overdue' | 'closed';

export function assignmentStatus(
  a: { assigned_at: Date | string; current_due_at: Date | string; closed_at: Date | string | null },
  reminderHours: number, now = new Date(),
): AssignmentStatus {
  if (a.closed_at) return 'closed';
  if (new Date(a.assigned_at) > now) return 'scheduled';
  const due = new Date(a.current_due_at);
  if (now > due) return 'overdue';
  if (due.getTime() - now.getTime() <= reminderHours * 3600_000) return 'due_soon';
  return 'in_progress';
}

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  scheduled: 'Scheduled', in_progress: 'In progress', due_soon: 'Due soon', overdue: 'Overdue', closed: 'Closed',
};

/** Distinct classes a teacher currently handles (same current-term rule as teacherPairs). */
export async function teacherClasses(teacherId: string) {
  return query<{ id: string; name: string; section: string | null; year_name: string }>(
    `select distinct c.id, c.name, c.section, y.name as year_name
       from teacher_class_subject_assignments a join classes c on c.id = a.class_id join terms t on t.id = a.term_id join academic_years y on y.id = c.academic_year_id
      where a.teacher_id = $1 and a.status = 'active' and c.status = 'active'
        and (t.is_current or not exists (select 1 from terms where is_current))
      order by c.name`, [teacherId]);
}

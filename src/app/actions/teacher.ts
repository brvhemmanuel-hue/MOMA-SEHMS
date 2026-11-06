'use server';
import { revalidatePath } from 'next/cache';
import { one, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireSession } from '@/lib/auth';
import { clean } from '@/lib/validators';
import { nextRef } from '@/lib/ids';
import { enrollStudent } from '@/lib/accounts';
import { teacherClasses } from '@/lib/rbac';
import type { FormState } from '@/components/ActionForm';

/** A teacher adds a student to one of the classes they handle. */
export async function teacherAddStudent(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession(['teacher']);
  const first = clean(fd.get('first')), last = clean(fd.get('last')), other = clean(fd.get('other')) || null;
  const classId = clean(fd.get('class'));
  const g = clean(fd.get('gender')).toLowerCase();
  const gender = g === 'm' || g === 'male' ? 'male' : g === 'f' || g === 'female' ? 'female' : null;
  if (!first || !last) return { error: 'Enter the first and last name.' };
  if (!classId) return { error: 'Choose a class.' };
  const mine = await teacherClasses(s.teacherId!);
  if (!mine.some((c) => c.id === classId)) return { error: 'You can only add students to the classes you handle. Add the class under My classes and subjects first.' };

  const dup = await one<{ student_no: string }>(
    `select p.student_no from student_profiles p join student_class_history h on h.student_id = p.id and h.effective_to is null
      where h.class_id = $1 and lower(p.first_name) = lower($2) and lower(p.last_name) = lower($3) limit 1`, [classId, first, last]);
  if (dup && !fd.get('force')) return { error: `${first} ${last} is already in this class (${dup.student_no}). If this is a different child with the same name, tick "Add anyway".` };

  const cls = await one<{ y: number; name: string }>('select extract(year from y.start_date)::int as y, c.name from classes c join academic_years y on y.id = c.academic_year_id where c.id = $1', [classId]);
  if (!cls) return { error: 'Class not found.' };
  const no = await nextRef('student', cls.y);
  await tx(async (db) => {
    const [st] = await db.query<{ id: string }>('insert into student_profiles (student_no, first_name, last_name, other_names, gender) values ($1,$2,$3,$4,$5) returning id', [no, first, last, other, gender]);
    await enrollStudent(db, st.id, classId);
    await audit(s.userId, 'student.create', 'student', st.id, { studentNo: no, by: 'teacher' }, db);
  });
  revalidatePath('/my-students');
  return { ok: `${first} ${last} added to ${cls.name} with number ${no}. They will be on the register of assignments you create from now on.` };
}

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { registrationContext } from '@/lib/registration';
import { sectionLabel } from '@/lib/levels';
import { ActionForm } from '@/components/ActionForm';
import ClassSubjectPicker from '@/components/ClassSubjectPicker';
import { Badge, PageHead } from '@/components/ui';
import { addMyClasses, removeMyLoad } from '../../actions/register';

export const metadata = { title: 'My classes and subjects' };
export const dynamic = 'force-dynamic';

export default async function MyClassesPage() {
  const s = await requireSession(['teacher']);
  const ctx = await registrationContext(false);
  const loads = await query<any>(
    `select a.id, c.name as class_name, c.section, sb.name as subject_name, t.name as term_name, y.name as year_name,
            (select count(*)::int from student_class_history h where h.class_id = c.id and h.effective_to is null) as students
       from teacher_class_subject_assignments a join classes c on c.id = a.class_id join subjects sb on sb.id = a.subject_id
       join terms t on t.id = a.term_id join academic_years y on y.id = a.academic_year_id
      where a.teacher_id = $1 and a.status = 'active' and t.is_current order by c.name, sb.name`, [s.teacherId]);
  return (
    <div className="stack">
      <PageHead title="My classes and subjects" sub="These decide which students and assignments you can see." />
      <section className="card flat"><div className="tablewrap"><table>
        <thead><tr><th>Level</th><th>Class</th><th>Subject</th><th className="num">Students</th><th>Term</th><th></th></tr></thead>
        <tbody>{loads.map((l: any) => (
          <tr key={l.id}><td><Badge tone="info">{sectionLabel(l.section)}</Badge></td><td><strong>{l.class_name}</strong></td><td>{l.subject_name}</td><td className="num">{l.students}</td><td className="small">{l.term_name} ({l.year_name})</td>
            <td><ActionForm action={removeMyLoad} submit="Remove" submitClass="btn danger sm" resetOnSuccess={false}><input type="hidden" name="id" value={l.id} /></ActionForm></td></tr>))}
          {!loads.length && <tr><td colSpan={6} className="empty">You have no classes yet. Add some below.</td></tr>}</tbody></table></div></section>
      <section className="card"><h2>Add classes and subjects</h2>
        {ctx.ready ? (
          <ActionForm action={addMyClasses} submit="Add to my classes" className="stack" submitClass="btn gold">
            <ClassSubjectPicker classes={ctx.classes} subjects={ctx.subjects} />
          </ActionForm>) : <div className="alert info">{ctx.message}</div>}
      </section>
    </div>
  );
}

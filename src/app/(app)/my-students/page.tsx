import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { teacherClasses } from '@/lib/rbac';
import { ActionForm } from '@/components/ActionForm';
import BulkPanel from '@/components/BulkPanel';
import { Badge, Empty, PageHead, Pager } from '@/components/ui';
import { teacherAddStudent } from '../../actions/teacher';
import Link from 'next/link';

export const metadata = { title: 'My students' };
export const dynamic = 'force-dynamic';
const PER = 40;

export default async function MyStudentsPage({ searchParams }: { searchParams: { q?: string; class?: string; page?: string } }) {
  const s = await requireSession(['teacher']);
  const classes = await teacherClasses(s.teacherId!);
  const q = (searchParams.q || '').trim().slice(0, 60);
  const classId = classes.some((c) => c.id === searchParams.class) ? searchParams.class! : '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const ids = classId ? [classId] : classes.map((c) => c.id);
  const params: any[] = [ids];
  let where = 'h.class_id = any($1::uuid[]) and p.status = \'active\'';
  if (q) { params.push(`%${q.toLowerCase()}%`); where += ` and (lower(p.first_name || ' ' || p.last_name) like $${params.length} or lower(p.last_name || ' ' || p.first_name) like $${params.length} or lower(p.student_no) like $${params.length})`; }
  const total = ids.length ? Number((await query<any>(`select count(*) n from student_profiles p join student_class_history h on h.student_id = p.id and h.effective_to is null where ${where}`, params))[0].n) : 0;
  const rows = ids.length ? await query<any>(
    `select p.id, p.student_no, p.first_name, p.last_name, p.other_names, p.gender, c.name as class_name
       from student_profiles p join student_class_history h on h.student_id = p.id and h.effective_to is null join classes c on c.id = h.class_id
      where ${where} order by c.name, p.last_name, p.first_name limit ${PER} offset ${(page - 1) * PER}`, params) : [];
  const opts = classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
  return (
    <div className="stack">
      <PageHead title="My students" sub="Students in the classes you handle. You can add students one by one or upload a list." />
      {!classes.length ? <div className="alert info">You have no classes yet. <Link href="/my-classes">Choose your classes and subjects</Link> first.</div> : <>
        <details className="panel"><summary>Add a student</summary><div>
          <ActionForm action={teacherAddStudent} submit="Add student" className="form-grid">
            <div><label htmlFor="first">First name</label><input id="first" name="first" required autoCapitalize="characters" /></div>
            <div><label htmlFor="last">Last name</label><input id="last" name="last" required /></div>
            <div><label htmlFor="gender">Gender</label><select id="gender" name="gender"><option value="">Not stated</option><option value="M">M</option><option value="F">F</option></select></div>
            <div><label htmlFor="cls">Class</label><select id="cls" name="class" required defaultValue={classes.length === 1 ? classes[0].id : ''}><option value="">Choose class</option>{opts}</select></div>
            <div><label style={{ fontWeight: 400 }}><input type="checkbox" name="force" /> Add anyway if the same name is already in the class</label></div>
          </ActionForm></div></details>
        <BulkPanel entity="students" canExport={false} classOptions={classes.map((c) => ({ id: c.id, name: c.name }))} />
        <form className="row card" role="search"><div style={{ flex: '1 1 220px' }}><label htmlFor="q">Search name or number</label><input id="q" name="q" defaultValue={q} /></div>
          <div style={{ flex: '1 1 180px' }}><label htmlFor="fc">Class</label><select id="fc" name="class" defaultValue={classId}><option value="">All my classes</option>{opts}</select></div>
          <button className="btn" style={{ alignSelf: 'end' }}>Filter</button></form>
        <div className="card flat"><div className="tablewrap"><table>
          <thead><tr><th>No.</th><th>Name</th><th>Gender</th><th>Class</th></tr></thead>
          <tbody>{rows.map((r: any) => <tr key={r.id}><td>{r.student_no}</td><td><strong>{r.last_name}, {r.first_name}</strong> {r.other_names}</td><td>{r.gender ? (r.gender === 'male' ? 'M' : 'F') : ''}</td><td><Badge tone="info">{r.class_name}</Badge></td></tr>)}
            {!rows.length && <tr><td colSpan={4}><Empty>No students yet. Add one above or upload a list.</Empty></td></tr>}</tbody></table></div>
          <Pager base="/my-students" page={page} pages={Math.max(1, Math.ceil(total / PER))} params={{ q, class: classId }} />
          <p className="small muted" style={{ padding: '0 1rem 1rem', margin: 0 }}>{total} student{total === 1 ? '' : 's'}. New students appear on the register of assignments you create from now on. To correct a name or move a student to another class, ask the School Administrator.</p></div></>}
    </div>
  );
}

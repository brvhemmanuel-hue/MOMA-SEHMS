import { requireSession } from '@/lib/auth';
import { teacherPairs } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { toLocalInput } from '@/lib/time';
import { ActionForm } from '@/components/ActionForm';
import { PageHead } from '@/components/ui';
import { createAssignment } from '../../../actions/work';
import Link from 'next/link';

export const metadata = { title: 'New assignment' };

export default async function NewWorkPage() {
  const s = await requireSession(['teacher']);
  const st = await getSettings();
  const pairs = await teacherPairs(s.teacherId!);
  const now = toLocalInput(new Date(), st.timezone);
  const tomorrow = toLocalInput(new Date(Date.now() + 24 * 3600_000), st.timezone);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead title="New assignment" sub="Record the work you have given. Students hand in physical work; you record who has submitted." />
      {!pairs.length ? <div className="alert info">You have not been assigned to any class and subject yet. Ask the School Administrator to assign you.</div> : (
        <div className="card"><ActionForm action={createAssignment} submit="Create assignment" className="form-grid" resetOnSuccess={false}>
          <div style={{ gridColumn: '1/-1' }}><label htmlFor="title">Title</label><input id="title" name="title" placeholder="Algebra Exercise 1" required maxLength={150} /></div>
          <div><label htmlFor="type">Type</label><select id="type" name="type"><option value="class_exercise">Class exercise</option><option value="homework">Homework</option></select></div>
          <div><label htmlFor="pair">Class and subject</label><select id="pair" name="pair" required>{pairs.map((p) => <option key={`${p.class_id}|${p.subject_id}`} value={`${p.class_id}|${p.subject_id}`}>{p.class_name}, {p.subject_name}</option>)}</select></div>
          <div><label htmlFor="assigned">Date assigned</label><input id="assigned" name="assigned" type="datetime-local" defaultValue={now} required /></div>
          <div><label htmlFor="due">Due date and time</label><input id="due" name="due" type="datetime-local" defaultValue={tomorrow} required /></div>
          <div style={{ gridColumn: '1/-1' }}><label htmlFor="description">Instructions (optional)</label><textarea id="description" name="description" maxLength={4000} /><span className="small muted">Text only. Files cannot be attached.</span></div>
        </ActionForm><p className="small muted" style={{ marginTop: '.75rem' }}>The expected students come from the class register today. Later class changes will not alter this assignment. Times use {st.timezone}.</p></div>)}
      <Link href="/work" className="small">Back to assignments</Link>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { assignmentStatus, canViewAssignment, STATUS_LABEL } from '@/lib/rbac';
import { ensureSnapshot } from '@/lib/snapshot';
import { fmtDateTime, toLocalInput } from '@/lib/time';
import { ActionForm } from '@/components/ActionForm';
import Register, { type RegStudent } from '@/components/Register';
import { Badge, Meter, PageHead, Stat, STATUS_TONE } from '@/components/ui';
import { extendDeadline, setClosed } from '../../../actions/work';

export const metadata = { title: 'Assignment' };

export default async function WorkDetail({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(params.id) || !(await canViewAssignment(s, params.id))) notFound();
  const st = await getSettings();
  const a = await one<any>(
    `select a.*, c.name class_name, sb.name subject_name, tp.first_name||' '||tp.last_name teacher from assignments a
       join classes c on c.id=a.class_id join subjects sb on sb.id=a.subject_id join teacher_profiles tp on tp.id=a.teacher_id where a.id=$1`, [params.id]);
  if (!a) notFound();
  if (new Date(a.current_due_at) <= new Date()) await ensureSnapshot(a.id, 'lazy'); // lazy snapshot if the cron job has not run yet
  const [recs, snaps, hist] = await Promise.all([
    query<any>(`select r.status, r.submitted_at, r.note, p.id, p.student_no, p.first_name, p.last_name from submission_records r join student_profiles p on p.id=r.student_id where r.assignment_id=$1 order by p.last_name, p.first_name`, [a.id]),
    query<any>('select * from assignment_final_snapshots where assignment_id=$1 order by deadline_used', [a.id]),
    query<any>('select h.*, u.full_name from assignment_deadline_history h join users u on u.id=h.changed_by where h.assignment_id=$1 order by h.changed_at', [a.id]),
  ]);
  const onTime = recs.filter((r: any) => r.status === 'on_time').length;
  const late = recs.filter((r: any) => r.status === 'late').length;
  const submitted = onTime + late;
  const stt = assignmentStatus(a, st.reminder_window_hours);
  const pastDue = new Date(a.current_due_at) < new Date();
  const students: RegStudent[] = recs.map((r: any) => ({ id: r.id, no: r.student_no, name: `${r.last_name}, ${r.first_name}`, status: r.status, submittedAt: toLocalInput(r.submitted_at, st.timezone), note: r.note ?? '' }));
  const canEdit = s.role !== 'external_admin' && (!a.closed_at || s.role === 'school_admin');
  const latest = snaps[snaps.length - 1];
  return (
    <div className="stack">
      <PageHead title={a.title} sub={`${a.class_name} | ${a.subject_name} | ${a.type === 'homework' ? 'Homework' : 'Class exercise'} | ${a.teacher}`}>
        <Link className="btn ghost" href="/work">All assignments</Link><Badge tone={STATUS_TONE[stt]}>{STATUS_LABEL[stt]}</Badge></PageHead>
      <div className="grid cols-4">
        <Stat label="Expected students" value={a.expected_count} hint="Fixed when created" />
        <Stat label="Submitted so far" value={submitted} tone="ok" hint="On time and late together" />
        <Stat label={pastDue ? 'Not submitted as of now' : 'Outstanding'} value={Math.max(a.expected_count - submitted, 0)} tone={pastDue ? 'bad' : 'gold'} />
        <Stat label="Current submission" value={a.expected_count ? `${Math.round((submitted * 1000) / a.expected_count) / 10}%` : 'N/A'} hint="Submitted so far / expected" />
      </div>
      <section className="card">
        <div className="row spread"><div><h2>Deadline</h2>
          <p style={{ margin: 0 }}>Due <strong>{fmtDateTime(a.current_due_at, st.timezone)}</strong>{+new Date(a.current_due_at) !== +new Date(a.original_due_at) && <span className="muted"> (originally {fmtDateTime(a.original_due_at, st.timezone)})</span>}</p>
          <p className="small muted" style={{ margin: 0 }}>Assigned {fmtDateTime(a.assigned_at, st.timezone)}. Times shown in {st.timezone}.</p></div>
          <div style={{ minWidth: 220, flex: '0 1 320px' }}><Meter onTime={onTime} late={late} expected={a.expected_count} />
            <div className="legend"><span>On time {onTime}</span><span className="b">Late {late}</span><span className="d">Outstanding {Math.max(a.expected_count - submitted, 0)}</span></div></div></div>
        {a.description && <p style={{ marginTop: '.75rem', whiteSpace: 'pre-wrap' }}>{a.description}</p>}
        {latest && <div className="alert info" style={{ margin: '1rem 0 0' }}><strong>Final at deadline ({latest.label === 'original' ? 'original deadline' : 'extended deadline'}, {fmtDateTime(latest.deadline_used, st.timezone)}):</strong>{' '}
          {latest.on_time_count} of {latest.expected_count} on time{latest.on_time_rate !== null ? ` (${Number(latest.on_time_rate)}%)` : ''}, {latest.not_submitted_count} not submitted by the deadline. Late submissions after this point do not change these figures; the cumulative total is {submitted}.</div>}
      </section>
      <Register assignmentId={a.id} students={students} tz={st.timezone} readOnly={!canEdit} outstandingWord={pastDue ? 'not submitted as of now' : 'outstanding'} />
      <div className="grid cols-2">
        <section className="card"><h2>Deadline history</h2>
          {hist.length ? <div className="tablewrap"><table><thead><tr><th>Changed</th><th>From</th><th>To</th><th>Reason</th></tr></thead><tbody>{hist.map((h: any) => (
            <tr key={h.id}><td className="small">{fmtDateTime(h.changed_at, st.timezone)}<div className="muted">{h.full_name}</div></td><td className="small">{fmtDateTime(h.previous_due_at, st.timezone)}</td><td className="small">{fmtDateTime(h.new_due_at, st.timezone)}</td><td className="small">{h.reason}</td></tr>))}</tbody></table></div>
            : <p className="muted">The deadline has not been changed.</p>}
          {s.role === 'school_admin' && (<details className="panel" style={{ marginTop: '1rem' }}><summary>Extend deadline</summary><div>
            <ActionForm action={extendDeadline} submit="Extend deadline" className="stack" resetOnSuccess={false}>
              <input type="hidden" name="id" value={a.id} />
              <div><label htmlFor="due">New deadline</label><input id="due" name="due" type="datetime-local" required defaultValue={toLocalInput(new Date(new Date(a.current_due_at).getTime() + 86400000), st.timezone)} /></div>
              <div><label htmlFor="reason">Reason</label><input id="reason" name="reason" required maxLength={200} /></div>
            </ActionForm></div></details>)}
        </section>
        <section className="card"><h2>Assignment status</h2>
          <p className="small muted">Closing ends the submission period. History stays viewable.{s.role !== 'school_admin' && ' Only the School Administrator can reopen.'}</p>
          {s.role !== 'external_admin' && (!a.closed_at || s.role === 'school_admin') && (
            <ActionForm action={setClosed} submit={a.closed_at ? 'Reopen assignment' : 'Close assignment'} submitClass={a.closed_at ? 'btn' : 'btn danger'} resetOnSuccess={false}>
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="close" value={a.closed_at ? '0' : '1'} /></ActionForm>)}
          {a.closed_at && <p className="small">Closed {fmtDateTime(a.closed_at, st.timezone)}.</p>}
        </section>
      </div>
    </div>
  );
}

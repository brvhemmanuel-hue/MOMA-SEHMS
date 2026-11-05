'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toLocalInput } from '@/lib/time';
import { saveRegister } from '@/app/actions/work';

export type RegStudent = { id: string; no: string; name: string; status: 'pending' | 'on_time' | 'late' | 'not_submitted'; submittedAt: string; note: string };
type Mode = 'submitted' | 'pending' | 'not_submitted';
type Row = { mode: Mode; at: string; note: string; dirty: boolean; picked: boolean };

export default function Register({ assignmentId, students, tz, readOnly, outstandingWord }: { assignmentId: string; students: RegStudent[]; tz: string; readOnly: boolean; outstandingWord: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const init = useMemo(() => Object.fromEntries(students.map((s) => [s.id, {
    mode: (s.status === 'on_time' || s.status === 'late' ? 'submitted' : s.status) as Mode, at: s.submittedAt, note: s.note, dirty: false, picked: false } as Row])), [students]);
  const [rows, setRows] = useState<Record<string, Row>>(init);
  const [filter, setFilter] = useState('');
  const nowLocal = () => toLocalInput(new Date(), tz);

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch, dirty: true } }));
  const setMode = (id: string, mode: Mode) => set(id, { mode, at: mode === 'submitted' ? rows[id].at || nowLocal() : '' });
  const bulk = (mode: Mode) => setRows((r) => {
    const n = { ...r };
    for (const s of students) if (n[s.id].picked) n[s.id] = { ...n[s.id], mode, at: mode === 'submitted' ? n[s.id].at || nowLocal() : '', dirty: true, picked: false };
    return n;
  });

  const total = students.length;
  const submitted = students.filter((s) => rows[s.id].mode === 'submitted').length;
  const dirtyCount = students.filter((s) => rows[s.id].dirty).length;
  const pickedCount = students.filter((s) => rows[s.id].picked).length;
  const pct = total ? Math.round((submitted * 100) / total) : null;
  const shown = students.filter((s) => !filter || (s.name + ' ' + s.no).toLowerCase().includes(filter.toLowerCase()));

  const save = () => start(async () => {
    const entries = students.filter((s) => rows[s.id].dirty).map((s) => ({ studentId: s.id, status: rows[s.id].mode, submittedAt: rows[s.id].at, note: rows[s.id].note }));
    const res = await saveRegister(assignmentId, entries);
    setMsg(res);
    if (res.ok) { setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, dirty: false }]))); router.refresh(); }
  });

  return (
    <section className="card flat" aria-label="Submission register">
      <div style={{ padding: '1rem' }} className="row spread">
        <div><h2 style={{ margin: 0 }}>Submission register</h2><p className="small muted" style={{ margin: 0 }}>Record work handed in during class. Nothing here is a mark or score.</p></div>
        <div aria-live="polite"><span className="bigfig">{submitted}</span><span className="muted"> of {total} submitted so far</span><div className="small muted">{total ? `${total - submitted} ${outstandingWord}, ${pct}% in` : 'N/A'}</div></div>
      </div>
      {!readOnly && (
        <div className="row no-print" style={{ padding: '0 1rem 1rem' }}>
          <input aria-label="Find a student" placeholder="Find a student" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn ghost sm" onClick={() => setRows((r) => { const n = { ...r }; for (const s of shown) n[s.id] = { ...n[s.id], picked: true }; return n; })}>Select shown</button>
          <button className="btn ghost sm" disabled={!pickedCount} onClick={() => bulk('submitted')}>Mark selected submitted now</button>
          <button className="btn ghost sm" disabled={!pickedCount} onClick={() => bulk('not_submitted')}>Mark selected not submitted</button>
          <button className="btn ghost sm" disabled={!pickedCount} onClick={() => bulk('pending')}>Set selected to pending</button>
          <span className="small muted">{pickedCount} selected</span>
        </div>)}
      <div role="table" aria-label="Students">
        {shown.map((s) => { const r = rows[s.id]; return (
          <div className="reg-row" role="row" key={s.id} style={r.dirty ? { background: '#fffbe6' } : undefined}>
            <input type="checkbox" aria-label={`Select ${s.name}`} disabled={readOnly} checked={r.picked} onChange={(e) => setRows((x) => ({ ...x, [s.id]: { ...x[s.id], picked: e.target.checked } }))} />
            <div><strong>{s.name}</strong><div className="small muted">{s.no}</div></div>
            <div className="seg" role="group" aria-label={`Status for ${s.name}`}>
              <button type="button" className="s" aria-pressed={r.mode === 'submitted'} disabled={readOnly} onClick={() => setMode(s.id, 'submitted')}>Submitted</button>
              <button type="button" className="p" aria-pressed={r.mode === 'pending'} disabled={readOnly} onClick={() => setMode(s.id, 'pending')}>Pending</button>
              <button type="button" className="n" aria-pressed={r.mode === 'not_submitted'} disabled={readOnly} onClick={() => setMode(s.id, 'not_submitted')}>Not submitted</button>
            </div>
            <div>{r.mode === 'submitted' ? <input type="datetime-local" aria-label={`Submitted at, ${s.name}`} value={r.at} disabled={readOnly} onChange={(e) => set(s.id, { at: e.target.value })} /> : <span className="small muted">{s.status === 'late' ? 'Late' : ''}</span>}
              {!r.dirty && (s.status === 'on_time' || s.status === 'late') && <span className={`badge ${s.status === 'late' ? 'late' : 'ok'}`}>{s.status === 'late' ? 'Submitted late' : 'On time'}</span>}</div>
            <input aria-label={`Note for ${s.name}`} placeholder="Optional note" maxLength={300} value={r.note} disabled={readOnly} onChange={(e) => set(s.id, { note: e.target.value })} />
          </div>); })}
        {!students.length && <div className="empty">No students were on the class register when this assignment was created.</div>}
      </div>
      {!readOnly && (
        <div className="savebar no-print">
          <button className="btn gold" onClick={save} disabled={pending || !dirtyCount}>{pending ? 'Saving...' : `Save ${dirtyCount || ''} change${dirtyCount === 1 ? '' : 's'}`}</button>
          {msg.ok && <span role="status" style={{ color: 'var(--ok)' }}>{msg.ok}</span>}{msg.error && <span role="alert" style={{ color: 'var(--bad)' }}>{msg.error}</span>}
          <span className="small muted">On time or late is decided by the deadline when you save.</span>
        </div>)}
    </section>
  );
}

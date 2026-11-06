'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRegister } from '@/app/actions/work';

type Mode = 'submitted' | 'pending' | 'not_submitted';

export default function QuickMark({ assignmentId, studentId, status }: { assignmentId: string; studentId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const go = (mode: Mode) => start(async () => {
    setMsg(''); setErr('');
    const res = await saveRegister(assignmentId, [{ studentId, status: mode }]);
    if (res.error) setErr(res.error); else { setMsg('Saved'); router.refresh(); }
  });
  const submitted = status === 'on_time' || status === 'late';
  return (
    <div className="row" style={{ gap: '.4rem' }}>
      <button className={`btn sm ${submitted ? '' : 'gold'}`} disabled={pending || submitted} onClick={() => go('submitted')}>{submitted ? (status === 'late' ? 'Submitted late' : 'Submitted') : 'Mark submitted now'}</button>
      <button className="btn ghost sm" disabled={pending || status === 'not_submitted'} onClick={() => go('not_submitted')}>Not submitted</button>
      <button className="btn ghost sm" disabled={pending || status === 'pending'} onClick={() => go('pending')}>Reset</button>
      {msg && <span className="small" style={{ color: 'var(--ok)' }} role="status">{msg}</span>}
      {err && <span className="small" style={{ color: 'var(--bad)' }} role="alert">{err}</span>}
    </div>
  );
}

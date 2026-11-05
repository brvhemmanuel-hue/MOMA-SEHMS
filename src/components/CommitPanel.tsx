'use client';
import { useState } from 'react';

type Cred = { name: string; username: string; password: string; role: string };

export default function CommitPanel({ batchId, errorRows, readyRows, duplicates }: { batchId: string; errorRows: number; readyRows: number; duplicates: { row: number; text: string }[] }) {
  const [mode, setMode] = useState<'all_or_nothing' | 'skip_invalid'>(errorRows ? 'skip_invalid' : 'all_or_nothing');
  const [anyway, setAnyway] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [totals, setTotals] = useState<{ created: number; updated: number; skipped: number; failed: number } | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true); setError('');
    const t = { created: 0, updated: 0, skipped: 0, failed: 0 }; const c: Cred[] = [];
    try {
      for (let guard = 0; guard < 500; guard++) {
        const res = await fetch(`/api/imports/${batchId}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitMode: mode, createAnyway: anyway }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'The import failed. Nothing further was saved.'); break; }
        t.created += j.counts.created; t.updated += j.counts.updated; t.skipped += j.counts.skipped; t.failed += j.counts.failed; c.push(...j.credentials);
        setTotals({ ...t }); setCreds([...c]);
        if (j.remaining === 0) { setDone(true); break; }
      }
    } catch { setError('Lost connection. Reload this page: rows already saved stay saved, and you can continue.'); }
    setBusy(false);
  }

  function downloadCreds() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [['Name', 'Role', 'Username', 'Temporary password'].join(','), ...creds.map((x) => [x.name, x.role, x.username, x.password].map(esc).join(','))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'temporary-credentials.csv'; a.click();
  }

  if (done && totals) return (
    <div className="card stack" role="status">
      <h2>Import finished</h2>
      <div className="grid cols-4"><div className="card stat ok"><div className="small muted">Created</div><div className="n">{totals.created}</div></div><div className="card stat"><div className="small muted">Updated</div><div className="n">{totals.updated}</div></div>
        <div className="card stat gold"><div className="small muted">Skipped</div><div className="n">{totals.skipped}</div></div><div className="card stat bad"><div className="small muted">Failed</div><div className="n">{totals.failed}</div></div></div>
      {creds.length > 0 && <div className="cred"><strong>{creds.length} temporary sign-in{creds.length === 1 ? '' : 's'} issued.</strong>
        <p className="small" style={{ margin: '.25rem 0' }}>This is the only time these passwords are shown. They expire, and each person must change theirs at first sign-in. Download and share them privately, then delete the file.</p>
        <button className="btn gold" onClick={downloadCreds}>Download credentials (CSV)</button></div>}
      <p className="small muted">The result is saved in import history.</p>
    </div>);

  return (
    <div className="card stack">
      <h2>Confirm import</h2>
      {error && <div className="alert err" role="alert">{error}</div>}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="small muted">How should rows with problems be handled?</legend>
        <label style={{ fontWeight: 400 }}><input type="radio" name="cm" checked={mode === 'all_or_nothing'} onChange={() => setMode('all_or_nothing')} disabled={errorRows > 0} /> All or nothing: import everything or nothing at all{errorRows > 0 ? ' (unavailable while there are errors)' : ''}</label>
        <label style={{ fontWeight: 400 }}><input type="radio" name="cm" checked={mode === 'skip_invalid'} onChange={() => setMode('skip_invalid')} /> Import valid rows and skip invalid rows</label></fieldset>
      {duplicates.length > 0 && <div><strong>Possible duplicate students</strong><p className="small muted">These are skipped unless you tick them to create as a new student. They are never merged.</p>
        {duplicates.map((d) => <label key={d.row} style={{ fontWeight: 400 }}><input type="checkbox" checked={anyway.includes(d.row)} onChange={(e) => setAnyway((a) => e.target.checked ? [...a, d.row] : a.filter((x) => x !== d.row))} /> Row {d.row}: {d.text}</label>)}</div>}
      <div><button className="btn gold" disabled={busy || (readyRows === 0 && anyway.length === 0)} onClick={run}>{busy ? 'Importing...' : `Import ${readyRows + anyway.length} row${readyRows + anyway.length === 1 ? '' : 's'}`}</button>
        {totals && !done && <span className="small muted"> Saved so far: {totals.created} created, {totals.updated} updated.</span>}</div>
    </div>
  );
}

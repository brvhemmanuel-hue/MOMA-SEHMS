'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ImportUpload({ entities, fixed = false, classOptions }: { entities: { key: string; label: string; hint: string }[]; fixed?: boolean; classOptions?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entity, setEntity] = useState(entities[0].key);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await fetch('/api/imports/preview', { method: 'POST', body: new FormData(e.currentTarget) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'The file could not be read.'); return; }
      router.push(`/imports/${j.id}${j.ignored?.length ? `?ignored=${encodeURIComponent(j.ignored.join(','))}` : ''}`);
    } catch { setError('Could not reach the server. Check your connection and try again.'); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="form-grid">
      {error && <div className="alert err" role="alert" style={{ gridColumn: '1/-1' }}>{error}</div>}
      {fixed ? <input type="hidden" name="entity" value={entity} /> : (
        <div><label htmlFor="entity">What are you importing?</label>
          <select id="entity" name="entity" value={entity} onChange={(e) => setEntity(e.target.value)}>{entities.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
          <span className="small muted">{entities.find((x) => x.key === entity)?.hint}</span></div>)}
      <div><label htmlFor="mode">If a record already exists</label>
        <select id="mode" name="mode" defaultValue="create_only"><option value="create_only">Create only (skip existing)</option><option value="create_and_update">Create and update existing</option></select></div>
      {entity === 'students' && classOptions && classOptions.length > 0 && (
        <div><label htmlFor="defaultClass">Class for rows with no class</label>
          <select id="defaultClass" name="defaultClass" defaultValue=""><option value="">None (every row must have a class)</option>{classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <span className="small muted">Useful when the CLASS column is blank.</span></div>)}
      <div><label htmlFor="file">File (.xlsx or .csv)</label><input id="file" name="file" type="file" accept=".xlsx,.csv" required /></div>
      <div style={{ gridColumn: '1/-1' }}><button className="btn gold" disabled={busy}>{busy ? 'Checking file...' : 'Upload and check'}</button> <span className="small muted">Nothing is saved until you confirm on the next screen.</span></div>
    </form>
  );
}

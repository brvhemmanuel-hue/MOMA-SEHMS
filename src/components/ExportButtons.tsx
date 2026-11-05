'use client';
import { useState } from 'react';

export default function ExportButtons({ reportKey, query }: { reportKey: string; query: string }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const download = (url: string) => { const a = document.createElement('a'); a.href = url; a.click(); };

  async function go(format: 'pdf' | 'xlsx' | 'csv') {
    setBusy(format); setMsg('');
    try {
      const res = await fetch(`/api/reports/${reportKey}/export?${query}${query ? '&' : ''}format=${format}`);
      if (res.status === 202) {
        const { runId } = await res.json();
        setMsg('This is a large report. Preparing it in the background...');
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const st = await (await fetch(`/api/reports/runs/${runId}`)).json();
          if (st.status === 'ready') { setMsg('Ready. Downloading.'); download(st.downloadUrl); return; }
          if (st.status === 'failed' || st.status === 'expired') { setMsg('The report could not be prepared. Try again.'); return; }
        }
        setMsg('Still preparing. You will get a notification when it is ready.');
        return;
      }
      if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error || 'Could not generate the report.'); return; }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally { setBusy(''); }
  }

  return (
    <div className="row no-print" aria-live="polite">
      {(['pdf', 'xlsx', 'csv'] as const).map((f) => <button key={f} className="btn ghost sm" disabled={!!busy} onClick={() => go(f)}>{busy === f ? 'Preparing...' : `Export ${f === 'xlsx' ? 'Excel' : f.toUpperCase()}`}</button>)}
      <button className="btn ghost sm" onClick={() => window.print()}>Print</button>
      {msg && <span className="small muted">{msg}</span>}
    </div>
  );
}

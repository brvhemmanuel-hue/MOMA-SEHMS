import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="row no-print">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = '', hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className={`card stat ${tone}`}>
      <div className="small muted">{label}</div>
      <div className="n">{value}</div>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: '' | 'ok' | 'late' | 'bad' | 'info' | 'gold' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/** On time (green) / late (amber) / outstanding (blue-grey) as a single bar. Labelled, not colour-only. */
export function Meter({ onTime, late, expected, outstandingLabel = 'Outstanding' }: { onTime: number; late: number; expected: number; outstandingLabel?: string }) {
  const pct = (n: number) => (expected > 0 ? (n / expected) * 100 : 0);
  const sub = onTime + late;
  return (
    <div title={`${onTime} on time, ${late} late, ${Math.max(expected - sub, 0)} ${outstandingLabel.toLowerCase()} of ${expected}`}>
      <div className="meter" role="img" aria-label={`${sub} of ${expected} submitted`}>
        <i className="a" style={{ width: `${pct(onTime)}%` }} /><i className="b" style={{ width: `${pct(late)}%` }} />
      </div>
      <div className="small muted">{expected > 0 ? `${sub}/${expected} (${Math.round(pct(sub))}%)` : 'N/A'}</div>
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <div className={`alert ${err ? 'err' : 'ok'}`} role={err ? 'alert' : 'status'}>{err || ok}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>;
}

export function Pager({ base, page, pages, params = {} }: { base: string; page: number; pages: number; params?: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `${base}?${sp}`;
  };
  return (
    <div className="row spread" style={{ padding: '.75rem' }}>
      <span className="small muted">Page {page} of {pages}</span>
      <span className="row">
        {page > 1 && <Link className="btn ghost sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn ghost sm" href={href(page + 1)}>Next</Link>}
      </span>
    </div>
  );
}

export const STATUS_TONE: Record<string, '' | 'ok' | 'late' | 'bad' | 'info' | 'gold'> = {
  scheduled: 'info', in_progress: 'info', due_soon: 'gold', overdue: 'bad', closed: '',
};

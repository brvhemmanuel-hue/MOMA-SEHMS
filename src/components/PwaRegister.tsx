'use client';
import { useEffect, useState } from 'react';

export default function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const track = (w: ServiceWorker | null) => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w); }); };
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" style={{ position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 99, background: '#14285f', color: '#fff', padding: '.75rem 1rem', borderRadius: 10, display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #f2c200' }}>
      <span>A new version is ready.</span>
      <button className="btn gold sm" onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>Update now</button>
    </div>
  );
}

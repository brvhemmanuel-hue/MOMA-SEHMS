'use client';
import { useRef } from 'react';

/** A button that opens a centred dialog sized to the screen. Content scrolls inside it, so nothing runs off the page. */
export default function Modal({ trigger, title, children, triggerClass = 'btn ghost sm' }: { trigger: React.ReactNode; title: string; children: React.ReactNode; triggerClass?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => ref.current?.showModal()}>{trigger}</button>
      <dialog ref={ref} className="modal" aria-label={title} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="modal-card">
          <div className="modal-head"><h2 style={{ margin: 0 }}>{title}</h2><button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Close</button></div>
          <div className="modal-body">{children}</div>
        </div>
      </dialog>
    </>
  );
}

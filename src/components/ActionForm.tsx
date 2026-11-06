'use client';
import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

export type Credential = { name: string; username: string; password: string; role: string };
export type FormState = { ok?: string; error?: string; credential?: Credential | null; n?: number };

export function SubmitButton({ children, className = 'btn', pendingText = 'Saving...' }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending}>{pending ? pendingText : children}</button>;
}

export function CredentialBox({ c }: { c: Credential }) {
  return (
    <div className="cred" role="status">
      <strong>Temporary sign-in for {c.name} ({c.role})</strong>
      <p className="small" style={{ margin: '.25rem 0' }}>Share this privately. It is shown once, expires, and must be changed at first login.</p>
      <div>Username: <code>{c.username}</code></div>
      <div style={{ marginTop: '.35rem' }}>Password: <code>{c.password}</code></div>
      <button type="button" className="btn ghost sm no-print" style={{ marginTop: '.5rem' }} onClick={() => window.print()}>Print</button>
    </div>
  );
}

export function ActionForm({
  action, children, submit = 'Save', className, resetOnSuccess = true, submitClass = 'btn', hideSubmit = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; children?: React.ReactNode; submit?: string; className?: string;
  resetOnSuccess?: boolean; submitClass?: string; hideSubmit?: boolean;
}) {
  const [state, formAction] = useFormState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form action={formAction} ref={ref} className={className}>
      {state.error && <div className="alert err" role="alert" style={{ gridColumn: '1/-1' }}>{state.error}</div>}
      {state.ok && <div className="alert ok" role="status" style={{ gridColumn: '1/-1' }}>{state.ok}</div>}
      {state.credential && <div style={{ gridColumn: '1/-1' }}><CredentialBox c={state.credential} /></div>}
      {children}
      {!hideSubmit && <div style={{ gridColumn: '1/-1' }}><SubmitButton className={submitClass}>{submit}</SubmitButton></div>}
    </form>
  );
}

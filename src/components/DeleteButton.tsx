'use client';
import Modal from './Modal';
import { ActionForm } from './ActionForm';
import { deleteRecord } from '@/app/actions/delete';

export type DeleteKind = 'subject' | 'class' | 'teacher' | 'student' | 'term' | 'year' | 'department' | 'external_admin';

export default function DeleteButton({ kind, id, name, redirectTo }: { kind: DeleteKind; id: string; name: string; redirectTo?: string }) {
  return (
    <Modal trigger="Delete" triggerClass="btn danger sm" title={`Delete ${name}?`}>
      <p>This permanently removes <strong>{name}</strong> and cannot be undone.</p>
      <p className="small muted">If it already has records (for example assignments or submissions), it cannot be deleted. Set its status to inactive instead, which hides it but keeps the history.</p>
      <ActionForm action={deleteRecord} submit="Yes, delete" submitClass="btn danger" resetOnSuccess={false}>
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />{redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      </ActionForm>
    </Modal>
  );
}

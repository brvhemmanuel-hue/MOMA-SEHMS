'use client';
import Modal from './Modal';
import { ActionForm } from './ActionForm';
import { deleteAssignment, updateAssignment } from '@/app/actions/work';

export default function AssignmentActions({ id, title, type, description, dueLocal, recorded, tz }: {
  id: string; title: string; type: string; description: string; dueLocal: string; recorded: number; tz: string;
}) {
  return (
    <div className="row-actions">
      <Modal trigger="Edit" title={`Edit ${title}`}>
        <ActionForm action={updateAssignment} submit="Save changes" resetOnSuccess={false} className="stack">
          <input type="hidden" name="id" value={id} />
          <div><label htmlFor={`t-${id}`}>Title</label><input id={`t-${id}`} name="title" defaultValue={title} required maxLength={150} /></div>
          <div><label htmlFor={`ty-${id}`}>Type</label><select id={`ty-${id}`} name="type" defaultValue={type}><option value="class_exercise">Class exercise</option><option value="homework">Homework</option></select></div>
          <div><label htmlFor={`d-${id}`}>Due date and time</label><input id={`d-${id}`} name="due" type="datetime-local" defaultValue={dueLocal} required /><span className="small muted">Times use {tz}. The deadline can only be moved before it passes.</span></div>
          <div><label htmlFor={`de-${id}`}>Instructions (optional)</label><textarea id={`de-${id}`} name="description" defaultValue={description} maxLength={4000} /></div>
        </ActionForm>
      </Modal>
      <Modal trigger="Delete" triggerClass="btn danger sm" title={`Delete ${title}?`}>
        <p>This permanently deletes the assignment and its whole register{recorded > 0 ? `, including ${recorded} recorded submission${recorded === 1 ? '' : 's'}` : ''}. This cannot be undone.</p>
        <p className="small muted">If you only want to stop recording work, close the assignment instead. Closing keeps the history.</p>
        <ActionForm action={deleteAssignment} submit="Yes, delete it" submitClass="btn danger" resetOnSuccess={false}><input type="hidden" name="id" value={id} /></ActionForm>
      </Modal>
    </div>
  );
}

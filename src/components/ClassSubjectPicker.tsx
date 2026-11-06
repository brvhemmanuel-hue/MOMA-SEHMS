'use client';
import { useMemo, useState } from 'react';
import { SECTIONS } from '@/lib/levels';

type Cls = { id: string; name: string; section: string };
type Sub = { id: string; name: string };

/** Choose one or more levels (for example Upper Primary and JHS), then classes, then subjects. Submits `class` and `subject` values. */
export default function ClassSubjectPicker({ classes, subjects }: { classes: Cls[]; subjects: Sub[] }) {
  const levels = useMemo(() => SECTIONS.filter((s) => classes.some((c) => c.section === s.key)), [classes]);
  const [picked, setPicked] = useState<string[]>(levels.length === 1 ? [levels[0].key] : []);
  const [pickedClasses, setPickedClasses] = useState<string[]>([]);
  const [pickedSubjects, setPickedSubjects] = useState<string[]>([]);
  const [find, setFind] = useState('');

  const shownLevels = levels.filter((l) => picked.includes(l.key));
  const shownSubjects = subjects.filter((s) => s.name.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const inLevel = (key: string) => classes.filter((c) => c.section === key);

  const toggleLevel = (key: string) => {
    if (picked.includes(key)) {
      setPicked(picked.filter((k) => k !== key));
      setPickedClasses(pickedClasses.filter((id) => !inLevel(key).some((c) => c.id === id))); // unticking a level drops its classes
    } else setPicked([...picked, key]);
  };

  return (
    <div className="stack">
      <fieldset className="fs">
        <legend>1. Level or levels you teach</legend>
        <p className="small muted" style={{ margin: '0 0 .5rem' }}>Tick more than one if you teach across levels, for example Upper Primary and JHS.</p>
        <div className="choice-row">
          {levels.map((l) => (
            <label key={l.key} className={`choice ${picked.includes(l.key) ? 'on' : ''}`}>
              <input type="checkbox" name="level" value={l.key} checked={picked.includes(l.key)} onChange={() => toggleLevel(l.key)} />
              <span><strong>{l.label}</strong><span className="small muted"> {l.hint}</span></span>
            </label>))}
        </div>
      </fieldset>

      <fieldset className="fs">
        <legend>2. Your classes</legend>
        {!shownLevels.length && <p className="muted small" style={{ margin: 0 }}>Choose a level above to see its classes.</p>}
        {shownLevels.map((l) => (
          <div key={l.key} style={{ marginBottom: '.9rem' }}>
            <div className="row" style={{ marginBottom: '.4rem' }}>
              <strong>{l.label}</strong>
              <button type="button" className="btn ghost sm" onClick={() => setPickedClasses([...new Set([...pickedClasses, ...inLevel(l.key).map((c) => c.id)])])}>Select all</button>
              <button type="button" className="btn ghost sm" onClick={() => setPickedClasses(pickedClasses.filter((id) => !inLevel(l.key).some((c) => c.id === id)))}>Clear</button>
            </div>
            <div className="choice-grid">
              {inLevel(l.key).map((c) => (
                <label key={c.id} className={`choice ${pickedClasses.includes(c.id) ? 'on' : ''}`}>
                  <input type="checkbox" name="class" value={c.id} checked={pickedClasses.includes(c.id)} onChange={() => toggle(pickedClasses, setPickedClasses, c.id)} />
                  <span>{c.name}</span>
                </label>))}
            </div>
          </div>))}
      </fieldset>

      <fieldset className="fs">
        <legend>3. Subjects you teach</legend>
        <div className="row" style={{ marginBottom: '.5rem' }}>
          <input aria-label="Search subjects" placeholder="Search subjects" value={find} onChange={(e) => setFind(e.target.value)} style={{ maxWidth: 240 }} />
          <button type="button" className="btn ghost sm" onClick={() => setPickedSubjects([...new Set([...pickedSubjects, ...shownSubjects.map((s) => s.id)])])}>Select shown</button>
          <button type="button" className="btn ghost sm" onClick={() => setPickedSubjects([])}>Clear</button>
        </div>
        <div className="choice-grid">
          {shownSubjects.map((s) => (
            <label key={s.id} className={`choice ${pickedSubjects.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" name="subject" value={s.id} checked={pickedSubjects.includes(s.id)} onChange={() => toggle(pickedSubjects, setPickedSubjects, s.id)} />
              <span>{s.name}</span>
            </label>))}
          {!shownSubjects.length && <span className="muted small">No subject matches.</span>}
        </div>
        {pickedSubjects.filter((id) => !shownSubjects.some((s) => s.id === id)).map((id) => <input key={id} type="hidden" name="subject" value={id} />)}
      </fieldset>
      <p className="small muted" style={{ margin: 0 }}>{pickedClasses.length} class{pickedClasses.length === 1 ? '' : 'es'} and {pickedSubjects.length} subject{pickedSubjects.length === 1 ? '' : 's'} chosen. You get every chosen subject in every chosen class. You can change this later.</p>
    </div>
  );
}

import { query } from './db';

type Kind = 'teacher' | 'class' | 'subject' | 'student';

/**
 * Generates a unique, never-reused reference. Runs OUTSIDE the caller's transaction on purpose:
 * an auto-committed counter increment means a rolled-back create can leave a gap but a number is never issued twice.
 */
export async function nextRef(kind: Kind, year?: number | string): Promise<string> {
  let name: string = kind;
  let prefix = '';
  if (kind === 'teacher') prefix = 'T-';
  else if (kind === 'class') prefix = 'CLS-';
  else if (kind === 'subject') prefix = 'SUB-';
  else {
    const y = String(year ?? new Date().getUTCFullYear());
    name = `student:${y}`;
    prefix = `S-${y}-`;
  }
  const rows = await query<{ prefix: string; current_value: string }>(
    `insert into id_counters (name, prefix, current_value) values ($1, $2, 1)
     on conflict (name) do update set current_value = id_counters.current_value + 1
     returning prefix, current_value`,
    [name, prefix],
  );
  return `${rows[0].prefix}${String(rows[0].current_value).padStart(4, '0')}`;
}

import 'server-only';
import crypto from 'crypto';
import { query, one } from './db';
import { getSettings } from './settings';

export type RegClass = { id: string; name: string; section: string };
export type RegContext =
  | { ready: false; reason: 'closed' | 'no_term' | 'no_classes' | 'no_subjects'; message: string }
  | { ready: true; termId: string; yearId: string; yearName: string; classes: RegClass[]; subjects: { id: string; name: string }[] };

/** Classes (grouped by level) and subjects teachers can choose from: the current academic year only. */
export async function registrationContext(requireOpen = true): Promise<RegContext> {
  const st = await getSettings();
  if (requireOpen && !st.registration_open) return { ready: false, reason: 'closed', message: 'Teacher sign-up is closed. Please contact the School Administrator.' };
  const term = await one<{ id: string; academic_year_id: string; year_name: string }>(
    'select t.id, t.academic_year_id, y.name as year_name from terms t join academic_years y on y.id = t.academic_year_id where t.is_current limit 1');
  if (!term) return { ready: false, reason: 'no_term', message: 'The school has not set the current term yet. Please try again later.' };
  const [classes, subjects] = await Promise.all([
    query<RegClass>(`select id, name, section from classes where academic_year_id = $1 and status = 'active' and section is not null order by name`, [term.academic_year_id]),
    query<{ id: string; name: string }>(`select id, name from subjects where status = 'active' order by name`),
  ]);
  if (!classes.length) return { ready: false, reason: 'no_classes', message: 'No classes have been set up yet. Please try again later.' };
  if (!subjects.length) return { ready: false, reason: 'no_subjects', message: 'No subjects have been set up yet. Please try again later.' };
  return { ready: true, termId: term.id, yearId: term.academic_year_id, yearName: term.year_name, classes, subjects };
}

export function codesMatch(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(given.trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(expected.trim().toUpperCase()).digest();
  return crypto.timingSafeEqual(a, b);
}

export function newRegistrationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out;
}

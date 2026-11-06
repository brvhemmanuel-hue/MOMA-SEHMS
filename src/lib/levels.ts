export type SectionKey = 'lower_primary' | 'upper_primary' | 'jhs';

export const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: 'lower_primary', label: 'Lower Primary', hint: 'Basic 1 to 3' },
  { key: 'upper_primary', label: 'Upper Primary', hint: 'Basic 4 to 6' },
  { key: 'jhs', label: 'JHS', hint: 'Basic 7 to 9' },
];

export const sectionLabel = (k: string | null | undefined) => SECTIONS.find((s) => s.key === k)?.label ?? 'Not set';

/** Works out the level from a class name and/or the level column, for example "BASIC 4 A" or "JHS". */
export function detectSection(name: string, level?: string | null): SectionKey | null {
  const text = `${level ?? ''} ${name}`.toLowerCase();
  if (/(jhs|junior)/.test(text)) return 'jhs';
  if (/upper/.test(text)) return 'upper_primary';
  if (/lower/.test(text)) return 'lower_primary';
  const m = /(\d+)/.exec(name) ?? /(\d+)/.exec(level ?? '');
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 3) return 'lower_primary';
    if (n >= 4 && n <= 6) return 'upper_primary';
    if (n >= 7 && n <= 9) return 'jhs';
  }
  return null;
}

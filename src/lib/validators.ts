export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Usernames (no @) are allowed for accounts: 3-40 chars of letters, digits, dot, underscore, hyphen.
export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

export function isEmailOrUsername(v: string) {
  return EMAIL_RE.test(v) || USERNAME_RE.test(v);
}

export function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalises Ghana-friendly phone numbers. Returns '' for empty, null when implausible. */
export function normalisePhone(raw: unknown): string | null {
  const s = clean(raw).replace(/[\s\-().]/g, '');
  if (!s) return '';
  let d = s;
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^0\d{9}$/.test(d)) d = '233' + d.slice(1);
  if (!/^\d{9,15}$/.test(d)) return null;
  return '+' + d;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use a mix of letters and numbers.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

export function normStatus(v: unknown, allowed: string[], fallback: string): string | null {
  const s = clean(v).toLowerCase();
  if (!s) return fallback;
  return allowed.includes(s) ? s : null;
}

export function normGender(v: unknown): string | null | '' {
  const s = clean(v).toLowerCase();
  if (!s) return '';
  if (['m', 'male', 'boy'].includes(s)) return 'male';
  if (['f', 'female', 'girl'].includes(s)) return 'female';
  return null;
}

/** Neutralise spreadsheet formula injection on export. */
export function safeCell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

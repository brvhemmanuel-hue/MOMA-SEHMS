/** Timezone helpers. All instants are stored as UTC timestamptz; the school timezone is used for input and display. */

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

function offsetMs(date: Date, tz: string) {
  const o = parts(date, tz);
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DDTHH:mm" typed in the school timezone -> UTC Date */
export function zonedToUtc(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local || '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetMs(new Date(guess), tz);
  const again = offsetMs(new Date(utc), tz);
  utc = guess - again;
  const d = new Date(utc);
  return isNaN(d.getTime()) ? null : d;
}

/** UTC Date -> "YYYY-MM-DDTHH:mm" in the school timezone (for datetime-local inputs) */
export function toLocalInput(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const o = parts(new Date(date), tz);
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDateTime(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const o = parts(new Date(date), tz);
  return `${o.day} ${MONTHS[+o.month - 1]} ${o.year}, ${o.hour}:${o.minute}`;
}

export function fmtDate(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const o = parts(new Date(date), tz);
  return `${o.day} ${MONTHS[+o.month - 1]} ${o.year}`;
}

export function todayInTz(tz: string): string {
  const o = parts(new Date(), tz);
  return `${o.year}-${o.month}-${o.day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

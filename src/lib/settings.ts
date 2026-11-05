import { cache } from 'react';
import { query } from './db';

export type Settings = {
  timezone: string;
  reminder_window_hours: number;
  repeat_threshold: number;
  stale_register_days: number;
  import_max_rows: number;
  import_max_mb: number;
  temp_password_hours: number;
  report_async_threshold: number;
  report_retention_days: number;
};

const DEFAULTS: Settings = {
  timezone: 'Africa/Accra', reminder_window_hours: 24, repeat_threshold: 3, stale_register_days: 7,
  import_max_rows: 2000, import_max_mb: 5, temp_password_hours: 72, report_async_threshold: 3000, report_retention_days: 3,
};

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await query<{ key: string; value: any }>('select key, value from system_settings');
  const out: any = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out as Settings;
});

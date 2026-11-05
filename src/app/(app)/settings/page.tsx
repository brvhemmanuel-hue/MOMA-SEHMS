import { requireSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '@/components/ActionForm';
import { PageHead } from '@/components/ui';
import { saveSettings } from '../../actions/admin';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireSession(['school_admin']);
  const s = await getSettings();
  const N = ({ k, label, hint }: { k: keyof typeof s; label: string; hint?: string }) => (
    <div><label htmlFor={k}>{label}</label><input id={k} name={k} type="number" defaultValue={s[k] as number} />{hint && <span className="small muted">{hint}</span>}</div>);
  return (
    <div className="stack">
      <PageHead title="Settings" sub="School-wide defaults. Changes apply immediately." />
      <div className="card"><ActionForm action={saveSettings} submit="Save settings" resetOnSuccess={false} className="form-grid">
        <div><label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" defaultValue={s.timezone} /><span className="small muted">All deadlines use this zone.</span></div>
        <N k="reminder_window_hours" label="Due soon window (hours)" hint="Reminders and the Due soon status start this long before a deadline." />
        <N k="repeat_threshold" label="Repeated non-submission threshold" hint="Missed or late submissions before a student is flagged." />
        <N k="stale_register_days" label="Stale register alert (days)" hint="Alert administrators when a teacher has open work and no register update for this long." />
        <N k="import_max_rows" label="Import maximum rows" /><N k="import_max_mb" label="Import maximum file size (MB)" />
        <N k="temp_password_hours" label="Temporary password lifetime (hours)" />
        <N k="report_async_threshold" label="Large report threshold (rows)" hint="Bigger reports are prepared in the background." />
        <N k="report_retention_days" label="Report file retention (days)" />
      </ActionForm></div>
    </div>
  );
}

import 'server-only';
import { query } from './db';
import { getSettings } from './settings';
import { snapshotOverdue } from './snapshot';

/** Idempotent. Safe to run on a schedule, by hand, or twice: notifications dedupe on (user, dedupe_key). */
export async function runMaintenance() {
  const st = await getSettings();
  const out: Record<string, number> = {};

  out.snapshots = await snapshotOverdue('cron', 1000);

  // Reminders: deadline approaching, to the teacher who owns the assignment.
  out.reminders = (await query(
    `insert into notifications (user_id, type, message, link, dedupe_key)
     select u.id, 'deadline_reminder', 'Due soon: "' || a.title || '" for ' || c.name || '. Update the register when work comes in.', '/work/' || a.id, 'remind:' || a.id || ':' || to_char(a.current_due_at, 'YYYYMMDDHH24MI')
       from assignments a join teacher_profiles t on t.id=a.teacher_id join users u on u.id=t.user_id join classes c on c.id=a.class_id
      where a.closed_at is null and a.current_due_at > now() and a.current_due_at <= now() + ($1 || ' hours')::interval and u.status='active'
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`, [String(st.reminder_window_hours)])).length;

  // Overdue with outstanding students.
  out.overdue = (await query(
    `insert into notifications (user_id, type, message, link, dedupe_key)
     select u.id, 'overdue', '"' || a.title || '" (' || c.name || ') is overdue with ' || x.outstanding || ' student(s) not yet submitted.', '/work/' || a.id, 'overdue:' || a.id || ':' || to_char(a.current_due_at, 'YYYYMMDDHH24MI')
       from assignments a join teacher_profiles t on t.id=a.teacher_id join users u on u.id=t.user_id join classes c on c.id=a.class_id,
            lateral (select count(*) filter (where r.status in ('pending','not_submitted'))::int outstanding from submission_records r where r.assignment_id=a.id) x
      where a.closed_at is null and a.current_due_at < now() and x.outstanding > 0 and u.status='active'
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`)).length;

  // Administrators: prolonged lack of register updates by a teacher who has open work.
  out.stale = (await query(
    `insert into notifications (user_id, type, message, link, dedupe_key)
     select adm.id, 'stale_register', t.first_name || ' ' || t.last_name || ' has open assignments and no register update for ' || $1 || ' days.', '/reports/register_completeness',
            'stale:' || t.id || ':' || to_char(now(), 'IYYY-IW')
       from teacher_profiles t join users tu on tu.id=t.user_id and tu.status='active', users adm
      where adm.role in ('school_admin','external_admin') and adm.status='active'
        and exists (select 1 from assignments a where a.teacher_id=t.id and a.closed_at is null and a.assigned_at < now() - ($1 || ' days')::interval)
        and not exists (select 1 from submission_records r join assignments a on a.id=r.assignment_id where a.teacher_id=t.id and r.status <> 'pending' and r.updated_at > now() - ($1 || ' days')::interval)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`, [String(st.stale_register_days)])).length;

  // Housekeeping: expired report files, old import working data, expired rate-limit rows, old read notifications.
  await query(`update report_runs set status='expired', file_data=null where status='ready' and expires_at < now()`);
  await query(`update import_rows set payload=null where payload is not null and batch_id in (select id from import_batches where created_at < now() - interval '7 days')`);
  await query(`delete from rate_limits where reset_at < now() - interval '1 day'`);
  await query(`delete from notifications where is_read and created_at < now() - interval '90 days'`);
  return out;
}

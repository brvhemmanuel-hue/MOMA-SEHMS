import 'server-only';
import { defaultDb, query, type Db } from './db';

/**
 * Creates the final on-time snapshot for an assignment's deadline in force, once that deadline has passed.
 * Idempotent: unique (assignment_id, deadline_used) + ON CONFLICT DO NOTHING means it is never overwritten.
 * Counts use submission timestamps, so the result is identical whether the cron job ran on time or this
 * runs lazily on a later read (late submissions never inflate the on-time count).
 */
export async function ensureSnapshot(assignmentId: string, source: 'cron' | 'lazy' | 'extension', db: Db = defaultDb, deadlineOverride?: Date) {
  const rows = await db.query(
    `with a as (
        select id, expected_count, original_due_at, coalesce($2::timestamptz, current_due_at) as deadline
          from assignments where id = $1
     ), c as (
        select a.id, a.expected_count, a.deadline, a.original_due_at,
               (select count(*) from submission_records sr
                 where sr.assignment_id = a.id and sr.status in ('on_time','late') and sr.submitted_at <= a.deadline)::int as on_time
          from a where a.deadline <= now()
     )
     insert into assignment_final_snapshots
        (assignment_id, label, deadline_used, expected_count, on_time_count, not_submitted_count, on_time_rate, source)
     select c.id, case when c.deadline = c.original_due_at then 'original' else 'extended' end, c.deadline, c.expected_count,
            c.on_time, greatest(c.expected_count - c.on_time, 0),
            case when c.expected_count = 0 then null else round(c.on_time * 100.0 / c.expected_count, 2) end, $3
       from c
     on conflict (assignment_id, deadline_used) do nothing
     returning id`,
    [assignmentId, deadlineOverride ?? null, source],
  );
  return rows.length > 0;
}

/** Lazy catch-up for any overdue assignments missing a snapshot (called by the cron job and by dashboards/reports). */
export async function snapshotOverdue(source: 'cron' | 'lazy', limit = 500) {
  const due = await query<{ id: string }>(
    `select a.id from assignments a
      where a.current_due_at <= now()
        and not exists (select 1 from assignment_final_snapshots s where s.assignment_id = a.id and s.deadline_used = a.current_due_at)
      order by a.current_due_at limit $1`,
    [limit],
  );
  let created = 0;
  for (const r of due) if (await ensureSnapshot(r.id, source)) created++;
  return created;
}

import 'server-only';
import { query, one } from './db';
import { getSettings } from './settings';
import { assignmentStatus, STATUS_LABEL, teacherScopeSql } from './rbac';
import { fmtDateTime, fmtDate } from './time';
import { snapshotOverdue } from './snapshot';
import type { Session } from './auth';

export type ReportFilters = {
  from?: string; to?: string; termId?: string; classId?: string; subjectId?: string; teacherId?: string;
  departmentId?: string; studentNo?: string; threshold?: number; groupBy?: 'week' | 'month';
};
export type FilterKey = keyof ReportFilters;
export type Col = { key: string; label: string; num?: boolean };
export type ReportResult = { columns: Col[]; rows: Record<string, any>[]; basis: string; chart?: { title: string; labels: string[]; values: number[]; unit: string }; note?: string };
type Scope = { teacherId: string | null };
type Def = {
  key: string; title: string; description: string; roles: ('school_admin' | 'external_admin' | 'teacher')[]; filters: FilterKey[];
  run: (f: ReportFilters, scope: Scope, tz: string) => Promise<ReportResult>;
};

/** Reports are for the School Administrator and the External Administrator only. */
const ALL = ['school_admin', 'external_admin'] as const;
const OVERSIGHT = ['school_admin', 'external_admin'] as const;
const ASSIGN_FILTERS: FilterKey[] = ['from', 'to', 'termId', 'classId', 'subjectId', 'teacherId', 'departmentId'];
const pct = (n: number, d: number) => (d > 0 ? Math.round((n * 1000) / d) / 10 : null);
const pctCell = (v: number | null) => (v === null ? 'N/A' : `${v}%`);
const CURRENT = 'Current figures as at generation time. On-time, late and cumulative totals are shown separately; final-at-deadline snapshot shown where the deadline has passed.';

/** Builds the WHERE clause for assignments aliased `a` (joined to subjects `s`). Param $1 is always the timezone. */
function where(f: ReportFilters, scope: Scope, params: any[]) {
  const w: string[] = ['$1::text is not null']; // keeps the timezone parameter referenced in every query
  const add = (v: any) => { params.push(v); return `$${params.length}`; };
  if (f.from) w.push(`(a.assigned_at at time zone $1)::date >= ${add(f.from)}::date`);
  if (f.to) w.push(`(a.assigned_at at time zone $1)::date <= ${add(f.to)}::date`);
  if (f.termId) w.push(`a.term_id = ${add(f.termId)}`);
  if (f.classId) w.push(`a.class_id = ${add(f.classId)}`);
  if (f.subjectId) w.push(`a.subject_id = ${add(f.subjectId)}`);
  if (f.departmentId) w.push(`s.department_id = ${add(f.departmentId)}`);
  if (scope.teacherId) w.push(teacherScopeSql('a', params.push(scope.teacherId)));
  else if (f.teacherId) w.push(`a.teacher_id = ${add(f.teacherId)}`);
  return 'where ' + w.join(' and ');
}

const STATS = (wh: string) => `
  select a.id, a.title, a.type, c.name as class_name, s.name as subject_name, s.department_id,
         tp.id as teacher_id, tp.first_name || ' ' || tp.last_name as teacher_name,
         a.assigned_at, a.original_due_at, a.current_due_at, a.closed_at, a.expected_count,
         count(sr.id) filter (where sr.status = 'on_time')::int as on_time,
         count(sr.id) filter (where sr.status = 'late')::int as late,
         count(sr.id) filter (where sr.status in ('on_time','late'))::int as submitted,
         count(sr.id) filter (where sr.status <> 'pending')::int as recorded,
         (select on_time_rate from assignment_final_snapshots fs where fs.assignment_id = a.id order by deadline_used desc limit 1) as snap_rate,
         (select on_time_count from assignment_final_snapshots fs where fs.assignment_id = a.id order by deadline_used desc limit 1) as snap_on_time
    from assignments a
    join classes c on c.id = a.class_id
    join subjects s on s.id = a.subject_id
    join teacher_profiles tp on tp.id = a.teacher_id
    left join submission_records sr on sr.assignment_id = a.id
    ${wh}
   group by a.id, c.name, s.name, s.department_id, tp.id, tp.first_name, tp.last_name
   order by a.assigned_at desc`;

async function stats(f: ReportFilters, scope: Scope, tz: string) {
  const params: any[] = [tz];
  const wh = where(f, scope, params);
  return query<any>(STATS(wh), params);
}

const REPORTS: Def[] = [
  {
    key: 'assignment', title: 'Assignment report', description: 'Every class exercise and homework with original and revised due dates.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const st = await getSettings();
      const rows = (await stats(f, scope, tz)).map((r) => ({
        title: r.title, type: r.type === 'homework' ? 'Homework' : 'Class exercise', class: r.class_name, subject: r.subject_name, teacher: r.teacher_name,
        assigned: fmtDateTime(r.assigned_at, tz), original_due: fmtDateTime(r.original_due_at, tz),
        revised_due: +new Date(r.current_due_at) !== +new Date(r.original_due_at) ? fmtDateTime(r.current_due_at, tz) : '',
        status: STATUS_LABEL[assignmentStatus(r, st.reminder_window_hours)],
      }));
      return { basis: CURRENT, rows, columns: [
        { key: 'title', label: 'Title' }, { key: 'type', label: 'Type' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'teacher', label: 'Teacher' },
        { key: 'assigned', label: 'Assigned' }, { key: 'original_due', label: 'Original due' }, { key: 'revised_due', label: 'Revised due' }, { key: 'status', label: 'Status' }] };
    },
  },
  {
    key: 'submission', title: 'Submission report', description: 'Expected, on time, late, not submitted and current cumulative totals per assignment.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const rows = (await stats(f, scope, tz)).map((r) => ({
        title: r.title, class: r.class_name, subject: r.subject_name, due: fmtDateTime(r.current_due_at, tz), expected: r.expected_count,
        on_time: r.on_time, late: r.late, not_submitted: Math.max(r.expected_count - r.submitted, 0), cumulative: r.submitted,
        current_pct: pctCell(pct(r.submitted, r.expected_count)),
        final_rate: new Date(r.current_due_at) <= new Date() ? (r.snap_rate === null || r.snap_rate === undefined ? 'N/A' : `${Number(r.snap_rate)}%`) : 'Not yet due',
      }));
      return { basis: CURRENT, rows, columns: [
        { key: 'title', label: 'Assignment' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'due', label: 'Due' },
        { key: 'expected', label: 'Expected', num: true }, { key: 'on_time', label: 'Submitted on time', num: true }, { key: 'late', label: 'Submitted late', num: true },
        { key: 'not_submitted', label: 'Not submitted (current)', num: true }, { key: 'cumulative', label: 'Current cumulative submitted', num: true },
        { key: 'current_pct', label: 'Current %', num: true }, { key: 'final_rate', label: 'Final on-time rate', num: true }] };
    },
  },
  {
    key: 'student_history', title: 'Individual student history', description: 'Every assignment for one student with status and submission time.', roles: [...ALL], filters: ['studentNo', 'from', 'to', 'subjectId'],
    run: async (f, scope, tz) => {
      if (!f.studentNo) return { basis: CURRENT, rows: [], columns: [], note: 'Enter a student number (for example S-2026-0001) to see that student\u2019s history.' };
      const stu = await one<any>('select id, first_name, last_name from student_profiles where upper(student_no) = upper($1)', [f.studentNo.trim()]);
      if (!stu) return { basis: CURRENT, rows: [], columns: [], note: 'No student with that student number was found.' };
      const params: any[] = [tz, stu.id];
      const w = ['sr.student_id = $2', '$1::text is not null'];
      if (scope.teacherId) w.push(teacherScopeSql('a', params.push(scope.teacherId)));
      if (f.subjectId) w.push(`a.subject_id = $${params.push(f.subjectId)}`);
      if (f.from) w.push(`(a.assigned_at at time zone $1)::date >= $${params.push(f.from)}::date`);
      if (f.to) w.push(`(a.assigned_at at time zone $1)::date <= $${params.push(f.to)}::date`);
      const rows = (await query<any>(
        `select a.title, a.type, s.name subject, c.name class, a.current_due_at, sr.status, sr.submitted_at, sr.note
           from submission_records sr join assignments a on a.id = sr.assignment_id join subjects s on s.id = a.subject_id join classes c on c.id = a.class_id
          where ${w.join(' and ')} order by a.assigned_at desc`, params)).map((r) => ({
        title: r.title, type: r.type === 'homework' ? 'Homework' : 'Class exercise', subject: r.subject, class: r.class, due: fmtDateTime(r.current_due_at, tz),
        status: statusLabel(r.status, r.current_due_at), submitted_at: fmtDateTime(r.submitted_at, tz), note: r.note || '' }));
      return { basis: CURRENT, rows, note: `${stu.first_name} ${stu.last_name} (${f.studentNo.toUpperCase()})`, columns: [
        { key: 'title', label: 'Assignment' }, { key: 'type', label: 'Type' }, { key: 'subject', label: 'Subject' }, { key: 'class', label: 'Class' }, { key: 'due', label: 'Due' },
        { key: 'status', label: 'Status' }, { key: 'submitted_at', label: 'Submitted at' }, { key: 'note', label: 'Note' }] };
    },
  },
  {
    key: 'class', title: 'Class report', description: 'Participation by student and subject within a class.', roles: [...ALL], filters: ['from', 'to', 'termId', 'classId', 'subjectId'],
    run: async (f, scope, tz) => {
      const params: any[] = [tz];
      const wh = where(f, scope, params);
      const rows = (await query<any>(
        `select c.name class_name, stu.student_no, stu.last_name || ', ' || stu.first_name as student, s.name subject_name,
                count(*)::int total,
                count(*) filter (where sr.status = 'on_time')::int on_time,
                count(*) filter (where sr.status = 'late')::int late,
                count(*) filter (where sr.status in ('pending','not_submitted'))::int outstanding
           from assignments a join classes c on c.id = a.class_id join subjects s on s.id = a.subject_id
           join submission_records sr on sr.assignment_id = a.id join student_profiles stu on stu.id = sr.student_id
           ${wh} group by c.name, stu.student_no, stu.last_name, stu.first_name, s.name order by c.name, stu.last_name, stu.first_name, s.name`, params)).map((r) => ({
        class: r.class_name, student_no: r.student_no, student: r.student, subject: r.subject_name, total: r.total, on_time: r.on_time, late: r.late, outstanding: r.outstanding,
        participation: pctCell(pct(r.on_time + r.late, r.total)) }));
      return { basis: CURRENT, rows, columns: [
        { key: 'class', label: 'Class' }, { key: 'student_no', label: 'Student no.' }, { key: 'student', label: 'Student' }, { key: 'subject', label: 'Subject' },
        { key: 'total', label: 'Assignments', num: true }, { key: 'on_time', label: 'On time', num: true }, { key: 'late', label: 'Late', num: true },
        { key: 'outstanding', label: 'Outstanding', num: true }, { key: 'participation', label: 'Participation (cumulative)', num: true }] };
    },
  },
  {
    key: 'subject', title: 'Subject report', description: 'Assignment and submission trends for a subject across classes, by month.', roles: [...ALL], filters: ['from', 'to', 'termId', 'classId', 'subjectId', 'departmentId'],
    run: async (f, scope, tz) => {
      const rows = (await stats(f, scope, tz)).reduce((m: Map<string, any>, r) => {
        const month = fmtDate(r.assigned_at, tz).slice(3);
        const k = `${r.subject_name}|${r.class_name}|${month}`;
        const x = m.get(k) ?? { subject: r.subject_name, class: r.class_name, month, assignments: 0, expected: 0, on_time: 0, late: 0 };
        x.assignments++; x.expected += r.expected_count; x.on_time += r.on_time; x.late += r.late; m.set(k, x); return m;
      }, new Map());
      const out = [...rows.values()].map((x) => ({ ...x, pct: pctCell(pct(x.on_time + x.late, x.expected)) }));
      return { basis: CURRENT, rows: out, columns: [
        { key: 'subject', label: 'Subject' }, { key: 'class', label: 'Class' }, { key: 'month', label: 'Month' }, { key: 'assignments', label: 'Assignments', num: true },
        { key: 'expected', label: 'Expected', num: true }, { key: 'on_time', label: 'On time', num: true }, { key: 'late', label: 'Late', num: true }, { key: 'pct', label: 'Cumulative %', num: true }] };
    },
  },
  {
    key: 'outstanding', title: 'Outstanding submissions report', description: 'Students with pending or not-submitted work, ready to print for follow-up.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const params: any[] = [tz];
      const wh = where(f, scope, params);
      const rows = (await query<any>(
        `select c.name class_name, s.name subject_name, a.title, a.current_due_at, tp.first_name || ' ' || tp.last_name teacher, stu.student_no,
                stu.last_name || ', ' || stu.first_name student, sr.status
           from assignments a join classes c on c.id = a.class_id join subjects s on s.id = a.subject_id join teacher_profiles tp on tp.id = a.teacher_id
           join submission_records sr on sr.assignment_id = a.id join student_profiles stu on stu.id = sr.student_id
           ${wh} and sr.status in ('pending','not_submitted') and a.closed_at is null
           order by c.name, s.name, a.current_due_at, stu.last_name`, params)).map((r) => ({
        class: r.class_name, subject: r.subject_name, assignment: r.title, due: fmtDateTime(r.current_due_at, tz), teacher: r.teacher, student_no: r.student_no, student: r.student, status: statusLabel(r.status, r.current_due_at) }));
      return { basis: CURRENT, rows, columns: [
        { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'assignment', label: 'Assignment' }, { key: 'due', label: 'Due' }, { key: 'teacher', label: 'Teacher' },
        { key: 'student_no', label: 'Student no.' }, { key: 'student', label: 'Student' }, { key: 'status', label: 'Status' }] };
    },
  },
  {
    key: 'overdue', title: 'Overdue assignments report', description: 'Assignments past their deadline with outstanding counts and register completeness.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const rows = (await stats(f, scope, tz)).filter((r) => new Date(r.current_due_at) < new Date() && !r.closed_at).map((r) => ({
        title: r.title, class: r.class_name, subject: r.subject_name, teacher: r.teacher_name, due: fmtDateTime(r.current_due_at, tz), expected: r.expected_count,
        submitted: r.submitted, outstanding: Math.max(r.expected_count - r.submitted, 0), complete: pctCell(pct(r.recorded, r.expected_count)) }));
      return { basis: CURRENT, rows, columns: [
        { key: 'title', label: 'Assignment' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'teacher', label: 'Teacher' }, { key: 'due', label: 'Due' },
        { key: 'expected', label: 'Expected', num: true }, { key: 'submitted', label: 'Submitted (cumulative)', num: true }, { key: 'outstanding', label: 'Outstanding', num: true }, { key: 'complete', label: 'Register completeness', num: true }] };
    },
  },
  {
    key: 'repeated', title: 'Repeated non-submission and late pattern report', description: 'Students at or above the configured threshold of missed or late submissions.', roles: [...ALL], filters: ['from', 'to', 'termId', 'classId', 'subjectId', 'threshold'],
    run: async (f, scope, tz) => {
      const st = await getSettings();
      const threshold = f.threshold || st.repeat_threshold;
      const params: any[] = [tz];
      const wh = where(f, scope, params);
      params.push(threshold);
      const rows = (await query<any>(
        `select c.name class_name, stu.student_no, stu.last_name || ', ' || stu.first_name student,
                count(*)::int total,
                count(*) filter (where sr.status = 'late')::int late,
                count(*) filter (where sr.status = 'not_submitted' or (sr.status = 'pending' and a.current_due_at < now()))::int missed
           from assignments a join classes c on c.id = a.class_id join subjects s on s.id = a.subject_id
           join submission_records sr on sr.assignment_id = a.id join student_profiles stu on stu.id = sr.student_id
           ${wh} group by c.name, stu.student_no, stu.last_name, stu.first_name
          having count(*) filter (where sr.status = 'late' or sr.status = 'not_submitted' or (sr.status = 'pending' and a.current_due_at < now())) >= $${params.length}
          order by missed desc, late desc, c.name, stu.last_name`, params)).map((r) => ({
        class: r.class_name, student_no: r.student_no, student: r.student, total: r.total, missed: r.missed, late: r.late, flagged: r.missed + r.late }));
      return { basis: CURRENT, note: `Threshold: ${threshold} missed or late submissions.`, rows, columns: [
        { key: 'class', label: 'Class' }, { key: 'student_no', label: 'Student no.' }, { key: 'student', label: 'Student' }, { key: 'total', label: 'Assignments', num: true },
        { key: 'missed', label: 'Not submitted', num: true }, { key: 'late', label: 'Submitted late', num: true }, { key: 'flagged', label: 'Missed + late', num: true }] };
    },
  },
  {
    key: 'teacher_activity', title: 'Teacher activity report', description: 'Assignments created, registers updated, last update and incomplete records.', roles: [...ALL], filters: ['from', 'to', 'termId', 'teacherId'],
    run: async (f, scope, tz) => {
      const params: any[] = [tz];
      const w: string[] = ['$1::text is not null'];
      if (scope.teacherId) w.push(`tp.id = $${params.push(scope.teacherId)}`); else if (f.teacherId) w.push(`tp.id = $${params.push(f.teacherId)}`);
      const dr: string[] = [];
      if (f.from) dr.push(`(a.assigned_at at time zone $1)::date >= $${params.push(f.from)}::date`);
      if (f.to) dr.push(`(a.assigned_at at time zone $1)::date <= $${params.push(f.to)}::date`);
      if (f.termId) dr.push(`a.term_id = $${params.push(f.termId)}`);
      const rows = (await query<any>(
        `select tp.teacher_no, tp.first_name || ' ' || tp.last_name teacher,
           count(distinct a.id)::int created,
           count(distinct a.id) filter (where exists (select 1 from submission_records x where x.assignment_id = a.id and x.status <> 'pending'))::int updated,
           count(distinct a.id) filter (where not exists (select 1 from submission_records x where x.assignment_id = a.id and x.status = 'pending'))::int complete,
           max((select max(x.updated_at) from submission_records x where x.assignment_id = a.id and x.status <> 'pending')) last_update
         from teacher_profiles tp join users u on u.id = tp.user_id
         left join assignments a on a.teacher_id = tp.id ${dr.length ? 'and ' + dr.join(' and ') : ''}
         ${w.length ? 'where ' + w.join(' and ') : ''}
         group by tp.id order by tp.last_name, tp.first_name`, params)).map((r) => ({
        teacher_no: r.teacher_no, teacher: r.teacher, created: r.created, updated: r.updated, complete: r.complete, incomplete: r.created - r.complete, last_update: fmtDateTime(r.last_update, tz) }));
      return { basis: 'Activity counts for the selected period. Observable platform activity only; not a judgement of teaching quality.', rows, columns: [
        { key: 'teacher_no', label: 'Teacher no.' }, { key: 'teacher', label: 'Teacher' }, { key: 'created', label: 'Assignments created', num: true }, { key: 'updated', label: 'Registers updated', num: true },
        { key: 'complete', label: 'Complete registers', num: true }, { key: 'incomplete', label: 'Incomplete registers', num: true }, { key: 'last_update', label: 'Last register update' }] };
    },
  },
  {
    key: 'register_completeness', title: 'Register completeness report', description: 'Assignments whose student status records are incomplete, by teacher.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const rows = (await stats(f, scope, tz)).filter((r) => r.recorded < r.expected_count).map((r) => ({
        teacher: r.teacher_name, title: r.title, class: r.class_name, subject: r.subject_name, due: fmtDateTime(r.current_due_at, tz), expected: r.expected_count, recorded: r.recorded, pending: r.expected_count - r.recorded, complete: pctCell(pct(r.recorded, r.expected_count)) }));
      rows.sort((a, b) => a.teacher.localeCompare(b.teacher));
      return { basis: CURRENT, rows, columns: [
        { key: 'teacher', label: 'Teacher' }, { key: 'title', label: 'Assignment' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'due', label: 'Due' },
        { key: 'expected', label: 'Expected', num: true }, { key: 'recorded', label: 'Recorded', num: true }, { key: 'pending', label: 'Still pending', num: true }, { key: 'complete', label: 'Completeness', num: true }] };
    },
  },
  {
    key: 'department', title: 'Department summary', description: 'Participation grouped by department label (optional grouping, no special permissions).', roles: [...OVERSIGHT], filters: ['from', 'to', 'termId', 'departmentId'],
    run: async (f, scope, tz) => {
      const depts = new Map((await query<any>('select id, name from departments')).map((d: any) => [d.id, d.name]));
      const agg = new Map<string, any>();
      for (const r of await stats(f, scope, tz)) {
        const name = r.department_id ? depts.get(r.department_id) ?? '(unknown)' : '(No department)';
        const x = agg.get(name) ?? { department: name, assignments: 0, expected: 0, on_time: 0, late: 0 };
        x.assignments++; x.expected += r.expected_count; x.on_time += r.on_time; x.late += r.late; agg.set(name, x);
      }
      const rows = [...agg.values()].map((x) => ({ ...x, pct: pctCell(pct(x.on_time + x.late, x.expected)) }));
      return { basis: CURRENT, rows, columns: [
        { key: 'department', label: 'Department' }, { key: 'assignments', label: 'Assignments', num: true }, { key: 'expected', label: 'Expected', num: true },
        { key: 'on_time', label: 'On time', num: true }, { key: 'late', label: 'Late', num: true }, { key: 'pct', label: 'Cumulative %', num: true }] };
    },
  },
  {
    key: 'school_summary', title: 'School summary', description: 'Whole-school weekly or monthly participation trend with chart.', roles: [...OVERSIGHT], filters: ['from', 'to', 'termId', 'groupBy'],
    run: async (f, scope, tz) => {
      const unit = f.groupBy === 'month' ? 'month' : 'week';
      const params: any[] = [tz];
      const wh = where({ ...f, classId: undefined, subjectId: undefined, teacherId: undefined, departmentId: undefined }, scope, params);
      const rows = await query<any>(
        `with st as (${STATS(wh)})
         select date_trunc('${unit}', (assigned_at at time zone $1))::date as bucket, count(*)::int assignments, sum(expected_count)::int expected,
                sum(on_time)::int on_time, sum(late)::int late
           from st group by 1 order by 1`, params);
      const out = rows.map((r) => ({
        period: unit === 'month' ? new Date(r.bucket).toISOString().slice(0, 7) : `Week of ${new Date(r.bucket).toISOString().slice(0, 10)}`,
        assignments: r.assignments, expected: r.expected, on_time: r.on_time, late: r.late, cumulative: r.on_time + r.late, pct: pctCell(pct(r.on_time + r.late, r.expected)) }));
      return { basis: CURRENT, rows: out,
        chart: { title: `Cumulative submission % by ${unit}`, labels: out.map((r) => r.period), values: rows.map((r) => pct(r.on_time + r.late, r.expected) ?? 0), unit: '%' },
        columns: [{ key: 'period', label: unit === 'month' ? 'Month' : 'Week' }, { key: 'assignments', label: 'Assignments', num: true }, { key: 'expected', label: 'Expected', num: true },
          { key: 'on_time', label: 'On time', num: true }, { key: 'late', label: 'Late', num: true }, { key: 'cumulative', label: 'Current cumulative', num: true }, { key: 'pct', label: 'Cumulative %', num: true }] };
    },
  },
  {
    key: 'deadline_extension', title: 'Deadline extension report', description: 'Original and revised deadlines with reason, who changed them and when.', roles: [...ALL], filters: ASSIGN_FILTERS,
    run: async (f, scope, tz) => {
      const params: any[] = [tz];
      const wh = where(f, scope, params);
      const rows = (await query<any>(
        `select a.title, c.name class_name, s.name subject_name, a.original_due_at, h.previous_due_at, h.new_due_at, h.reason, u.full_name, h.changed_at
           from assignment_deadline_history h join assignments a on a.id = h.assignment_id join classes c on c.id = a.class_id join subjects s on s.id = a.subject_id
           join users u on u.id = h.changed_by ${wh} order by h.changed_at desc`, params)).map((r) => ({
        title: r.title, class: r.class_name, subject: r.subject_name, original: fmtDateTime(r.original_due_at, tz), previous: fmtDateTime(r.previous_due_at, tz), revised: fmtDateTime(r.new_due_at, tz), reason: r.reason, by: r.full_name, at: fmtDateTime(r.changed_at, tz) }));
      return { basis: CURRENT, rows, columns: [
        { key: 'title', label: 'Assignment' }, { key: 'class', label: 'Class' }, { key: 'subject', label: 'Subject' }, { key: 'original', label: 'Original deadline' }, { key: 'previous', label: 'Previous deadline' },
        { key: 'revised', label: 'Revised deadline' }, { key: 'reason', label: 'Reason' }, { key: 'by', label: 'Changed by' }, { key: 'at', label: 'Changed at' }] };
    },
  },
  {
    key: 'import_history', title: 'Import history report', description: 'Import batches with counts, outcomes and administrators.', roles: ['school_admin'], filters: ['from', 'to'],
    run: async (f, _s, tz) => {
      const params: any[] = [tz];
      const w: string[] = ['$1::text is not null'];
      if (f.from) w.push(`(b.created_at at time zone $1)::date >= $${params.push(f.from)}::date`);
      if (f.to) w.push(`(b.created_at at time zone $1)::date <= $${params.push(f.to)}::date`);
      const rows = (await query<any>(
        `select b.created_at, u.full_name, b.entity_type, b.file_name, b.mode, b.status, b.total_rows, b.created_count, b.updated_count, b.skipped_count, b.failed_count, b.error_rows
           from import_batches b join users u on u.id = b.uploaded_by ${w.length ? 'where ' + w.join(' and ') : ''} order by b.created_at desc`, params)).map((r) => ({
        at: fmtDateTime(r.created_at, tz), by: r.full_name, entity: r.entity_type, file: r.file_name, mode: r.mode === 'create_only' ? 'Create only' : 'Create and update', status: r.status,
        total: r.total_rows, created: r.created_count, updated: r.updated_count, skipped: r.skipped_count, failed: r.failed_count, errors: r.error_rows }));
      return { basis: 'Import log (no passwords or sensitive values are recorded).', rows, columns: [
        { key: 'at', label: 'When' }, { key: 'by', label: 'Administrator' }, { key: 'entity', label: 'Type' }, { key: 'file', label: 'File' }, { key: 'mode', label: 'Mode' }, { key: 'status', label: 'Status' },
        { key: 'total', label: 'Rows', num: true }, { key: 'created', label: 'Created', num: true }, { key: 'updated', label: 'Updated', num: true }, { key: 'skipped', label: 'Skipped', num: true }, { key: 'failed', label: 'Failed', num: true }, { key: 'errors', label: 'Rejected at validation', num: true }] };
    },
  },
  {
    key: 'audit', title: 'Audit report', description: 'Security-sensitive and record-change events. Passwords are never recorded.', roles: ['school_admin'], filters: ['from', 'to'],
    run: async (f, _s, tz) => {
      const params: any[] = [tz];
      const w: string[] = ['$1::text is not null'];
      if (f.from) w.push(`(l.created_at at time zone $1)::date >= $${params.push(f.from)}::date`);
      if (f.to) w.push(`(l.created_at at time zone $1)::date <= $${params.push(f.to)}::date`);
      const rows = (await query<any>(
        `select l.created_at, u.full_name, l.action, l.entity, l.entity_id, l.metadata from activity_logs l left join users u on u.id = l.user_id
          ${w.length ? 'where ' + w.join(' and ') : ''} order by l.created_at desc limit 5000`, params)).map((r) => ({
        at: fmtDateTime(r.created_at, tz), user: r.full_name || 'System', action: r.action, entity: r.entity || '', detail: JSON.stringify(r.metadata).slice(0, 200) }));
      return { basis: 'Most recent 5,000 events in range.', rows, columns: [
        { key: 'at', label: 'When' }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action' }, { key: 'entity', label: 'Record type' }, { key: 'detail', label: 'Details' }] };
    },
  },
];

export function statusLabel(status: string, dueAt: Date | string) {
  if (status === 'on_time') return 'Submitted on time';
  if (status === 'late') return 'Submitted late';
  if (status === 'not_submitted') return 'Not submitted';
  return new Date(dueAt) < new Date() ? 'Pending (not submitted as of now)' : 'Pending';
}

export const REPORT_LIST = REPORTS.map(({ key, title, description, roles, filters }) => ({ key, title, description, roles, filters }));
export const reportsFor = (role: string) => REPORT_LIST.filter((r) => (r.roles as string[]).includes(role));

export type ReportMeta = {
  school: string; title: string; dateRange: string; scope: string; filtersApplied: string; generatedBy: string; generatedAt: string; basis: string;
};

export async function runReport(key: string, f: ReportFilters, s: Session, opts: { internal?: boolean } = {}) {
  const def = REPORTS.find((r) => r.key === key);
  // `internal` lets a teacher's own dashboard reuse a query, scoped to that teacher; teachers never get the Reports pages.
  if (!def || (!opts.internal && !(def.roles as string[]).includes(s.role))) throw new Error('Report not available.');
  const st = await getSettings();
  const scope: Scope = { teacherId: s.role === 'teacher' ? s.teacherId : null };
  if (s.role === 'teacher' && !s.teacherId) throw new Error('No teacher profile.');
  await snapshotOverdue('lazy', 200); // lazy snapshot equivalence: figures never depend on the cron having run
  const result = await def.run(f, scope, st.timezone);

  const names = async (table: string, id?: string) => (id ? (await one<any>(`select name from ${table} where id=$1`, [id]))?.name : null);
  const applied: string[] = [];
  const cls = await names('classes', f.classId); if (cls) applied.push(`Class: ${cls}`);
  const sub = await names('subjects', f.subjectId); if (sub) applied.push(`Subject: ${sub}`);
  const dep = await names('departments', f.departmentId); if (dep) applied.push(`Department: ${dep}`);
  const trm = await names('terms', f.termId); if (trm) applied.push(`Term: ${trm}`);
  if (f.teacherId && !scope.teacherId) { const t = await one<any>("select first_name||' '||last_name n from teacher_profiles where id=$1", [f.teacherId]); if (t) applied.push(`Teacher: ${t.n}`); }
  if (f.studentNo) applied.push(`Student: ${f.studentNo.toUpperCase()}`);
  if (f.threshold) applied.push(`Threshold: ${f.threshold}`);
  if (f.groupBy) applied.push(`Grouped by ${f.groupBy}`);

  const meta: ReportMeta = {
    school: 'Mount Olivet Methodist Academy',
    title: def.title,
    dateRange: f.from || f.to ? `${f.from ? fmtDate(f.from + 'T12:00:00Z', 'UTC') : 'Start'} to ${f.to ? fmtDate(f.to + 'T12:00:00Z', 'UTC') : 'Today'}` : 'All dates',
    scope: scope.teacherId ? `${s.fullName}: own assigned classes and subjects only` : 'Whole school',
    filtersApplied: applied.length ? applied.join('; ') : 'None',
    generatedBy: `${s.fullName} (${s.role.replace('_', ' ')})`,
    generatedAt: fmtDateTime(new Date(), st.timezone),
    basis: result.basis,
  };
  return { meta, result, def: { key: def.key, title: def.title, filters: def.filters } };
}

export function parseFilters(sp: URLSearchParams | Record<string, string | undefined>): ReportFilters {
  const g = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : sp[k]) || undefined;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const th = Number(g('threshold'));
  return {
    from: date(g('from')), to: date(g('to')), termId: uuid(g('termId')), classId: uuid(g('classId')), subjectId: uuid(g('subjectId')),
    teacherId: uuid(g('teacherId')), departmentId: uuid(g('departmentId')), studentNo: g('studentNo')?.slice(0, 30),
    threshold: th > 0 && th < 100 ? th : undefined, groupBy: g('groupBy') === 'month' ? 'month' : g('groupBy') === 'week' ? 'week' : undefined,
  };
}

/** Raw per-assignment statistics for dashboards (same role scoping as the reports). */
export async function dashboardStats(f: ReportFilters, s: Session) {
  const st = await getSettings();
  await snapshotOverdue('lazy', 200);
  return stats(f, { teacherId: s.role === 'teacher' ? s.teacherId : null }, st.timezone);
}

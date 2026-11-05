-- MOMA-SEHMS initial schema (PostgreSQL / Neon)
-- No marks, scores, grades, HOD, class-teacher, attachment or follow-up tables exist by design.

create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists id_counters (
  name text primary key,
  prefix text not null,
  current_value bigint not null default 0
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  password_hash text not null,
  role text not null check (role in ('school_admin','external_admin','teacher')),
  status text not null default 'active' check (status in ('active','inactive')),
  must_change_password boolean not null default true,
  temp_password_expires_at timestamptz,
  session_version int not null default 1,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_uq on users (lower(email));

create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamptz not null
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create unique index if not exists departments_name_uq on departments (lower(trim(name)));

create table if not exists academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index if not exists academic_years_name_uq on academic_years (lower(trim(name)));

create table if not exists terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index if not exists terms_name_uq on terms (academic_year_id, lower(trim(name)));

create table if not exists teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  teacher_no text not null unique,
  first_name text not null,
  last_name text not null,
  phone text,
  department_id uuid references departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_no text not null unique,
  first_name text not null,
  last_name text not null,
  other_names text,
  gender text check (gender in ('male','female') or gender is null),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_name_idx on student_profiles (lower(last_name), lower(first_name));

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  class_code text not null unique,
  name text not null,
  level text,
  programme text,
  department_id uuid references departments(id) on delete set null,
  academic_year_id uuid not null references academic_years(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create unique index if not exists classes_name_year_uq on classes (lower(trim(name)), academic_year_id);

create table if not exists student_class_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references student_profiles(id) on delete cascade,
  class_id uuid not null references classes(id),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now()
);
create index if not exists sch_class_idx on student_class_history (class_id) where effective_to is null;
create index if not exists sch_student_idx on student_class_history (student_id);
create unique index if not exists sch_one_open_per_student on student_class_history (student_id) where effective_to is null;

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null unique,
  name text not null,
  department_id uuid references departments(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create unique index if not exists subjects_name_uq on subjects (lower(trim(name)));

create table if not exists teacher_class_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher_profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id),
  term_id uuid not null references terms(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, subject_id, term_id)
);
create index if not exists tcsa_teacher_idx on teacher_class_subject_assignments (teacher_id) where status = 'active';

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('class_exercise','homework')),
  class_id uuid not null references classes(id),
  subject_id uuid not null references subjects(id),
  teacher_id uuid not null references teacher_profiles(id),
  term_id uuid references terms(id),
  assigned_at timestamptz not null default now(),
  original_due_at timestamptz not null,
  current_due_at timestamptz not null,
  description text,
  closed_at timestamptz,
  closed_by uuid references users(id),
  expected_count int not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_due_at >= assigned_at)
);
create index if not exists assignments_teacher_idx on assignments (teacher_id, created_at desc);
create index if not exists assignments_class_subject_idx on assignments (class_id, subject_id);
create index if not exists assignments_due_idx on assignments (current_due_at);

create table if not exists assignment_expected_students (
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references student_profiles(id),
  primary key (assignment_id, student_id)
);

create table if not exists submission_records (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references student_profiles(id),
  status text not null default 'pending' check (status in ('pending','on_time','late','not_submitted')),
  submitted_at timestamptz,
  entered_by uuid references users(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  check ((status in ('on_time','late')) = (submitted_at is not null))
);
create index if not exists submissions_assignment_idx on submission_records (assignment_id, status);
create index if not exists submissions_student_idx on submission_records (student_id);

create table if not exists assignment_deadline_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  previous_due_at timestamptz not null,
  new_due_at timestamptz not null,
  reason text not null,
  changed_by uuid not null references users(id),
  changed_at timestamptz not null default now()
);

create table if not exists assignment_final_snapshots (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  label text not null default 'original',
  deadline_used timestamptz not null,
  expected_count int not null,
  on_time_count int not null,
  not_submitted_count int not null,
  on_time_rate numeric(6,2),
  source text not null check (source in ('cron','lazy','extension')),
  snapshot_at timestamptz not null default now(),
  unique (assignment_id, deadline_used)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  dedupe_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_uq on notifications (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_idx on notifications (user_id, is_read, created_at desc);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_created_idx on activity_logs (created_at desc);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  file_name text not null,
  mode text not null default 'create_only' check (mode in ('create_only','create_and_update')),
  commit_mode text check (commit_mode in ('all_or_nothing','skip_invalid')),
  uploaded_by uuid not null references users(id),
  status text not null default 'previewed' check (status in ('previewed','committed','failed','discarded')),
  total_rows int not null default 0,
  ready_rows int not null default 0,
  error_rows int not null default 0,
  warning_rows int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  outcome text not null check (outcome in ('ready','error','warning','created','updated','skipped','failed')),
  action text check (action in ('create','update','skip')),
  payload jsonb,
  target_id uuid,
  generated_ref text,
  messages jsonb not null default '[]'::jsonb
);
create index if not exists import_rows_batch_idx on import_rows (batch_id, row_number);

create table if not exists report_runs (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  format text not null check (format in ('pdf','xlsx','csv')),
  filters jsonb not null default '{}'::jsonb,
  requested_by uuid not null references users(id),
  status text not null default 'queued' check (status in ('queued','running','ready','failed','expired')),
  file_name text,
  content_type text,
  file_data bytea,
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

insert into id_counters (name, prefix, current_value) values
  ('teacher', 'T-', 0), ('class', 'CLS-', 0), ('subject', 'SUB-', 0)
on conflict do nothing;

insert into system_settings (key, value) values
  ('timezone', '"Africa/Accra"'),
  ('reminder_window_hours', '24'),
  ('repeat_threshold', '3'),
  ('stale_register_days', '7'),
  ('import_max_rows', '2000'),
  ('import_max_mb', '5'),
  ('temp_password_hours', '72'),
  ('report_async_threshold', '3000'),
  ('report_retention_days', '3')
on conflict do nothing;

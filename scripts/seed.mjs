// DEMONSTRATION DATA ONLY. Do not run against a production database.
import bcrypt from 'bcryptjs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1); }
const c = new pg.Client({ connectionString: url });
await c.connect();
const pad = (n) => String(n).padStart(4, '0');
const q = async (t, p = []) => (await c.query(t, p)).rows;
const DEMO_PASSWORD = 'Demo@12345';
const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
const ctr = async (name, prefix) => {
  const r = await q(`insert into id_counters (name,prefix,current_value) values ($1,$2,1) on conflict (name) do update set current_value=id_counters.current_value+1 returning prefix,current_value`, [name, prefix]);
  return `${r[0].prefix}${pad(r[0].current_value)}`;
};

await c.query('begin');
const [{ id: dAdmin }] = await q(`insert into users (email, full_name, password_hash, role, must_change_password) values ('demo.admin@moma.demo','Demo School Administrator',$1,'school_admin',false) on conflict do nothing returning id`, [hash]).then((r) => r.length ? r : q(`select id from users where email='demo.admin@moma.demo'`));
await q(`insert into users (email, full_name, password_hash, role, must_change_password) values ('demo.external@moma.demo','Demo External Administrator',$1,'external_admin',false) on conflict do nothing`, [hash]);

const [yr] = await q(`insert into academic_years (name,start_date,end_date,is_current) values ('2026/2027','2026-09-07','2027-07-23',true) on conflict do nothing returning id`).then((r) => r.length ? r : q(`select id from academic_years where name='2026/2027'`));
const [t1] = await q(`insert into terms (academic_year_id,name,start_date,end_date,is_current) values ($1,'Term 1','2026-09-07','2026-12-18',true) on conflict do nothing returning id`, [yr.id]).then((r) => r.length ? r : q(`select id from terms where name='Term 1' and academic_year_id=$1`, [yr.id]));
await q(`insert into terms (academic_year_id,name,start_date,end_date) values ($1,'Term 2','2027-01-11','2027-04-02'),($1,'Term 3','2027-04-26','2027-07-23') on conflict do nothing`, [yr.id]);
for (const d of ['Languages', 'Mathematics and Science', 'Computing and Technology']) await q('insert into departments (name) values ($1) on conflict do nothing', [d]);

const classes = {};
for (const n of ['JHS 1A', 'JHS 1B', 'JHS 2A']) {
  const ex = await q('select id from classes where name=$1 and academic_year_id=$2', [n, yr.id]);
  classes[n] = ex[0]?.id ?? (await q('insert into classes (class_code,name,level,academic_year_id) values ($1,$2,$3,$4) returning id', [await ctr('class', 'CLS-'), n, n.slice(0, 5), yr.id]))[0].id;
}
const subjects = {};
for (const n of ['Mathematics', 'English Language', 'Integrated Science', 'Computing']) {
  const ex = await q('select id from subjects where lower(name)=lower($1)', [n]);
  subjects[n] = ex[0]?.id ?? (await q('insert into subjects (subject_code,name) values ($1,$2) returning id', [await ctr('subject', 'SUB-'), n]))[0].id;
}
const teachers = [['Ama', 'Mensah', 'ama.mensah@moma.demo'], ['Kwame', 'Asante', 'kwame.asante@moma.demo'], ['Esi', 'Owusu', 'esi.owusu@moma.demo']];
const tid = [];
for (const [f, l, e] of teachers) {
  const ex = await q('select t.id from teacher_profiles t join users u on u.id=t.user_id where u.email=$1', [e]);
  if (ex[0]) { tid.push(ex[0].id); continue; }
  const [u] = await q(`insert into users (email,full_name,password_hash,role,must_change_password) values ($1,$2,$3,'teacher',false) returning id`, [e, `${f} ${l}`, hash]);
  tid.push((await q('insert into teacher_profiles (user_id,teacher_no,first_name,last_name) values ($1,$2,$3,$4) returning id', [u.id, await ctr('teacher', 'T-'), f, l]))[0].id);
}
const plan = [[0, 'JHS 1A', 'Mathematics'], [0, 'JHS 1B', 'Mathematics'], [1, 'JHS 1A', 'English Language'], [1, 'JHS 2A', 'English Language'], [2, 'JHS 1A', 'Integrated Science'], [2, 'JHS 1B', 'Computing'], [2, 'JHS 2A', 'Computing']];
for (const [ti, cn, sn] of plan) await q(`insert into teacher_class_subject_assignments (teacher_id,class_id,subject_id,academic_year_id,term_id) values ($1,$2,$3,$4,$5) on conflict do nothing`, [tid[ti], classes[cn], subjects[sn], yr.id, t1.id]);

const first = ['Kofi', 'Akosua', 'Yaw', 'Abena', 'Kwesi', 'Adwoa', 'Nana', 'Efua', 'Kojo', 'Maame', 'Fiifi', 'Ama'];
const last = ['Boateng', 'Addo', 'Quaye', 'Tetteh', 'Armah', 'Ofori', 'Lamptey', 'Ankrah', 'Darko', 'Acheampong', 'Sarpong', 'Nkrumah'];
let k = 0;
for (const [cn, cid] of Object.entries(classes)) {
  const have = (await q('select count(*)::int n from student_class_history where class_id=$1 and effective_to is null', [cid]))[0].n;
  if (have) continue;
  for (let i = 0; i < 12; i++, k++) {
    const [s] = await q('insert into student_profiles (student_no,first_name,last_name,gender) values ($1,$2,$3,$4) returning id', [await ctr('student:2026', 'S-2026-'), first[(i + k) % 12], last[(i * 5 + k) % 12], i % 2 ? 'female' : 'male']);
    await q('insert into student_class_history (student_id,class_id,effective_from) values ($1,$2,$3)', [s.id, cid, '2026-09-07']);
  }
}

// demonstration assignments with realistic register activity
const have = (await q('select count(*)::int n from assignments'))[0].n;
if (!have) {
  const adminUser = dAdmin.id ?? dAdmin;
  const mk = async (ti, cn, sn, title, type, daysAgoAssigned, dueDaysFromNow, submitRatio) => {
    const assigned = new Date(Date.now() - daysAgoAssigned * 864e5);
    const due = new Date(Date.now() + dueDaysFromNow * 864e5);
    const tu = (await q('select user_id from teacher_profiles where id=$1', [tid[ti]]))[0].user_id;
    const students = await q('select student_id from student_class_history where class_id=$1 and effective_to is null', [classes[cn]]);
    const [a] = await q(`insert into assignments (title,type,class_id,subject_id,teacher_id,term_id,assigned_at,original_due_at,current_due_at,expected_count,created_by)
                          values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) returning id`, [title, type, classes[cn], subjects[sn], tid[ti], t1.id, assigned, due, students.length, tu]);
    let n = 0;
    for (const s of students) {
      await q('insert into assignment_expected_students (assignment_id,student_id) values ($1,$2)', [a.id, s.student_id]);
      const submits = n < Math.round(students.length * submitRatio);
      const when = new Date(Math.min(due.getTime() - 3600e3, Date.now() - 600e3));
      const late = submits && n % 5 === 4 && due < new Date();
      const at = late ? new Date(due.getTime() + 86400e3 / 2) : when;
      await q('insert into submission_records (assignment_id,student_id,status,submitted_at,entered_by) values ($1,$2,$3,$4,$5)',
        [a.id, s.student_id, submits ? (at <= due ? 'on_time' : 'late') : (due < new Date() && n % 3 === 0 ? 'not_submitted' : 'pending'), submits ? at : null, tu]);
      n++;
    }
  };
  await mk(0, 'JHS 1A', 'Mathematics', 'Algebra Exercise 1', 'class_exercise', 20, -12, 0.9);
  await mk(0, 'JHS 1A', 'Mathematics', 'Fractions Homework', 'homework', 8, -2, 0.7);
  await mk(0, 'JHS 1B', 'Mathematics', 'Ratios Homework', 'homework', 3, 2, 0.5);
  await mk(1, 'JHS 1A', 'English Language', 'Comprehension Passage 3', 'class_exercise', 6, -1, 0.8);
  await mk(1, 'JHS 2A', 'English Language', 'Letter Writing Homework', 'homework', 2, 1, 0.3);
  await mk(2, 'JHS 1A', 'Integrated Science', 'States of Matter Exercise', 'class_exercise', 10, -5, 1);
  await mk(2, 'JHS 1B', 'Computing', 'Input and Output Devices', 'homework', 1, 4, 0.1);
}
await c.query('commit');
await c.end();
console.log('Demonstration data loaded.');
console.log('Logins (password for all: ' + DEMO_PASSWORD + '):');
console.log('  demo.admin@moma.demo, demo.external@moma.demo, ama.mensah@moma.demo, kwame.asante@moma.demo, esi.owusu@moma.demo');

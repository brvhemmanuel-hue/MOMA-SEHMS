import 'server-only';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { query, one, tx, type Db } from './db';
import { ENTITIES, FORBIDDEN_COLUMN, REFERENCE_COLUMN, normaliseHeader, type EntityKey } from './import-defs';
import { clean, isEmailOrUsername, normalisePhone, normStatus, normGender } from './validators';
import { createTeacherAccount, createExternalAdminAccount, enrollStudent } from './accounts';
import { nextRef } from './ids';
import { audit } from './audit';
import { detectSection } from './levels';
import { getSettings } from './settings';

export type ParsedFile = { headers: string[]; rows: { rowNumber: number; cells: Record<string, string> }[]; ignoredColumns: string[] };

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result); // formulas are read as values only
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('').trim();
    if ('text' in v) return cellText(v.text);
    return '';
  }
  return String(v).trim();
}

export async function parseUpload(buf: Buffer, fileName: string, entity: EntityKey): Promise<ParsedFile> {
  const def = ENTITIES[entity];
  const wb = new ExcelJS.Workbook();
  const candidates: ExcelJS.Worksheet[] = [];
  if (/\.csv$/i.test(fileName)) {
    candidates.push(await wb.csv.read(Readable.from(buf)));
  } else if (/\.xlsx$/i.test(fileName)) {
    await wb.xlsx.load(buf as any);
    const visible = wb.worksheets.filter((w) => w.state === 'visible'); // hidden sheets are never read
    const named = visible.find((w) => w.name.trim().toLowerCase() === def.sheet.toLowerCase());
    candidates.push(...(named ? [named] : []), ...visible.filter((w) => w !== named));
    if (!candidates.length) throw new Error('The workbook has no visible sheet.');
  } else {
    throw new Error('Only .xlsx and .csv files are accepted.');
  }

  const need = def.needHeaders ?? def.required;
  const allowed = new Set([...def.headers, ...(def.optional ?? []), REFERENCE_COLUMN]);
  let lastProblem = 'The file is empty.';

  for (const ws of candidates) {
    // header row = first non-empty row
    let headerRowNo = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => { if (!headerRowNo && row.values && (row.values as any[]).some((v) => cellText(v))) headerRowNo = n; });
    if (!headerRowNo) continue;
    const hdrRow = ws.getRow(headerRowNo);
    const headers: string[] = [];
    const colCount = Math.max(hdrRow.cellCount, hdrRow.actualCellCount);
    for (let c = 1; c <= colCount; c++) headers.push(normaliseHeader(cellText(hdrRow.getCell(c).value)));
    const missing = need.filter((h) => !headers.includes(h));
    const unknown = headers.filter((h) => h && !allowed.has(h) && !FORBIDDEN_COLUMN.test(h));
    if (missing.length || unknown.length) {
      lastProblem = `Headings do not match the template on sheet "${ws.name}". ${missing.length ? 'Missing: ' + missing.join(', ') + '. ' : ''}${unknown.length ? 'Unexpected: ' + unknown.join(', ') + '. ' : ''}Download the template and keep its headings.`;
      continue;
    }
    const ignoredColumns = headers.filter((h) => h && FORBIDDEN_COLUMN.test(h));
    const rows: ParsedFile['rows'] = [];
    for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: Record<string, string> = {};
      let any = false;
      headers.forEach((h, i) => {
        if (!h || FORBIDDEN_COLUMN.test(h)) return; // ID / password columns are dropped here and never stored
        const t = cellText(row.getCell(i + 1).value);
        cells[h] = t;
        if (t) any = true;
      });
      if (any) rows.push({ rowNumber: r, cells });
    }
    return { headers, rows, ignoredColumns };
  }
  throw new Error(lastProblem);
}

export type RowResult = {
  rowNumber: number;
  outcome: 'ready' | 'error' | 'warning';
  action: 'create' | 'update' | 'skip' | null;
  payload: Record<string, any> | null;
  raw: Record<string, string>;
  targetId?: string | null;
  messages: string[];
};

const key = (s: string) => clean(s).toLowerCase();

async function loadLookups() {
  const [years, terms, classes, subjects, depts, users, students] = await Promise.all([
    query<any>('select id, name, start_date, is_current from academic_years'),
    query<any>('select id, academic_year_id, name from terms'),
    query<any>('select id, name, academic_year_id from classes where status = $1', ['active']),
    query<any>('select id, name from subjects'),
    query<any>('select id, name from departments'),
    query<any>('select u.id, u.email, u.role, u.status, t.id as teacher_id from users u left join teacher_profiles t on t.user_id = u.id'),
    query<any>(`select s.id, s.student_no, lower(s.first_name) f, lower(s.last_name) l, h.class_id from student_profiles s
                 left join student_class_history h on h.student_id = s.id and h.effective_to is null`),
  ]);
  return {
    currentYear: years.find((y: any) => y.is_current) ?? null,
    yearById: new Map<string, any>(years.map((y: any) => [y.id, y])),
    classById: new Map<string, any>(classes.map((c: any) => [c.id, c])),
    year: new Map<string, any>(years.map((y: any) => [key(y.name), y])),
    termKey: new Map<string, any>(terms.map((t: any) => [`${t.academic_year_id}|${key(t.name)}`, t])),
    classKey: new Map<string, any>(classes.map((c: any) => [`${key(c.name)}|${c.academic_year_id}`, c])),
    subject: new Map<string, any>(subjects.map((s: any) => [key(s.name), s])),
    dept: new Map<string, any>(depts.map((d: any) => [key(d.name), d])),
    user: new Map<string, any>(users.map((u: any) => [key(u.email), u])),
    studentByRef: new Map<string, any>(students.map((s: any) => [s.student_no, s])),
    studentDup: new Map<string, any>(students.map((s: any) => [`${s.f}|${s.l}|${s.class_id}`, s])),
  };
}

export async function validateRows(entity: EntityKey, parsed: ParsedFile, mode: 'create_only' | 'create_and_update', opts: { defaultClassId?: string; allowedClassIds?: string[] } = {}): Promise<RowResult[]> {
  const def = ENTITIES[entity];
  const L = await loadLookups();
  const seen = new Map<string, number>();
  const out: RowResult[] = [];

  // reference-column lookups for exact matching on re-import
  const refCol = parsed.headers.includes(REFERENCE_COLUMN);
  const teacherRefs = refCol && entity === 'teachers' ? new Map((await query<any>('select teacher_no, user_id from teacher_profiles')).map((t: any) => [t.teacher_no, t.user_id])) : null;
  const classRefs = refCol && entity === 'classes' ? new Map((await query<any>('select class_code, id from classes')).map((c: any) => [c.class_code, c.id])) : null;
  const subjectRefs = refCol && entity === 'subjects' ? new Map((await query<any>('select subject_code, id from subjects')).map((c: any) => [c.subject_code, c.id])) : null;

  for (const row of parsed.rows) {
    const c = row.cells;
    const res: RowResult = { rowNumber: row.rowNumber, outcome: 'ready', action: 'create', payload: null, raw: c, messages: [] };
    const err = (m: string) => { res.messages.push(m); res.outcome = 'error'; res.action = null; };
    const warn = (m: string) => { res.messages.push(m); if (res.outcome === 'ready') res.outcome = 'warning'; };
    const isErr = () => res.outcome === 'error';

    for (const r of def.required) if (!clean(c[r])) err(`${r} is required.`);
    if (isErr()) { out.push(res); continue; }

    const ref = clean(c[REFERENCE_COLUMN]);

    if (entity === 'classes') {
      const year = L.year.get(key(c.academic_year));
      if (!year) err(`Academic year "${c.academic_year}" does not exist. Create it first.`);
      const status = normStatus(c.class_status, ['active', 'inactive'], 'active');
      if (!status) err('class_status must be active or inactive.');
      if (!isErr()) {
        const dept = c.department_or_programme ? L.dept.get(key(c.department_or_programme)) : null;
        const existing = L.classKey.get(`${key(c.class_name)}|${year.id}`) ?? (classRefs && ref ? { id: classRefs.get(ref) } : null);
        const section = detectSection(clean(c.class_name), clean(c.level_or_year));
        if (!section) warn('The level could not be worked out. Use a name like "BASIC 4 A" or put Upper Primary or JHS in level_or_year. Teachers will not see this class when they sign up until it is fixed.');
        res.payload = { name: clean(c.class_name), level: clean(c.level_or_year) || null, section, programme: clean(c.department_or_programme) || null, department_id: dept?.id ?? null, academic_year_id: year.id, status };
        if (existing?.id) { res.targetId = existing.id; res.action = mode === 'create_and_update' ? 'update' : 'skip'; if (res.action === 'skip') warn('Class already exists in this academic year. Skipped (create only).'); }
        const k = `${key(c.class_name)}|${year.id}`;
        if (seen.has(k)) err(`Duplicate of row ${seen.get(k)} in this file.`); else seen.set(k, row.rowNumber);
      }
    }

    else if (entity === 'subjects') {
      const status = normStatus(c.subject_status, ['active', 'inactive'], 'active');
      if (!status) err('subject_status must be active or inactive.');
      let dept: any = null;
      if (c.department) { dept = L.dept.get(key(c.department)); if (!dept) err(`Department "${c.department}" does not exist.`); }
      if (!isErr()) {
        const existing = L.subject.get(key(c.subject_name)) ?? (subjectRefs && ref ? { id: subjectRefs.get(ref) } : null);
        res.payload = { name: clean(c.subject_name), department_id: dept?.id ?? null, status };
        if (existing?.id) { res.targetId = existing.id; res.action = mode === 'create_and_update' ? 'update' : 'skip'; if (res.action === 'skip') warn('Subject already exists. Skipped (create only).'); }
        const k = key(c.subject_name);
        if (seen.has(k)) err(`Duplicate of row ${seen.get(k)} in this file.`); else seen.set(k, row.rowNumber);
      }
    }

    else if (entity === 'teachers' || entity === 'external_admin') {
      const email = clean(c.email_or_username);
      if (!isEmailOrUsername(email)) err('email_or_username is not a valid email address or username.');
      const phone = normalisePhone(c.phone);
      if (phone === null) err('phone number is not plausible.');
      const status = normStatus(c.account_status, ['active', 'inactive'], 'active');
      if (!status) err('account_status must be active or inactive.');
      let dept: any = null;
      if (entity === 'teachers' && c.department) { dept = L.dept.get(key(c.department)); if (!dept) err(`Department "${c.department}" does not exist.`); }
      if (!isErr()) {
        const existing = L.user.get(key(email)) ?? (teacherRefs && ref && teacherRefs.get(ref) ? { id: teacherRefs.get(ref), role: 'teacher' } : null);
        const wantRole = entity === 'teachers' ? 'teacher' : 'external_admin';
        if (existing && existing.role !== wantRole) err('This email/username already belongs to an account with a different role.');
        else {
          res.payload = entity === 'teachers'
            ? { email, first_name: clean(c.first_name), last_name: clean(c.last_name), phone: phone || null, department_id: dept?.id ?? null, status }
            : { email, full_name: clean(c.full_name), phone: phone || null, status };
          if (existing) { res.targetId = existing.id; res.action = mode === 'create_and_update' ? 'update' : 'skip'; if (res.action === 'skip') warn('Account already exists. Skipped (create only).'); }
        }
        const k = key(email);
        if (seen.has(k)) err(`Duplicate of row ${seen.get(k)} in this file.`); else seen.set(k, row.rowNumber);
      }
    }

    else if (entity === 'students') {
      const className = clean(c.class_name);
      let year: any = c.academic_year ? L.year.get(key(c.academic_year)) : L.currentYear;
      if (!year) err(c.academic_year ? `Academic year "${c.academic_year}" does not exist.` : 'No current academic year is set. Set it under Years, terms, departments.');
      let cls: any = null;
      if (className) {
        cls = year ? L.classKey.get(`${key(className)}|${year.id}`) : null;
        if (year && !cls) err(`Class "${className}" does not exist in ${year.name}. Create or import the class first, then check the spelling.`);
      } else if (opts.defaultClassId && L.classById.get(opts.defaultClassId)) {
        cls = L.classById.get(opts.defaultClassId);
        year = L.yearById.get(cls.academic_year_id) ?? year;
      } else err('The class is blank. Fill the CLASS column, or choose a class for rows without one when you upload.');
      if (cls && opts.allowedClassIds && !opts.allowedClassIds.includes(cls.id)) { cls = null; err(`You do not handle "${className || 'that class'}". Add it under My classes and subjects first.`); }
      const gender = normGender(c.gender);
      if (gender === null) err('GENDER must be M or F (or blank).');
      const status = normStatus(c.student_status, ['active', 'inactive'], 'active');
      if (!status) err('student_status must be active or inactive.');
      if (!isErr()) {
        res.payload = {
          first_name: clean(c.first_name), last_name: clean(c.last_name), other_names: clean(c.other_names) || null,
          gender: gender || null, class_id: cls.id, year: new Date(year.start_date).getUTCFullYear(), status,
        };
        const byRef = ref ? L.studentByRef.get(ref) : null;
        const dup = L.studentDup.get(`${key(c.first_name)}|${key(c.last_name)}|${cls.id}`);
        if (byRef) { res.targetId = byRef.id; res.action = mode === 'create_and_update' ? 'update' : 'skip'; if (res.action === 'skip') warn('Student already exists (matched by reference). Skipped.'); }
        else if (dup) { res.targetId = dup.id; res.action = 'skip'; warn(`Possible duplicate of ${dup.student_no} (same name and class). Skipped unless you choose to create a new student.`); }
        const k = `${key(c.first_name)}|${key(c.last_name)}|${cls.id}`;
        if (seen.has(k)) warn(`Same name and class as row ${seen.get(k)} in this file.`); else seen.set(k, row.rowNumber);
      }
    }

    else if (entity === 'teacher_assignments') {
      const teacher = L.user.get(key(c.teacher_email_or_username));
      if (!teacher || teacher.role !== 'teacher') err(`Teacher "${c.teacher_email_or_username}" does not exist. Import teachers first.`);
      else if (teacher.status !== 'active') err('The teacher account must be active.');
      const year = L.year.get(key(c.academic_year));
      if (!year) err(`Academic year "${c.academic_year}" does not exist.`);
      const cls = year ? L.classKey.get(`${key(c.class_name)}|${year.id}`) : null;
      if (year && !cls) err(`Class "${c.class_name}" does not exist in ${c.academic_year}.`);
      const subj = L.subject.get(key(c.subject_name));
      if (!subj) err(`Subject "${c.subject_name}" does not exist.`);
      const term = year ? L.termKey.get(`${year.id}|${key(c.term)}`) : null;
      if (year && !term) err(`Term "${c.term}" does not exist in ${c.academic_year}.`);
      const status = normStatus(c.assignment_status, ['active', 'inactive'], 'active');
      if (!status) err('assignment_status must be active or inactive.');
      if (!isErr()) {
        res.payload = { teacher_id: teacher.teacher_id, class_id: cls.id, subject_id: subj.id, academic_year_id: year.id, term_id: term.id, status };
        const k = `${teacher.teacher_id}|${cls.id}|${subj.id}|${term.id}`;
        if (seen.has(k)) err(`Duplicate of row ${seen.get(k)} in this file.`); else seen.set(k, row.rowNumber);
        if (!isErr()) {
          const ex = await one<any>('select id from teacher_class_subject_assignments where teacher_id=$1 and class_id=$2 and subject_id=$3 and term_id=$4', [teacher.teacher_id, cls.id, subj.id, term.id]);
          if (ex) { res.targetId = ex.id; res.action = mode === 'create_and_update' ? 'update' : 'skip'; if (res.action === 'skip') warn('Assignment already exists. Skipped (create only).'); }
        }
      }
    }

    if (parsed.ignoredColumns.length && res.rowNumber === parsed.rows[0].rowNumber) {
      /* column-level warning is stored on the batch summary, not per row */
    }
    out.push(res);
  }
  return out;
}

export async function createPreview(opts: { entity: EntityKey; fileName: string; mode: 'create_only' | 'create_and_update'; userId: string; parsed: ParsedFile; results: RowResult[] }) {
  const { results } = opts;
  const counts = {
    total: results.length,
    error: results.filter((r) => r.outcome === 'error').length,
    warning: results.filter((r) => r.outcome === 'warning').length,
    ready: results.filter((r) => r.outcome !== 'error' && r.action !== 'skip').length,
  };
  const batch = await one<{ id: string }>(
    `insert into import_batches (entity_type, file_name, mode, uploaded_by, total_rows, ready_rows, error_rows, warning_rows)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [opts.entity, opts.fileName, opts.mode, opts.userId, counts.total, counts.ready, counts.error, counts.warning],
  );
  const id = batch!.id;
  // bulk insert in chunks
  for (let i = 0; i < results.length; i += 200) {
    const chunk = results.slice(i, i + 200);
    const values: string[] = [];
    const params: any[] = [];
    chunk.forEach((r, j) => {
      const o = j * 6;
      values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`);
      params.push(id, r.rowNumber, r.outcome, r.action, JSON.stringify({ payload: r.payload, raw: r.raw, targetId: r.targetId ?? null }), JSON.stringify(r.messages));
    });
    await query(`insert into import_rows (batch_id, row_number, outcome, action, payload, messages) values ${values.join(',')}`, params);
  }
  await audit(opts.userId, 'import.preview', 'import_batch', id, { entity: opts.entity, file: opts.fileName, ...counts, ignoredColumns: opts.parsed.ignoredColumns });
  return { id, counts, ignoredColumns: opts.parsed.ignoredColumns };
}

type ApplyOut = { created?: boolean; updated?: boolean; ref?: string; credential?: { name: string; username: string; password: string; role: string } };

async function applyRow(db: Db, entity: EntityKey, action: 'create' | 'update', p: any, targetId: string | null, adminId: string): Promise<ApplyOut> {
  if (entity === 'classes') {
    if (action === 'update') { await db.query('update classes set level=$2, section=$3, programme=$4, department_id=$5, status=$6 where id=$1', [targetId, p.level, p.section, p.programme, p.department_id, p.status]); return { updated: true }; }
    const code = await nextRef('class');
    await db.query('insert into classes (class_code, name, level, section, programme, department_id, academic_year_id, status) values ($1,$2,$3,$4,$5,$6,$7,$8)', [code, p.name, p.level, p.section, p.programme, p.department_id, p.academic_year_id, p.status]);
    return { created: true, ref: code };
  }
  if (entity === 'subjects') {
    if (action === 'update') { await db.query('update subjects set department_id=$2, status=$3 where id=$1', [targetId, p.department_id, p.status]); return { updated: true }; }
    const code = await nextRef('subject');
    await db.query('insert into subjects (subject_code, name, department_id, status) values ($1,$2,$3,$4)', [code, p.name, p.department_id, p.status]);
    return { created: true, ref: code };
  }
  if (entity === 'teachers') {
    if (action === 'update') {
      await db.query('update users set full_name=$2, phone=$3, status=$4, updated_at=now() where id=$1', [targetId, `${p.first_name} ${p.last_name}`, p.phone, p.status]);
      await db.query('update teacher_profiles set first_name=$2, last_name=$3, phone=$4, department_id=$5 where user_id=$1', [targetId, p.first_name, p.last_name, p.phone, p.department_id]);
      if (p.status === 'inactive') await db.query('update users set session_version=session_version+1 where id=$1', [targetId]);
      return { updated: true };
    }
    const r = await createTeacherAccount(db, { email: p.email, firstName: p.first_name, lastName: p.last_name, phone: p.phone, departmentId: p.department_id, status: p.status });
    return { created: true, ref: r.teacherNo, credential: { name: `${p.first_name} ${p.last_name}`, username: p.email, password: r.tempPassword, role: 'Teacher' } };
  }
  if (entity === 'external_admin') {
    if (action === 'update') { await db.query('update users set full_name=$2, phone=$3, status=$4, updated_at=now() where id=$1', [targetId, p.full_name, p.phone, p.status]); return { updated: true }; }
    const r = await createExternalAdminAccount(db, { email: p.email, fullName: p.full_name, phone: p.phone, status: p.status });
    return { created: true, credential: { name: p.full_name, username: p.email, password: r.tempPassword, role: 'External Administrator' } };
  }
  if (entity === 'students') {
    if (action === 'update') {
      await db.query('update student_profiles set first_name=$2,last_name=$3,other_names=$4,gender=$5,status=$6,updated_at=now() where id=$1', [targetId, p.first_name, p.last_name, p.other_names, p.gender, p.status]);
      await enrollStudent(db, targetId!, p.class_id); // closes the old membership, never touches existing assignment snapshots
      return { updated: true };
    }
    const no = await nextRef('student', p.year);
    const [s] = await db.query<{ id: string }>('insert into student_profiles (student_no, first_name, last_name, other_names, gender, status) values ($1,$2,$3,$4,$5,$6) returning id', [no, p.first_name, p.last_name, p.other_names, p.gender, p.status]);
    await enrollStudent(db, s.id, p.class_id);
    return { created: true, ref: no };
  }
  // teacher_assignments
  if (action === 'update') { await db.query('update teacher_class_subject_assignments set status=$2 where id=$1', [targetId, p.status]); return { updated: true }; }
  await db.query('insert into teacher_class_subject_assignments (teacher_id,class_id,subject_id,academic_year_id,term_id,status) values ($1,$2,$3,$4,$5,$6)', [p.teacher_id, p.class_id, p.subject_id, p.academic_year_id, p.term_id, p.status]);
  return { created: true };
}

/** Commits up to `limit` not-yet-processed rows. Returns progress so the client can loop (chunked for serverless time limits). */
export async function commitChunk(batchId: string, adminId: string, commitMode: 'all_or_nothing' | 'skip_invalid', createAnyway: number[], limit: number) {
  const batch = await one<any>('select * from import_batches where id=$1 and uploaded_by=$2', [batchId, adminId]);
  if (!batch) throw new Error('Import batch not found.');
  if (batch.status === 'committed' || batch.status === 'discarded') throw new Error('This import has already been finished.');
  const entity = batch.entity_type as EntityKey;
  if (commitMode === 'all_or_nothing' && batch.error_rows > 0) throw new Error('This file has rows with errors. Fix them and upload again, or choose "Import valid rows and skip invalid rows".');
  const anyway = new Set(createAnyway);

  const pending = await query<any>(
    `select id, row_number, outcome, action, payload from import_rows
      where batch_id=$1 and outcome in ('ready','warning') order by row_number limit $2`,
    [batchId, limit],
  );
  const credentials: any[] = [];
  const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };

  await tx(async (db) => {
    await db.query('update import_batches set commit_mode=$2 where id=$1', [batchId, commitMode]);
    for (const r of pending) {
      let action = r.action as 'create' | 'update' | 'skip';
      const data = r.payload || {};
      if (entity === 'students' && action === 'skip' && anyway.has(r.row_number) && data.payload) action = 'create';
      if (action === 'skip' || !data.payload) {
        await db.query("update import_rows set outcome='skipped' where id=$1", [r.id]);
        counts.skipped++;
        continue;
      }
      if (commitMode === 'skip_invalid') await db.query('savepoint sp');
      try {
        const out = await applyRow(db, entity, action, data.payload, data.targetId ?? null, adminId);
        await db.query('update import_rows set outcome=$2, generated_ref=$3, payload=null where id=$1', [r.id, out.created ? 'created' : 'updated', out.ref ?? null]);
        if (out.created) counts.created++; else counts.updated++;
        if (out.credential) credentials.push({ ...out.credential, row: r.row_number });
        if (commitMode === 'skip_invalid') await db.query('release savepoint sp');
      } catch (e: any) {
        if (commitMode === 'all_or_nothing') throw new Error(`Row ${r.row_number} failed (${e.message}). Nothing was imported.`);
        await db.query('rollback to savepoint sp');
        await db.query("update import_rows set outcome='failed', messages = messages || $2::jsonb where id=$1", [r.id, JSON.stringify([`Could not save: ${String(e.message).slice(0, 160)}`])]);
        counts.failed++;
      }
    }
    await db.query(
      `update import_batches set created_count=created_count+$2, updated_count=updated_count+$3, skipped_count=skipped_count+$4, failed_count=failed_count+$5 where id=$1`,
      [batchId, counts.created, counts.updated, counts.skipped, counts.failed],
    );
  });

  const remaining = (await one<{ n: string }>(`select count(*) n from import_rows where batch_id=$1 and outcome in ('ready','warning')`, [batchId]))!.n;
  if (Number(remaining) === 0) {
    // error rows are counted as skipped in the final summary
    await query(`update import_batches set status='committed', committed_at=now(), skipped_count = skipped_count + error_rows where id=$1`, [batchId]);
    const b = await one<any>('select created_count,updated_count,skipped_count,failed_count from import_batches where id=$1', [batchId]);
    await audit(adminId, 'import.commit', 'import_batch', batchId, { entity, mode: commitMode, ...b });
  }
  return { counts, credentials, remaining: Number(remaining) };
}

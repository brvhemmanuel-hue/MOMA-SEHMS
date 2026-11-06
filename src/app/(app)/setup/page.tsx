import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { dateOnly, fmtDate } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { ActionForm } from '@/components/ActionForm';
import { Badge, PageHead } from '@/components/ui';
import { createTerm, createYear, saveDepartment, setCurrentTerm } from '../../actions/admin';

export const metadata = { title: 'Years, terms and departments' };

export default async function SetupPage() {
  await requireSession(['school_admin']);
  const tz = (await getSettings()).timezone;
  const [years, terms, depts] = await Promise.all([
    query<any>('select * from academic_years order by start_date desc'),
    query<any>('select t.*, y.name as year_name from terms t join academic_years y on y.id = t.academic_year_id order by t.start_date desc'),
    query<any>('select * from departments order by name'),
  ]);
  return (
    <div className="stack">
      <PageHead title="Years, terms and departments" sub="Every record links to a year and term. Departments are optional labels for grouping." />
      <div className="grid cols-2">
        <section className="card">
          <h2>Academic years</h2>
          <div className="tablewrap"><table><thead><tr><th>Year</th><th>Dates</th><th></th></tr></thead><tbody>
            {years.map((y: any) => <tr key={y.id}><td>{y.name}</td><td className="small">{fmtDate(dateOnly(y.start_date) + 'T12:00:00Z', 'UTC')} to {fmtDate(dateOnly(y.end_date) + 'T12:00:00Z', 'UTC')}</td><td>{y.is_current && <Badge tone="gold">Current</Badge>}</td></tr>)}
            {!years.length && <tr><td colSpan={3} className="muted">No academic year yet. Create one below to begin.</td></tr>}
          </tbody></table></div>
          <details className="panel" style={{ marginTop: '1rem' }} open={!years.length}><summary>Add academic year</summary><div>
            <ActionForm action={createYear} submit="Create year" className="form-grid">
              <div><label htmlFor="y-name">Name</label><input id="y-name" name="name" placeholder="2026/2027" required /></div>
              <div><label htmlFor="y-start">Starts</label><input id="y-start" type="date" name="start" required /></div>
              <div><label htmlFor="y-end">Ends</label><input id="y-end" type="date" name="end" required /></div>
              <div><label><input type="checkbox" name="current" /> Make this the current year</label></div>
            </ActionForm></div></details>
        </section>
        <section className="card">
          <h2>Terms</h2>
          <div className="tablewrap"><table><thead><tr><th>Term</th><th>Year</th><th>Dates</th><th></th></tr></thead><tbody>
            {terms.map((t: any) => <tr key={t.id}><td>{t.name}</td><td>{t.year_name}</td><td className="small">{fmtDate(dateOnly(t.start_date) + 'T12:00:00Z', 'UTC')} to {fmtDate(dateOnly(t.end_date) + 'T12:00:00Z', 'UTC')}</td>
              <td>{t.is_current ? <Badge tone="gold">Current</Badge> : <ActionForm action={setCurrentTerm} submit="Make current" submitClass="btn ghost sm" resetOnSuccess={false}><input type="hidden" name="term" value={t.id} /></ActionForm>}</td></tr>)}
            {!terms.length && <tr><td colSpan={4} className="muted">No terms yet.</td></tr>}
          </tbody></table></div>
          <details className="panel" style={{ marginTop: '1rem' }}><summary>Add term</summary><div>
            <ActionForm action={createTerm} submit="Create term" className="form-grid">
              <div><label htmlFor="t-year">Academic year</label><select id="t-year" name="year" required>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
              <div><label htmlFor="t-name">Term name</label><input id="t-name" name="name" placeholder="Term 1" required /></div>
              <div><label htmlFor="t-start">Starts</label><input id="t-start" type="date" name="start" required /></div>
              <div><label htmlFor="t-end">Ends</label><input id="t-end" type="date" name="end" required /></div>
              <div><label><input type="checkbox" name="current" /> Make this the current term</label></div>
            </ActionForm></div></details>
        </section>
      </div>
      <section className="card">
        <h2>Departments (optional)</h2>
        <p className="small muted">A department is only a label for filtering and reports. It has no head and no special permissions.</p>
        <div className="stack">
          {depts.map((d: any) => (
            <ActionForm key={d.id} action={saveDepartment} submit="Save" resetOnSuccess={false} className="form-grid" submitClass="btn ghost sm">
              <input type="hidden" name="id" value={d.id} />
              <div><label className="sr-only" htmlFor={`d-${d.id}`}>Name</label><input id={`d-${d.id}`} name="name" defaultValue={d.name} required /></div>
              <div><label className="sr-only" htmlFor={`ds-${d.id}`}>Status</label><select id={`ds-${d.id}`} name="status" defaultValue={d.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            </ActionForm>
          ))}
          <ActionForm action={saveDepartment} submit="Add department" className="form-grid">
            <div><label htmlFor="d-new">New department name</label><input id="d-new" name="name" placeholder="Languages" required /></div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}

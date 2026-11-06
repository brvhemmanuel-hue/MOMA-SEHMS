import ImportUpload from './ImportUpload';
import { ENTITIES, type EntityKey } from '@/lib/import-defs';

/** Template download (Excel or CSV) and upload for one type, shown on the Classes, Subjects and Students pages. */
export default function BulkPanel({ entity, classOptions, canExport = true }: { entity: EntityKey; classOptions?: { id: string; name: string }[]; canExport?: boolean }) {
  const d = ENTITIES[entity];
  return (
    <details className="panel">
      <summary>Add many {d.label.toLowerCase()} from Excel or CSV</summary>
      <div className="stack">
        <div>
          <p style={{ margin: '0 0 .5rem' }}>1. Download the template, fill it in, and save it. Keep the column headings exactly as they are.</p>
          <div className="row">
            <a className="btn ghost sm" href={`/api/templates?entity=${entity}&format=xlsx`}>Download Excel template</a>
            <a className="btn ghost sm" href={`/api/templates?entity=${entity}&format=csv`}>Download CSV template</a>
            {canExport && <a className="btn ghost sm" href={`/api/exports/${entity}`}>Export current list</a>}
          </div>
          <p className="small muted" style={{ margin: '.5rem 0 0' }}>{d.hint}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 .5rem' }}>2. Upload the file. You will see a preview and can fix problems before anything is saved.</p>
          <ImportUpload entities={[{ key: entity, label: d.label, hint: d.hint }]} fixed classOptions={classOptions} />
        </div>
      </div>
    </details>
  );
}

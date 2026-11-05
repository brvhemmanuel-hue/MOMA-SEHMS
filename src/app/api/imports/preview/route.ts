import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { createPreview, parseUpload, validateRows } from '@/lib/imports';
import { ENTITIES, type EntityKey } from '@/lib/import-defs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s || s.role !== 'school_admin' || s.mustChangePassword) return NextResponse.json({ error: 'Only the School Administrator can import data.' }, { status: 403 });
  const fd = await req.formData();
  const entity = String(fd.get('entity') ?? '') as EntityKey;
  const mode = fd.get('mode') === 'create_and_update' ? 'create_and_update' : 'create_only';
  const file = fd.get('file');
  if (!(entity in ENTITIES)) return NextResponse.json({ error: 'Choose what you are importing.' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  const st = await getSettings();
  if (file.size > st.import_max_mb * 1024 * 1024) return NextResponse.json({ error: `The file is larger than ${st.import_max_mb} MB.` }, { status: 413 });
  try {
    const parsed = await parseUpload(Buffer.from(await file.arrayBuffer()), file.name, entity);
    if (!parsed.rows.length) return NextResponse.json({ error: 'The file has headers but no data rows.' }, { status: 400 });
    if (parsed.rows.length > st.import_max_rows) return NextResponse.json({ error: `The file has ${parsed.rows.length} rows. The limit is ${st.import_max_rows}. Split it into smaller files.` }, { status: 413 });
    const results = await validateRows(entity, parsed, mode);
    const p = await createPreview({ entity, fileName: file.name.slice(0, 120), mode, userId: s.userId, parsed, results });
    return NextResponse.json({ id: p.id, ignored: p.ignoredColumns });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message?.slice(0, 400) || 'Could not read the file.' }, { status: 400 });
  }
}

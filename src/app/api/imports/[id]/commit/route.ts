import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { commitChunk } from '@/lib/imports';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s || s.role !== 'school_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const commitMode = body.commitMode === 'skip_invalid' ? 'skip_invalid' : 'all_or_nothing';
  const createAnyway = Array.isArray(body.createAnyway) ? body.createAnyway.filter((n: any) => Number.isInteger(n)) : [];
  // all-or-nothing must be one transaction; skip-invalid is chunked to stay inside serverless time limits
  const limit = commitMode === 'all_or_nothing' ? 1000 : 60;
  try {
    return NextResponse.json(await commitChunk(params.id, s.userId, commitMode, createAnyway, limit));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message?.slice(0, 300) || 'Import failed.' }, { status: 400 });
  }
}

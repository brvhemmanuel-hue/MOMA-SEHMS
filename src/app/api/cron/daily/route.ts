import { NextResponse, type NextRequest } from 'next/server';
import { runMaintenance } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Correctness never depends on this job (snapshots are also created lazily on read). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runMaintenance()) }); }
  catch (e) { console.error('cron failed', e); return NextResponse.json({ error: 'Maintenance failed' }, { status: 500 }); }
}

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fmtDateTime } from '@/lib/time';
import { getSettings } from '@/lib/settings';
import { Badge, Empty, PageHead } from '@/components/ui';

export const metadata = { title: 'Notifications' };

async function markAll() {
  'use server';
  const s = await requireSession();
  await query('update notifications set is_read=true where user_id=$1 and not is_read', [s.userId]);
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  const s = await requireSession();
  const tz = (await getSettings()).timezone;
  const rows = await query<any>('select * from notifications where user_id=$1 order by created_at desc limit 100', [s.userId]);
  return (
    <div className="stack">
      <PageHead title="Notifications" sub="Reminders and alerts for your classes.">{rows.some((r: any) => !r.is_read) && <form action={markAll}><button className="btn ghost">Mark all as read</button></form>}</PageHead>
      <div className="card flat">{rows.length ? rows.map((n: any) => (
        <div key={n.id} className="reg-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <div>{!n.is_read && <Badge tone="gold">New</Badge>} {n.link ? <Link href={n.link}>{n.message}</Link> : n.message}</div><span className="small muted nowrap">{fmtDateTime(n.created_at, tz)}</span></div>
      )) : <Empty>No notifications yet.</Empty>}</div>
    </div>
  );
}

import Image from 'next/image';
import { requireSession } from '@/lib/auth';
import { one } from '@/lib/db';
import NavLinks, { type NavItem } from '@/components/NavLinks';
import { logoutAction } from '../actions/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const unread = Number((await one<{ n: string }>('select count(*) n from notifications where user_id=$1 and not is_read', [s.userId]))?.n ?? 0);
  const items: NavItem[] = [{ href: '/dashboard', label: 'Dashboard' }, { href: '/work', label: s.role === 'teacher' ? 'My assignments' : 'Assignments' }];
  if (s.role === 'teacher') items.push({ href: '/work/new', label: 'New assignment' }, { href: '/find-student', label: 'Find a student' }, { href: '/my-students', label: 'My students' }, { href: '/my-classes', label: 'My classes and subjects' });
  if (s.role !== 'teacher') items.push({ href: '/reports', label: 'Reports' });
  items.push({ href: '/notifications', label: 'Notifications', badge: unread });
  if (s.role === 'school_admin') {
    items.push(
      { group: 'School setup' }, { href: '/classes', label: 'Classes' }, { href: '/subjects', label: 'Subjects' }, { href: '/teachers', label: 'Teachers' },
      { href: '/students', label: 'Students' }, { href: '/teacher-assignments', label: 'Teacher assignments' }, { href: '/setup', label: 'Years, terms, departments' },
      { group: 'Administration' }, { href: '/imports', label: 'Import Centre' }, { href: '/accounts', label: 'External Administrator' }, { href: '/audit', label: 'Audit log' }, { href: '/settings', label: 'Settings' },
    );
  }
  items.push({ group: 'Account' }, { href: '/account', label: 'Password' });
  const role = s.role === 'school_admin' ? 'School Administrator' : s.role === 'external_admin' ? 'External Administrator' : `Teacher ${s.teacherNo ?? ''}`;
  return (
    <div className="shell">
      <input type="checkbox" id="navtoggle" className="navtoggle" aria-label="Toggle menu" />
      <header className="topbar">
        <label htmlFor="navtoggle" className="burger" aria-label="Open menu"><span /><span /><span /></label>
        <strong>MOMA-SEHMS</strong>
        <span style={{ width: 44 }} aria-hidden="true" />
      </header>
      <label htmlFor="navtoggle" className="scrim" aria-hidden="true" />
      <aside className="side" aria-label="Sidebar">
        <label htmlFor="navtoggle" className="closer" aria-label="Close menu">Close</label>
        <a className="brand" href="/dashboard">
          <Image src="/emblem.png" alt="" width={46} height={46} />
          <div><b>Mount Olivet Methodist Academy</b><span>Exercise &amp; Homework Monitoring</span></div>
        </a>
        <NavLinks items={items} />
        <div className="who">
          <div><strong>{s.fullName}</strong></div>
          <div className="small" style={{ color: '#aebbe6' }}>{role}</div>
          <form action={logoutAction}><button className="btn ghost sm">Sign out</button></form>
        </div>
      </aside>
      <main className="main" id="main">{children}</main>
    </div>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; badge?: number } | { group: string };

export default function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {items.map((it, i) => {
        if ('group' in it) return <div key={i} className="group">{it.group}</div>;
        const active = path === it.href || (it.href !== '/dashboard' && path.startsWith(it.href + '/')) || (it.href === '/work' && path.startsWith('/work') && path !== '/work/new');
        return (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} onClick={() => { const t = document.getElementById('navtoggle') as HTMLInputElement | null; if (t) t.checked = false; }}>
            {it.label}{it.badge ? <span className="count" aria-label={`${it.badge} unread`}>{it.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

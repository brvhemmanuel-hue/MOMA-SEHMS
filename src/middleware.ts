import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = [/^\/login/, /^\/register/, /^\/offline/, /^\/sw\.js$/, /^\/manifest/, /^\/icons\//, /^\/logo\.jpg$/, /^\/emblem\.png$/, /^\/login-bg\.jpg$/, /^\/api\/cron\//, /^\/_next\//, /^\/favicon/, /^\/\.well-known\//, /^\/offline\.html$/];

/** Cheap gate only. Real session validation (signature, user status, session version) happens on the server for every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get('moma_session')) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

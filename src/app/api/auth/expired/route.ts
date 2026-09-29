import { NextResponse, type NextRequest } from 'next/server';

import { signOut } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Where a server render sends a browser whose session is no longer valid.
 *
 * It exists because of a Next constraint with a real consequence. A Server
 * Component — the dashboard layout — may read cookies but not write them, so
 * the layout's `signOut()` silently did nothing: it redirected to the login
 * page while leaving the access, refresh and profile cookies on the browser.
 * The session was over and the browser did not know it, which is how a stale
 * cookie survives a sign-out and how the redirect loop this replaced began.
 *
 * A Route Handler can write cookies, so the layout redirects *here*, this
 * clears them properly and revokes the session upstream, and only then does
 * the browser continue to the login page.
 */
export async function GET(request: NextRequest) {
  await signOut();

  const reason = request.nextUrl.searchParams.get('reason') ?? 'expired';
  const next = request.nextUrl.searchParams.get('next');

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  login.searchParams.set('reason', reason === 'forbidden' ? 'forbidden' : 'expired');

  // Same-site paths only — this value came in on a URL and is echoed back out
  // on one, which is the shape an open redirect takes.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    login.searchParams.set('next', next);
  }

  return NextResponse.redirect(login);
}

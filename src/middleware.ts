import { NextResponse, type NextRequest } from 'next/server';

import { PUBLIC_PAGE_PATHS } from '@/features/public-site/site';
import { COOKIE } from '@/lib/cookies';

/**
 * Route protection, at the edge.
 *
 * This is the **first** of three layers and the weakest of them, deliberately:
 *
 *   middleware (here)  cheap cookie check, and the only place that can know
 *                      which URL was asked for before the app renders
 *   dashboard layout   verifies the session against the backend (`/auth/me`)
 *   the backend        the actual authorization, on every single request
 *
 * It exists for one thing the layout cannot do: preserve where the person was
 * going. A server component has no access to the requested pathname, so
 * `redirect('/login')` from the layout always lost it — paste a link to
 * `/courses/abc`, sign in, and you land on the home screen having forgotten
 * why you came. Middleware sees the URL, so `?next=` can carry it.
 *
 * It checks only for the *presence* of a session cookie. It does not decode
 * it, does not call the backend, and makes no role decision. A forged cookie
 * gets past this and straight into the layout, which asks the API who they
 * are and throws them out. Anything stronger here would be duplicated
 * authorization logic in a place that cannot do it correctly.
 */

/**
 * Paths that must stay reachable with no session at all: the login page, and
 * the store-facing legal/support pages under src/app/(public), which reviewers
 * and students open without any account on this dashboard.
 */
const PUBLIC_PATHS = new Set(['/login', ...PUBLIC_PAGE_PATHS]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Either cookie is enough to be worth letting through: an expired access
  // token with a live refresh token is an ordinary, recoverable state, and the
  // proxy rotates it on the next call. Requiring both here would sign people
  // out every twelve hours for no reason.
  const hasSession =
    Boolean(request.cookies.get(COOKIE.access)?.value) ||
    Boolean(request.cookies.get(COOKIE.refresh)?.value);

  if (hasSession) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';

  // Same-site paths only. `next` is echoed into a redirect on the login page,
  // so anything absolute would turn this domain into an open redirect — a
  // phishing link that genuinely originates from the dashboard's own host.
  // The login page re-validates this; both ends check, because only one of
  // them checking is how these come back.
  const target = `${pathname}${search}`;
  if (target !== '/' && target.startsWith('/') && !target.startsWith('//')) {
    login.searchParams.set('next', target);
  }

  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Everything except Next's own assets and this application's API routes.
   *
   * The API routes are excluded on purpose. `/api/proxy/*` must answer an
   * expired session with a JSON 401 that the client can act on — redirecting a
   * `fetch` to an HTML login page produces a parse error and a panel that says
   * "something went wrong" instead of "please sign in". `/api/auth/*` has to
   * stay reachable precisely when there is no session.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

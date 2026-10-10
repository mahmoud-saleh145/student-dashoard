import 'server-only';

import { cookies } from 'next/headers';

import { backendRequest } from '@/lib/backend';
import { COOKIE, serverConfig } from '@/lib/config';
import { ApiError } from '@/lib/errors';
import type { DashboardRole, SessionUser } from '@/types/domain';
import { DASHBOARD_ROLES } from '@/types/domain';

/**
 * Session handling.
 *
 * Design, and why:
 *
 *  - **Tokens live in HTTP-only cookies.** The backend issues bearer tokens
 *    (it is a mobile-first API and that is not going to change), so the
 *    dashboard wraps them: the browser holds an opaque cookie, this server
 *    holds the token. A cross-site script on the dashboard cannot read a
 *    cookie it cannot see.
 *
 *  - **Students are refused at the door.** The backend already refuses every
 *    admin route to a student, so this is not the security boundary — it is
 *    the difference between a clear "this dashboard is not for you" and a
 *    dashboard that loads and then 403s on every panel.
 *
 *  - **Refresh is single-use and rotating** on the backend. Two concurrent
 *    requests refreshing at once would revoke the whole token family, so
 *    refresh is serialised through one in-flight promise per process.
 */

interface LoginResponse {
  user: {
    id: string;
    fullName: string;
    phone: string;
    role: string;
    status: string;
    avatarUrl?: string | null;
    email?: string | null;
    locale?: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

const ACCESS_MAX_AGE = 60 * 60 * 12;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: serverConfig.secureCookies,
    // Lax rather than Strict: Strict drops the cookie on a top-level
    // navigation back into the app (following a link from an email, for
    // instance), which reads to the user as a random logout. Lax still blocks
    // the cross-site POST that CSRF depends on, and the proxy adds an origin
    // check on top.
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function isDashboardRole(role: string): role is DashboardRole {
  return (DASHBOARD_ROLES as readonly string[]).includes(role);
}

/**
 * Exchanges credentials for a session.
 *
 * A student's credentials are valid — they just do not belong here — so the
 * refusal is explicit rather than a generic failure, and no cookie is written.
 */
export async function signIn(params: {
  phone: string;
  password: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
}): Promise<SessionUser> {
  const { data } = await backendRequest<LoginResponse>({
    method: 'POST',
    path: '/auth/login',
    body: { phone: params.phone, password: params.password },
    forwardedFor: params.forwardedFor,
    userAgent: params.userAgent,
  });

  if (!isDashboardRole(data.user.role)) {
    throw new ApiError({
      code: 'INSUFFICIENT_ROLE',
      message: 'This dashboard is for staff accounts only.',
      status: 403,
      userFacing: true,
    });
  }

  if (data.user.status !== 'ACTIVE') {
    throw new ApiError({
      code: 'ACCOUNT_DISABLED',
      message: 'This account is not active.',
      status: 403,
      userFacing: true,
    });
  }

  const user: SessionUser = {
    id: data.user.id,
    fullName: data.user.fullName,
    phone: data.user.phone,
    role: data.user.role,
    avatarUrl: data.user.avatarUrl ?? null,
    email: data.user.email ?? null,
    locale: data.user.locale === 'ar' ? 'ar' : 'en',
  };

  const jar = await cookies();
  jar.set(COOKIE.access, data.accessToken, cookieOptions(ACCESS_MAX_AGE));
  jar.set(COOKIE.refresh, data.refreshToken, cookieOptions(REFRESH_MAX_AGE));
  jar.set(COOKIE.profile, encodeProfile(user), cookieOptions(REFRESH_MAX_AGE));

  return user;
}

/**
 * Cookie writes that may be happening during a render.
 *
 * Next allows `cookies().set()` only in a Route Handler or a Server Action. A
 * Server Component — which is what the dashboard layout is — throws
 * "Cookies can only be modified in a Server Action or Route Handler", and that
 * throw took the whole page down.
 *
 * It surfaced exactly where it hurts: an administrator whose access cookie had
 * lapsed (12 hours) still held a valid refresh token, so the layout tried to
 * rotate it mid-render and crashed instead of quietly signing them back in.
 *
 * The write is genuinely optional in that context. The value is still returned
 * to the caller and used for this render; the proxy — a Route Handler, where
 * writing is allowed — persists the rotation on the very next data request.
 * So the correct behaviour is to attempt the write and carry on without it.
 */
type CookieJar = Awaited<ReturnType<typeof cookies>>;

function trySetCookie(
  jar: CookieJar,
  name: string,
  value: string,
  options: ReturnType<typeof cookieOptions>,
): void {
  try {
    jar.set(name, value, options);
  } catch {
    // Read-only store (a Server Component render). Not fatal — see above.
  }
}

function tryDeleteCookie(jar: CookieJar, name: string): void {
  try {
    jar.delete(name);
  } catch {
    // Same. The proxy or the sign-out route will clear it on the next request.
  }
}

/** Revokes the session server-side, then clears the cookies either way. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const accessToken = jar.get(COOKIE.access)?.value;

  if (accessToken) {
    // A failure here (an already-expired token, the API being down) must not
    // stop the browser being signed out; the cookies are cleared regardless.
    await backendRequest({ method: 'POST', path: '/auth/logout', accessToken }).catch(
      () => undefined,
    );
  }

  tryDeleteCookie(jar, COOKIE.access);
  tryDeleteCookie(jar, COOKIE.refresh);
  tryDeleteCookie(jar, COOKIE.profile);
}

/** The signed-in user, or null. Reads the cookie; does not call the backend. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE.profile)?.value;
  const hasToken = Boolean(jar.get(COOKIE.access)?.value ?? jar.get(COOKIE.refresh)?.value);

  if (!raw || !hasToken) return null;
  return decodeProfile(raw);
}

/** Confirms the session against the backend. Used on the dashboard shell. */
export async function requireSessionUser(): Promise<SessionUser | null> {
  const cached = await getSessionUser();
  if (!cached) return null;

  try {
    // Deliberately the cookie as it stands, not `getAccessToken()`.
    //
    // `getAccessToken` rotates when the access cookie has lapsed, and a
    // rotation this layout cannot persist is a rotation that burns a
    // single-use refresh token for nothing — the backend would issue a new
    // family, the write would be dropped, and the browser would still be
    // holding the token that had just been spent. The next request would then
    // present a revoked token and the session would die for real.
    //
    // So: verify with the token we have, and if there is none, trust the
    // cached profile for this render. The shell appears, and the first data
    // request goes through the proxy — a Route Handler, which *can* write —
    // where the rotation happens properly and is kept.
    const readJar = await cookies();
    const token = readJar.get(COOKIE.access)?.value;
    if (!token) return cached;

    const { data } = await backendRequest<LoginResponse['user']>({
      path: '/auth/me',
      accessToken: token,
    });

    // A role or status that no longer belongs here. Not recoverable by any
    // token, so the caller redirects to the route handler that can actually
    // clear the cookies (this function may be running inside a render).
    if (!isDashboardRole(data.role) || data.status !== 'ACTIVE') {
      return null;
    }

    const user: SessionUser = {
      id: data.id,
      fullName: data.fullName,
      phone: data.phone,
      role: data.role,
      avatarUrl: data.avatarUrl ?? null,
      email: data.email ?? null,
      locale: data.locale === 'ar' ? 'ar' : 'en',
    };

    const jar = await cookies();
    trySetCookie(jar, COOKIE.profile, encodeProfile(user), cookieOptions(REFRESH_MAX_AGE));
    return user;
  } catch (error) {
    // A disabled account cannot be rescued by a new token, so it ends here.
    if (error instanceof ApiError && error.code === 'ACCOUNT_DISABLED') {
      return null;
    }

    // Everything else — including a 401 from an access token that simply
    // lapsed — renders the shell from the cached identity.
    //
    // This deliberately does NOT rotate. A Server Component cannot persist a
    // cookie, so rotating here would spend the single-use refresh token and
    // then fail to save its replacement, leaving the browser holding a token
    // the backend had already retired: a guaranteed logout one request later.
    // The proxy is a Route Handler, it sees the same 401, and it can keep what
    // it gets — so rotation belongs there and only there.
    //
    // If the session really is dead, every data panel on the page will say so
    // within a moment and the client tears the session down properly.
    return cached;
  }
}

/**
 * A usable access token, refreshing once if the current one has expired.
 *
 * Serialised per process: the backend's refresh tokens are single-use and
 * rotating, so two parallel refreshes would present the same token twice and
 * be read as theft, revoking the whole family.
 */
//
// Keyed by the refresh token, NOT a single module-level promise.
//
// A single shared promise is a cross-account session leak, not merely a
// tidiness problem. This module is evaluated once per server process and that
// process serves every administrator at once. With one global promise, an
// administrator whose access cookie had expired would find a refresh already
// "in flight" — someone else's — await it, and receive **that person's** newly
// minted access token. The proxy would then forward it to the backend, which
// would authorise the request perfectly correctly as the wrong user.
//
// Keying by the presented refresh token preserves the property that actually
// matters — two concurrent requests from one browser share one rotation, so a
// single-use token is never presented twice and the family is never revoked as
// theft — while making it impossible for two different sessions to share one.
const refreshInFlight = new Map<string, Promise<RefreshAttempt>>();

function rotate(refreshToken: string): Promise<RefreshAttempt> {
  const existing = refreshInFlight.get(refreshToken);
  if (existing) return existing;

  const pending = refreshSession(refreshToken).finally(() => {
    refreshInFlight.delete(refreshToken);
  });

  refreshInFlight.set(refreshToken, pending);
  return pending;
}

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(COOKIE.access)?.value;
  if (access) return access;

  const refresh = jar.get(COOKIE.refresh)?.value;
  if (!refresh) return null;

  return (await rotate(refresh)).token;
}

/** Forces a rotation — called by the proxy when the backend answers 401. */
export async function refreshAccessToken(): Promise<string | null> {
  return (await attemptRefresh()).token;
}

/**
 * A refresh attempt, and whether it failed in a way that ends the session.
 *
 * The distinction matters because it decides what the browser is told. Answering
 * `401 SESSION_EXPIRED` triggers `endSession()` on the client, which clears the
 * cookies and navigates to the login screen. A timeout or a 502 has not earned
 * that: the session is still valid, so it is reported as a transient failure and
 * the administrator stays where they are.
 */
export type RefreshAttempt = {
  token: string | null;
  /** True only when the token itself is unusable and login is genuinely required. */
  sessionEnded: boolean;
};

export async function attemptRefresh(): Promise<RefreshAttempt> {
  const jar = await cookies();
  const refresh = jar.get(COOKIE.refresh)?.value;
  // No refresh cookie at all is a session that is genuinely over.
  if (!refresh) return { token: null, sessionEnded: true };

  return rotate(refresh);
}

async function refreshSession(refreshToken: string): Promise<RefreshAttempt> {
  try {
    const { data } = await backendRequest<{
      accessToken: string;
      refreshToken: string;
    }>({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
    });

    const jar = await cookies();
    trySetCookie(jar, COOKIE.access, data.accessToken, cookieOptions(ACCESS_MAX_AGE));
    trySetCookie(jar, COOKIE.refresh, data.refreshToken, cookieOptions(REFRESH_MAX_AGE));

    return { token: data.accessToken, sessionEnded: false };
  } catch (error) {
    // Only a definitive rejection may end the session.
    //
    // This used to be a bare `catch` that deleted the cookies on any failure at
    // all. The backend refuses nothing about a network blip, a 502 from an
    // intermediary, a timeout, or a 429 — `backendRequest` reports all of those
    // as ordinary errors — so a single unreachable moment while an administrator
    // was working deleted a refresh token that was still perfectly valid and
    // produced the "Session Expired" screen. That is the reported symptom, and
    // it was self-inflicted: the backend had never rejected anything.
    //
    // A refresh that fails for a reason unrelated to the token leaves the
    // session intact. The next request tries again; the caller surfaces a
    // transient error instead of a logout.
    if (isDefinitiveRefreshRejection(error)) {
      const jar = await cookies();
      tryDeleteCookie(jar, COOKIE.access);
      tryDeleteCookie(jar, COOKIE.refresh);
      tryDeleteCookie(jar, COOKIE.profile);
      return { token: null, sessionEnded: true };
    }

    return { token: null, sessionEnded: false };
  }
}

/**
 * Whether a failed refresh is the backend saying "this token is no longer
 * usable", as opposed to something going wrong on the way there.
 *
 * Mirrors `isDefinitiveRefreshRejection` in the student app. Both applications
 * make the same distinction because both were getting it wrong in opposite
 * directions: this one logged people out on timeouts, that one logged them out
 * on rate limits.
 */
function isDefinitiveRefreshRejection(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403].includes(error.status);
}

// ---------------------------------------------------------------------------
// Profile cookie
// ---------------------------------------------------------------------------
//
// Base64url of a small JSON object. Not signed, and it does not need to be:
// it is HTTP-only, it carries nothing secret, and it grants nothing. Every
// authorization decision is made by the backend from the bearer token, so a
// forged profile cookie changes the name in the corner and nothing else.

function encodeProfile(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
}

function decodeProfile(raw: string): SessionUser | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as SessionUser;
    if (!parsed?.id || !isDashboardRole(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

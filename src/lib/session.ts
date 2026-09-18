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

  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
  jar.delete(COOKIE.profile);
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
    const token = await getAccessToken();
    if (!token) return null;

    const { data } = await backendRequest<LoginResponse['user']>({
      path: '/auth/me',
      accessToken: token,
    });

    if (!isDashboardRole(data.role) || data.status !== 'ACTIVE') {
      await signOut();
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
    jar.set(COOKIE.profile, encodeProfile(user), cookieOptions(REFRESH_MAX_AGE));
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.endsSession) {
      await signOut();
      return null;
    }
    // The API being briefly unreachable is not a reason to sign someone out;
    // the cached identity is enough to render the shell, and every data panel
    // will surface the real error on its own.
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
let refreshInFlight: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(COOKIE.access)?.value;
  if (access) return access;

  const refresh = jar.get(COOKIE.refresh)?.value;
  if (!refresh) return null;

  refreshInFlight ??= refreshSession(refresh).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** Forces a rotation — called by the proxy when the backend answers 401. */
export async function refreshAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const refresh = jar.get(COOKIE.refresh)?.value;
  if (!refresh) return null;

  refreshInFlight ??= refreshSession(refresh).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function refreshSession(refreshToken: string): Promise<string | null> {
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
    jar.set(COOKIE.access, data.accessToken, cookieOptions(ACCESS_MAX_AGE));
    jar.set(COOKIE.refresh, data.refreshToken, cookieOptions(REFRESH_MAX_AGE));

    return data.accessToken;
  } catch {
    const jar = await cookies();
    jar.delete(COOKIE.access);
    jar.delete(COOKIE.refresh);
    jar.delete(COOKIE.profile);
    return null;
  }
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

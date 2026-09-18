import { NextResponse, type NextRequest } from 'next/server';

import { backendRequest } from '@/lib/backend';
import { serverConfig } from '@/lib/config';
import { ApiError } from '@/lib/errors';
import { getAccessToken, refreshAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The single door between the browser and the API.
 *
 * Why a proxy rather than calling the backend from the browser:
 *
 *  - the access token stays in an HTTP-only cookie and is attached here, so
 *    no script running in the page can read it;
 *  - the backend's address is not published to the browser;
 *  - one place refreshes an expired token and retries, instead of every
 *    feature hook growing its own 401 handling.
 *
 * What this is **not**: an authorization layer. It forwards whatever the
 * session is allowed to do and lets the backend decide. Deleting the role
 * checks from this file would change nothing about what a teacher can reach —
 * that is the property worth having.
 */

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Paths the dashboard must never be able to reach through the proxy.
 *
 * Session cookies would otherwise let the browser drive credential and media
 * endpoints that exist for the mobile app and the login route, and a playback
 * ticket obtained through an admin's session would be a way around the
 * content-protection design. Blocking them here costs nothing — the dashboard
 * has no reason to call any of them.
 */
const BLOCKED_PREFIXES = [
  'auth/login',
  'auth/register',
  'auth/refresh',
  'auth/logout',
  'playback/',
  'media/',
  'payments/webhooks/',
];

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
export async function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const method = request.method.toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    return problem(405, 'UNKNOWN', 'Method not allowed.');
  }

  const { path } = await context.params;
  const target = (path ?? []).join('/');

  if (!target || target.includes('..')) {
    return problem(400, 'VALIDATION_ERROR', 'Invalid path.');
  }

  if (BLOCKED_PREFIXES.some((prefix) => target === prefix || target.startsWith(prefix))) {
    return problem(403, 'FORBIDDEN', 'This endpoint is not available through the dashboard.');
  }

  // --- CSRF ----------------------------------------------------------------
  // Cookies are SameSite=Lax, which already blocks the cross-site form POST
  // that classic CSRF relies on. These two checks close the remaining gap:
  // a custom header cannot be set by a simple cross-origin form, and the
  // Origin header is present on every browser-issued mutating request.
  if (MUTATING_METHODS.has(method)) {
    if (request.headers.get('x-dashboard-request') !== '1') {
      return problem(403, 'FORBIDDEN', 'Missing dashboard request header.');
    }

    const origin = request.headers.get('origin');
    if (origin) {
      const expected = serverConfig.appOrigin ?? request.nextUrl.origin;
      if (origin !== expected) {
        return problem(403, 'FORBIDDEN', 'Cross-origin request refused.');
      }
    }
  }

  let token = await getAccessToken();
  if (!token) {
    return problem(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const body = await readBody(request);
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());

  const forward = {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: `/${target}`,
    query,
    body,
    forwardedFor: clientIp(request),
    userAgent: request.headers.get('user-agent'),
    acceptLanguage: request.headers.get('accept-language'),
  };

  try {
    const result = await backendRequest<unknown>({ ...forward, accessToken: token });
    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta },
      { status: result.status },
    );
  } catch (error) {
    // One retry, and only for an expired access token. Anything else — a
    // forbidden action, a validation failure — is the real answer and is
    // passed straight through.
    if (error instanceof ApiError && error.status === 401) {
      token = await refreshAccessToken();

      if (token) {
        try {
          const retried = await backendRequest<unknown>({ ...forward, accessToken: token });
          return NextResponse.json(
            { success: true, data: retried.data, meta: retried.meta },
            { status: retried.status },
          );
        } catch (retryError) {
          return errorResponse(retryError);
        }
      }

      return problem(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }

    return errorResponse(error);
  }
}

async function readBody(request: NextRequest): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    // DELETE with a body is used by the backend for reasons on destructive
    // actions, so it is read when one is present rather than assumed absent.
    const text = await request.text().catch(() => '');
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }

  const text = await request.text().catch(() => '');
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return problem(error.status, error.code, error.message, error.fields, error.requestId);
  }
  // Never leak an unexpected exception's message or stack to the browser.
  return problem(500, 'SERVER_ERROR', 'Something went wrong on the server.');
}

function problem(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]> | null,
  requestId?: string | null,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(fields ? { fields } : {}) },
      statusCode: status,
      code,
      message,
      ...(fields ? { errors: fields } : {}),
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

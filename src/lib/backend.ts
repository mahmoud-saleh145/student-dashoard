import 'server-only';

import { serverConfig } from '@/lib/config';
import { ApiError, toApiError } from '@/lib/errors';

/**
 * The only place in this application that talks to the NestJS API.
 *
 * Everything the browser does goes: browser → this app's route handlers →
 * here → backend. The access token is attached at this layer and never
 * crosses back to the client, which is what makes an HTTP-only cookie a
 * meaningful protection rather than decoration.
 */

export interface BackendRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  accessToken?: string | null;
  /** Forwarded so the backend's audit rows record the real client address. */
  forwardedFor?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  signal?: AbortSignal;
}

export interface BackendResponse<T> {
  status: number;
  data: T;
  meta: Record<string, unknown> | undefined;
}

export function buildUrl(
  path: string,
  query?: BackendRequest['query'],
): string {
  const base = serverConfig.apiBaseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(base + suffix);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Performs one request and unwraps the success envelope.
 *
 * Throws `ApiError` for anything that is not a 2xx, including transport
 * failures — so callers have exactly one error type to handle rather than a
 * mixture of thrown `TypeError`s and returned status codes.
 */
export async function backendRequest<T>(request: BackendRequest): Promise<BackendResponse<T>> {
  const {
    method = 'GET',
    path,
    query,
    body,
    accessToken,
    forwardedFor,
    userAgent,
    acceptLanguage,
    signal,
  } = request;

  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  if (userAgent) headers['user-agent'] = userAgent;
  if (acceptLanguage) headers['accept-language'] = acceptLanguage;

  // The dashboard identifies itself so the backend's device middleware does
  // not mistake a browser session for an unregistered mobile device. It
  // deliberately does not send an `x-device-key`: device binding is a student
  // protection and staff accounts must not consume a student's device slot.
  headers['x-client'] = 'dashboard-web';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), serverConfig.apiTimeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      // Back-office data is always read fresh. A cached list of students is a
      // support ticket waiting to happen.
      cache: 'no-store',
    });
  } catch (error) {
    clearTimeout(timeout);

    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError({
      code: aborted ? 'NETWORK_TIMEOUT' : 'NETWORK_OFFLINE',
      message: aborted
        ? 'The API did not respond in time.'
        : 'The API could not be reached.',
      status: 503,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    throw toApiError(parsed, response.status);
  }

  // Success bodies are `{ success, data, meta }`. A handler that opted out of
  // the envelope (@RawResponse) returns its payload directly, so both shapes
  // are accepted rather than assumed.
  const envelope = parsed as { success?: boolean; data?: unknown; meta?: unknown } | null;

  const hasEnvelope =
    envelope !== null &&
    typeof envelope === 'object' &&
    'data' in envelope &&
    envelope.success === true;

  return {
    status: response.status,
    data: (hasEnvelope ? envelope.data : parsed) as T,
    meta: hasEnvelope ? (envelope.meta as Record<string, unknown> | undefined) : undefined,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

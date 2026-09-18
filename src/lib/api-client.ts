'use client';

import { toApiError, ApiError } from '@/lib/errors';
import type { Paginated } from '@/types/api';

/**
 * The browser's HTTP client.
 *
 * It only ever talks to this application's own origin: `/api/proxy/...` for
 * backend data and `/api/auth/...` for the session. There is no base URL to
 * configure and no token to attach — the cookie does that, server-side.
 */

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(
    `/api/proxy/${path.replace(/^\/+/, '')}`,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  );

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  // Proves the request came from this application's own JavaScript. A simple
  // cross-origin form cannot set a custom header, so this — together with the
  // SameSite cookie and the proxy's origin check — is what stops CSRF.
  if (method !== 'GET') headers['x-dashboard-request'] = '1';

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      code: 'NETWORK_OFFLINE',
      message: 'The dashboard could not reach the server.',
      status: 0,
    });
  }

  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = toApiError(parsed, response.status);

    // A dead session cannot be recovered by any amount of retrying. Send the
    // browser to the login screen with a marker so it can say why, rather
    // than showing a wall of failed panels.
    if (error.endsSession && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?reason=expired&next=${next}`);
    }

    throw error;
  }

  const envelope = parsed as { success?: boolean; data?: unknown } | null;
  const hasEnvelope =
    envelope !== null && typeof envelope === 'object' && 'data' in envelope;

  return (hasEnvelope ? envelope.data : parsed) as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', path, { ...options, body }),

  /** Convenience for the many `{ items, meta }` list endpoints. */
  page: <T>(path: string, options?: RequestOptions) =>
    request<Paginated<T>>('GET', path, options),
};

/** Session endpoints, which live outside the proxy. */
export const authApi = {
  async login(phone: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-request': '1' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone, password }),
    });

    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(parsed, response.status);

    return (parsed as { data: { user: unknown } }).data.user;
  },

  async logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-dashboard-request': '1' },
      credentials: 'same-origin',
    }).catch(() => undefined);
  },
};

/**
 * Fetches every page of a list endpoint.
 *
 * Used only by exports, where a partial file is worse than a slow one. It is
 * bounded on both pages and rows so a runaway dataset cannot hang the tab, and
 * it reports progress so the button can say what it is doing.
 */
export async function fetchAllPages<T>(
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
  options: {
    pageSize?: number;
    maxRows?: number;
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 100;
  const maxRows = options.maxRows ?? 20_000;

  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await api.page<T>(path, {
      query: { ...query, page, pageSize },
      signal: options.signal,
    });

    rows.push(...result.items);
    totalPages = result.meta.totalPages;
    options.onProgress?.(rows.length, result.meta.total);
    page += 1;
  } while (page <= totalPages && rows.length < maxRows);

  return rows;
}

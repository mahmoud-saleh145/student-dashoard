import { NextResponse, type NextRequest } from 'next/server';

import { buildUrl } from '@/lib/backend';
import { serverConfig } from '@/lib/config';
import { attemptRefresh, getAccessToken } from '@/lib/session';

/**
 * The binary door, shared by every upload route beside the JSON proxy.
 *
 * `/api/proxy/[...path]` reads each body with `request.text()` and re-sends it
 * as JSON, which is right for the API it fronts but would quietly corrupt a
 * PDF or a PNG — decoding arbitrary bytes as UTF-8 is lossy. Rather than teach
 * the security-critical proxy a second body mode, uploads get their own route.
 * This module is what they all share, extracted when the second such route
 * appeared so the CSRF checks and the 401-retry could not drift between them.
 *
 * Everything security-relevant is identical to the proxy: the access token
 * stays in an HTTP-only cookie and is attached here, the same custom-header
 * and Origin checks guard against cross-site posts, and an expired token is
 * refreshed once and retried.
 *
 * Why the bytes come here rather than going browser→R2: a presigned PUT is
 * cross-origin and needs a CORS policy on the target bucket. The uploads
 * bucket has one, because the 8 GB video path requires it. The media bucket —
 * which students read from — does not, and opening it up to save a 200 KB
 * thumbnail would be the wrong trade. The body is piped, not buffered, so a
 * large file costs a held socket rather than memory.
 */

export interface StreamUploadSpec {
  /** Backend path, without the API prefix. */
  backendPath: string;
  /**
   * Query parameters to forward, read from the incoming request's own query.
   * Listed explicitly so a caller cannot smuggle an unexpected parameter
   * through to the API.
   */
  forwardParams: string[];
  /** Parameters that must be present and non-empty. */
  requiredParams: string[];
}

export async function handleStreamUpload(
  request: NextRequest,
  spec: StreamUploadSpec,
): Promise<NextResponse> {
  // Same CSRF pair the proxy applies to every mutating request: a custom
  // header a cross-site form cannot set, plus an Origin check.
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

  const query: Record<string, string> = {};
  for (const name of spec.forwardParams) {
    const value = request.nextUrl.searchParams.get(name);
    if (value) query[name] = value;
  }

  const missing = spec.requiredParams.filter((name) => !query[name]);
  if (missing.length > 0) {
    return problem(422, 'VALIDATION_ERROR', `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`);
  }

  const contentType = query.contentType ?? request.headers.get('content-type') ?? '';

  // Required by the backend so it can stream to storage instead of buffering.
  const contentLength = request.headers.get('content-length');
  if (!contentLength) {
    return problem(411, 'VALIDATION_ERROR', 'A Content-Length header is required.');
  }

  if (!request.body) {
    return problem(422, 'VALIDATION_ERROR', 'The request had no body.');
  }

  let token = await getAccessToken();
  if (!token) {
    return problem(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  // The stream can only be consumed once, so a 401 retry needs a second copy
  // rather than a rewind. `tee` keeps the cost to backpressure, not bytes.
  const [first, second] = request.body.tee();

  let response = await forward(spec.backendPath, first, token, query, contentType, contentLength);

  if (response.status === 401) {
    // Same distinction as the proxy: a refresh that failed for an unrelated
    // reason must not be reported as an expired session.
    const attempt = await attemptRefresh();
    token = attempt.token;

    if (!token) {
      if (!attempt.sessionEnded) {
        return problem(
          503,
          'SESSION_REFRESH_UNAVAILABLE',
          'The session could not be renewed right now. Please try again.',
        );
      }
      return problem(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    response = await forward(spec.backendPath, second, token, query, contentType, contentLength);
  } else {
    // Nothing will read the spare copy; cancelling it releases the pipe.
    void second.cancel().catch(() => undefined);
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: unknown; error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    return problem(
      response.status,
      payload?.error?.code ?? 'UPLOAD_FAILED',
      payload?.error?.message ?? 'The upload was refused.',
    );
  }

  // Same envelope the proxy returns, so callers parse one shape.
  return NextResponse.json(
    { success: true, data: payload?.data ?? null },
    { status: response.status },
  );
}

function forward(
  backendPath: string,
  body: ReadableStream<Uint8Array>,
  accessToken: string,
  query: Record<string, string>,
  contentType: string,
  contentLength: string,
): Promise<Response> {
  return fetch(buildUrl(backendPath, query), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': contentType,
      'content-length': contentLength,
    },
    body,
    // Required by undici whenever the body is a stream.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function problem(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message }, statusCode: status, code, message },
    { status },
  );
}

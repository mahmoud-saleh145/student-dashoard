import { NextResponse, type NextRequest } from 'next/server';

import { buildUrl } from '@/lib/backend';
import { serverConfig } from '@/lib/config';
import { getAccessToken, refreshAccessToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The binary door, beside the JSON one.
 *
 * `/api/proxy/[...path]` reads every request body with `request.text()` and
 * re-sends it as JSON. That is right for the API it fronts — the whole
 * envelope contract assumes JSON — but it would quietly corrupt a PDF, since
 * decoding arbitrary bytes as UTF-8 is lossy. Rather than teach the
 * security-critical proxy a second body mode for one endpoint, the upload gets
 * its own route that streams bytes through untouched.
 *
 * Everything else is deliberately identical to the proxy: the access token
 * stays in an HTTP-only cookie and is attached here, the same custom-header
 * and Origin checks guard against cross-site posts, and an expired token is
 * refreshed once and retried.
 *
 * Why the bytes come here at all rather than going browser→R2: a presigned PUT
 * is cross-origin, so it needs a CORS policy on the bucket. This path needs
 * none. The body is piped, not buffered, so a large document costs a held
 * socket rather than memory — in this process and in the API behind it.
 */

const BACKEND_PATH = '/storage/uploads/library-document/content';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const filename = request.nextUrl.searchParams.get('filename') ?? '';
  const contentType = request.nextUrl.searchParams.get('contentType') ?? '';

  if (!filename || !contentType) {
    return problem(422, 'VALIDATION_ERROR', 'filename and contentType are required.');
  }

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

  let response = await forward(first, token, filename, contentType, contentLength);

  if (response.status === 401) {
    token = await refreshAccessToken();
    if (!token) {
      return problem(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    response = await forward(second, token, filename, contentType, contentLength);
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
  body: ReadableStream<Uint8Array>,
  accessToken: string,
  filename: string,
  contentType: string,
  contentLength: string,
): Promise<Response> {
  return fetch(buildUrl(BACKEND_PATH, { filename, contentType }), {
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

import { type NextRequest, type NextResponse } from 'next/server';

import { handleStreamUpload } from '../_shared/stream-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Library document upload.
 *
 * The CSRF checks, the token handling and the 401-retry used to live inline
 * here. They moved to `_shared/stream-upload.ts` when the thumbnail and
 * attachment routes appeared, so the security-relevant half cannot drift
 * between five copies. Behaviour is unchanged.
 */
export function POST(request: NextRequest): Promise<NextResponse> {
  return handleStreamUpload(request, {
    backendPath: '/storage/uploads/library-document/content',
    forwardParams: ['filename', 'contentType'],
    requiredParams: ['filename', 'contentType'],
  });
}

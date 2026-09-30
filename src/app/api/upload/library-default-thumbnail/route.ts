import { type NextRequest, type NextResponse } from 'next/server';

import { handleStreamUpload } from '../_shared/stream-upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Streams bytes through to the API. See _shared/stream-upload.ts for why. */
export function POST(request: NextRequest): Promise<NextResponse> {
  return handleStreamUpload(request, {
    backendPath: '/storage/uploads/library-default-thumbnail/content',
    forwardParams: ['contentType'],
    requiredParams: ['contentType'],
  });
}

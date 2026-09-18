import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The current display profile, or null. Used by the client shell on mount. */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ success: true, data: { user } });
}

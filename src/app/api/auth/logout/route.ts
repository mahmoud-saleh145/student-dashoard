import { NextResponse } from 'next/server';

import { signOut } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign-out.
 *
 * Revokes the session on the backend (which also releases any playback slot
 * and refresh-token family it held) and clears the cookies. The cookies are
 * cleared even if the backend call fails, because a browser that still holds
 * a session cookie after the user pressed "sign out" is the worse failure.
 */
export async function POST() {
  await signOut();
  return NextResponse.json({ success: true, data: { ok: true } });
}

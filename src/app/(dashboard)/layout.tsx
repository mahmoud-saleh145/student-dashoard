import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/layout/shell';
import { Providers } from '@/app/providers';
import { requireSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The authenticated shell.
 *
 * The session is resolved on the server before anything renders, so there is
 * no authenticated-looking frame that then empties out, and no window in
 * which a signed-out browser sees the layout at all.
 *
 * This redirect is a routing convenience, not the security boundary: every
 * request for data goes through the proxy and is authorised by the backend.
 * Someone who defeats this check reaches a shell with nothing in it.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireSessionUser();

  // Reached only when a session cookie was present but the backend refused it
  // outright — disabled, or no longer a staff role. The middleware already
  // turned away anyone with no cookie at all, carrying their destination with
  // them, and a merely-expired access token is left to the proxy to rotate.
  //
  // Via the route handler rather than straight to /login, because this is a
  // Server Component: it cannot clear the cookies itself, and sending someone
  // to a login page while they still hold a session cookie is what produced
  // the bounce between the two.
  if (!user) redirect('/api/auth/expired?reason=forbidden');

  return (
    <Providers user={user}>
      <DashboardShell>{children}</DashboardShell>
    </Providers>
  );
}

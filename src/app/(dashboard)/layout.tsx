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
  if (!user) redirect('/login');

  return (
    <Providers user={user}>
      <DashboardShell>{children}</DashboardShell>
    </Providers>
  );
}

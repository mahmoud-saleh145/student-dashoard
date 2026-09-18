import type { Metadata } from 'next';

import { HomeRouter } from '@/features/stats/home-router';

export const metadata: Metadata = { title: 'Statistics' };

/**
 * The landing screen.
 *
 * Admins get platform statistics; teachers get their own courses. The split is
 * made in a client component rather than by redirecting, so a teacher's URL is
 * `/` like everyone else's and a shared link does not break for them.
 */
export default function DashboardHomePage() {
  return <HomeRouter />;
}

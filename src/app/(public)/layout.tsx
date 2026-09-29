import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Public pages (privacy, terms, account deletion, support).
 *
 * Deliberately outside the (dashboard) group: no session lookup, no providers,
 * no API calls. The middleware lists these paths as public.
 *
 * The root layout marks the whole site noindex because it is a back office.
 * These pages are the exception — they are linked from the store listings and
 * should be findable — so indexing is switched back on here.
 */
export const metadata: Metadata = {
  title: { default: 'Student Center', template: '%s · Student Center' },
  robots: { index: true, follow: true },
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}

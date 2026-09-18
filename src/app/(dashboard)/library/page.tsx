import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LibraryOverview } from '@/features/library/library-overview';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <LibraryOverview />
    </Suspense>
  );
}

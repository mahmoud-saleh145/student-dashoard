import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BatchList } from '@/features/codes/batch-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Code batches' };

export default function CodeBatchesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BatchList />
    </Suspense>
  );
}

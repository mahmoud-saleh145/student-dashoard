import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LogsView } from '@/features/logs/logs-view';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Logs' };

export default function LogsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <LogsView />
    </Suspense>
  );
}

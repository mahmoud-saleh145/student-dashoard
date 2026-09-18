import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CodeList } from '@/features/codes/code-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Codes' };

export default function CodesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CodeList />
    </Suspense>
  );
}

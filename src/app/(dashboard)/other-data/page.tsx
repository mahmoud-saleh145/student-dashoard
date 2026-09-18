import type { Metadata } from 'next';
import { Suspense } from 'react';

import { OtherData } from '@/features/catalog/other-data';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Other data' };

export default function OtherDataPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <OtherData />
    </Suspense>
  );
}

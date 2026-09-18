import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PartPurchaseReport } from '@/features/course-parts/part-purchases';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Part unlocks' };

export default function PartPurchasesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PartPurchaseReport />
    </Suspense>
  );
}

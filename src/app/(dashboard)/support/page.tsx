import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SupportCentre } from '@/features/support/support-centre';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Support centre' };

export default function SupportPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SupportCentre />
    </Suspense>
  );
}

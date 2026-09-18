import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MaterialDetail } from '@/features/library/material-detail';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Library material' };

export default async function MaterialPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const { materialId } = await params;

  return (
    <Suspense fallback={<TableSkeleton />}>
      <MaterialDetail materialId={materialId} />
    </Suspense>
  );
}

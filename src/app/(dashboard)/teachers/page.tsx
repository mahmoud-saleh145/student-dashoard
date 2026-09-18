import type { Metadata } from 'next';
import { Suspense } from 'react';

import { TeacherList } from '@/features/teachers/teacher-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Teachers' };

export default function TeachersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <TeacherList />
    </Suspense>
  );
}

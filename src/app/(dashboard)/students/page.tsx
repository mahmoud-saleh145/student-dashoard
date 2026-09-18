import type { Metadata } from 'next';
import { Suspense } from 'react';

import { StudentList } from '@/features/students/student-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Students' };

export default function StudentsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <StudentList />
    </Suspense>
  );
}

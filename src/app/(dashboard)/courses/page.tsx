import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CourseList } from '@/features/courses/course-list';
import { TableSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Courses' };

/**
 * `useSearchParams` requires a Suspense boundary in the App Router; without
 * one the whole route opts out of static optimisation and Next warns at build.
 */
export default function CoursesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CourseList />
    </Suspense>
  );
}

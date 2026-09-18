import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CourseDetail } from '@/features/courses/course-detail';
import { CardsSkeleton } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Course' };

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  return (
    <Suspense fallback={<CardsSkeleton />}>
      <CourseDetail courseId={courseId} />
    </Suspense>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';

import { CourseStatusBadge } from '@/components/data/status';
import { Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui/primitives';
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useSession } from '@/lib/session-context';
import type { Paginated } from '@/types/api';
import type { CourseSummary } from '@/types/domain';

/**
 * The teacher's landing screen.
 *
 * Everything here is derived from `GET /admin/courses`, which the backend
 * already scopes to the courses a teacher is assigned to. There is no
 * platform-wide query on this page and no way to widen it from the client —
 * asking for another teacher's data returns their own.
 */
export function TeacherHome() {
  const { user } = useSession();

  const courses = useQuery({
    queryKey: queryKeys.courses.list({ scope: 'teacher-home' }),
    queryFn: () =>
      api.page<CourseSummary>('admin/courses', { query: { page: 1, pageSize: 100 } }),
  });

  const totals = useMemo(() => summarise(courses.data), [courses.data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${firstName(user.fullName)}`}
        description="Your courses, your students, your content."
      />

      {courses.isLoading ? (
        <CardsSkeleton count={4} />
      ) : courses.isError ? (
        <Card>
          <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
        </Card>
      ) : (
        <>
          <section
            aria-label="Your totals"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatTile
              label="Students"
              value={formatNumber(totals.students)}
              hint="across your courses"
              tone="primary"
            />
            <StatTile label="Courses" value={formatNumber(totals.courses)} />
            <StatTile
              label="Lectures"
              value={formatNumber(totals.lessons)}
              hint={`in ${formatNumber(totals.sections)} sections`}
            />
            <StatTile
              label="Enrolments"
              value={formatNumber(totals.enrollments)}
              hint="all time"
            />
          </section>

          <Card>
            <CardHeader
              title="Your courses"
              description="Open a course to manage its sections, lectures, students and notifications."
              actions={
                <Link
                  href="/courses"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              }
            />

            {courses.isLoading ? (
              <TableSkeleton rows={4} columns={4} />
            ) : (courses.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No courses assigned to you yet"
                description="An administrator assigns courses to teachers. Once one is assigned, it appears here."
              />
            ) : (
              <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {courses.data?.items.slice(0, 9).map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border p-4 transition-colors hover:border-border-strong hover:bg-surface-alt"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {course.title}
                      </p>
                      <CourseStatusBadge status={course.status} />
                    </div>

                    <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <div className="flex gap-1">
                        <dt>Students</dt>
                        <dd className="font-medium text-foreground">
                          {formatNumber(course.studentCount)}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Lectures</dt>
                        <dd className="font-medium text-foreground">
                          {formatNumber(course.counts.lessons)}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Price</dt>
                        <dd className="font-medium text-foreground">
                          {course.isFree
                            ? 'Free'
                            : formatMoney(course.price?.amount, course.price?.currency)}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                ))}
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function summarise(page: Paginated<CourseSummary> | undefined) {
  const items = page?.items ?? [];

  return {
    courses: page?.meta.total ?? items.length,
    students: items.reduce((sum, course) => sum + course.studentCount, 0),
    lessons: items.reduce((sum, course) => sum + course.counts.lessons, 0),
    sections: items.reduce((sum, course) => sum + course.counts.sections, 0),
    enrollments: items.reduce((sum, course) => sum + course.counts.enrollments, 0),
  };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

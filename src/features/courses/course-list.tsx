'use client';

import Link from 'next/link';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { CourseStatusBadge } from '@/components/data/status';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { useCourses } from '@/features/courses/hooks';
import { useAcademicYears, useSubjects, useUniversities } from '@/features/catalog/hooks';
import { CreateCourseDialog } from '@/features/courses/create-course-dialog';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DAY_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useSession } from '@/lib/session-context';
import { useListQuery } from '@/lib/use-list-query';
import { COURSE_STATUSES, type CourseStatus, type CourseSummary } from '@/types/domain';

const FILTER_KEYS = ['status', 'universityId', 'academicYearId', 'subjectId'] as const;

/**
 * The course list.
 *
 * Search, filtering, sorting and pagination are all query parameters sent to
 * `GET /admin/courses`. Nothing is filtered in the browser, so the counts and
 * the export match the table for the whole result set, not for the visible
 * page.
 *
 * A teacher gets the same screen: the backend scopes the endpoint to their own
 * assignments, so no client-side filtering is needed to keep them out of other
 * teachers' courses — and none would be trustworthy if it were.
 */
export function CourseList() {
  const { isTeacher, isAdmin } = useSession();
  const list = useListQuery({ filterKeys: FILTER_KEYS, defaultSort: undefined });
  const [creating, setCreating] = useState(false);

  const universities = useUniversities();
  const years = useAcademicYears();
  const subjects = useSubjects();

  const courses = useCourses(list.queryParams);

  const columns: Column<CourseSummary>[] = [
    {
      key: 'title',
      header: 'Course',
      sortable: true,
      className: 'min-w-[16rem]',
      render: (course) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/courses/${course.id}`}
            className="truncate font-medium text-foreground hover:text-primary hover:underline"
          >
            {course.title}
          </Link>
          <span className="truncate text-xs text-muted">
            {course.teachers.map((teacher) => teacher.fullName).join(', ') || 'No teacher'}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (course) => <CourseStatusBadge status={course.status} />,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'end',
      render: (course) =>
        course.isFree ? (
          <Badge tone="info">Free</Badge>
        ) : (
          <span className="tabular-nums">
            {formatMoney(course.price?.amount, course.price?.currency)}
          </span>
        ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      sortable: true,
      render: (course) => (
        <span className="tabular-nums">{formatNumber(course.studentCount)}</span>
      ),
    },
    {
      key: 'sections',
      header: 'Sections',
      align: 'end',
      secondary: true,
      render: (course) => (
        <span className="tabular-nums text-muted">{formatNumber(course.counts.sections)}</span>
      ),
    },
    {
      key: 'lessons',
      header: 'Lectures',
      align: 'end',
      secondary: true,
      render: (course) => (
        <span className="tabular-nums text-muted">{formatNumber(course.counts.lessons)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      secondary: true,
      sortable: true,
      render: (course) => (
        <span className="whitespace-nowrap text-muted">{formatDate(course.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (course) => (
        <ButtonLink href={`/courses/${course.id}`} size="sm" variant="secondary">
          Open
        </ButtonLink>
      ),
    },
  ];

  const exportColumns: ExportColumn<CourseSummary>[] = [
    { header: 'Course', key: 'title', width: 38, value: (row) => row.title },
    { header: 'Status', key: 'status', width: 14, value: (row) => row.status },
    {
      header: 'Teachers',
      key: 'teachers',
      width: 32,
      value: (row) => row.teachers.map((teacher) => teacher.fullName).join(', '),
    },
    {
      header: 'Price',
      key: 'price',
      width: 12,
      value: (row) => (row.isFree ? 0 : (row.price?.amount ?? 0)),
      format: '#,##0.00',
    },
    { header: 'Currency', key: 'currency', width: 10, value: (row) => row.price?.currency ?? 'EGP' },
    { header: 'Students', key: 'students', width: 12, value: (row) => row.studentCount },
    { header: 'Sections', key: 'sections', width: 12, value: (row) => row.counts.sections },
    { header: 'Lectures', key: 'lessons', width: 12, value: (row) => row.counts.lessons },
    {
      header: 'University',
      key: 'university',
      width: 26,
      value: (row) => row.university?.name ?? '',
    },
    { header: 'College', key: 'faculty', width: 26, value: (row) => row.faculty?.name ?? '' },
    {
      header: 'Academic year',
      key: 'year',
      width: 18,
      value: (row) => row.academicYear?.name ?? '',
    },
    { header: 'Subject', key: 'subject', width: 20, value: (row) => row.subject?.name ?? '' },
    {
      header: 'Created',
      key: 'createdAt',
      width: 16,
      value: (row) => asDate(row.createdAt),
      format: EXCEL_DAY_FORMAT,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isTeacher ? 'My courses' : 'Courses'}
        description={
          isTeacher
            ? 'The courses you are assigned to teach.'
            : 'Every course on the platform, across universities, colleges and academic years.'
        }
        actions={
          <>
            {isAdmin ? (
              <ButtonLink href="/courses/structure" variant="secondary">
                Academic structure
              </ButtonLink>
            ) : null}
            <Button onClick={() => setCreating(true)}>New course</Button>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={courses.data?.items ?? []}
        rowKey={(course) => course.id}
        isLoading={courses.isLoading}
        error={courses.error}
        onRetry={() => void courses.refetch()}
        meta={courses.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        sort={list.sort}
        onSortChange={list.setSort}
        caption="Courses"
        emptyTitle={list.isFiltered ? 'No courses match these filters' : 'No courses yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try widening the filters, or clear them to see everything.'
            : 'Create the first course to get started.'
        }
        emptyAction={
          list.isFiltered ? (
            <Button variant="secondary" size="sm" onClick={list.clear}>
              Clear filters
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCreating(true)}>
              New course
            </Button>
          )
        }
        toolbar={
          <FilterBar
            isFiltered={list.isFiltered}
            onClear={list.clear}
            actions={
              <ExportButton
                filename={exportFilename('courses')}
                sheetName="Courses"
                title="Courses"
                subtitle={describeFilters(list.q, list.filters)}
                columns={exportColumns}
                loadRows={(onProgress) =>
                  fetchAllPages<CourseSummary>('admin/courses', list.queryParams, {
                    onProgress,
                  })
                }
              />
            }
          >
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search courses…"
              label="Search courses"
            />

            <FilterSelect
              label="Status"
              placeholder="Any status"
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={COURSE_STATUSES.map((status) => ({
                value: status,
                label: STATUS_LABELS[status],
              }))}
            />

            <FilterSelect
              label="University"
              placeholder="Any university"
              value={list.filters.universityId ?? ''}
              onChange={(value) => list.setFilter('universityId', value)}
              options={(universities.data ?? []).map((university) => ({
                value: university.id,
                label: university.name,
              }))}
            />

            <FilterSelect
              label="Academic year"
              placeholder="Any year"
              value={list.filters.academicYearId ?? ''}
              onChange={(value) => list.setFilter('academicYearId', value)}
              options={(years.data ?? []).map((year) => ({
                value: year.id,
                label: year.name,
              }))}
            />

            <FilterSelect
              label="Subject"
              placeholder="Any subject"
              value={list.filters.subjectId ?? ''}
              onChange={(value) => list.setFilter('subjectId', value)}
              options={(subjects.data ?? []).map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
            />
          </FilterBar>
        }
      />

      <CreateCourseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

const STATUS_LABELS: Record<CourseStatus, string> = {
  PUBLISHED: 'Visible',
  HIDDEN: 'Hidden',
  DRAFT: 'Draft',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

/** A one-line description of the active filters, printed into the export. */
export function describeFilters(
  search: string,
  filters: Record<string, string>,
): string | undefined {
  const parts: string[] = [];
  if (search) parts.push(`search “${search}”`);
  for (const [key, value] of Object.entries(filters)) {
    if (value) parts.push(`${key}: ${value}`);
  }
  return parts.length > 0 ? `Filtered by ${parts.join(' · ')}` : 'No filters applied';
}

'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { EnrollmentStateBadge } from '@/components/data/status';
import { Badge } from '@/components/ui/primitives';
import { useCourseSections, useCourseStudents } from '@/features/courses/hooks';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDateTime, formatMoney, formatPhone, maskCode } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { ENROLLMENT_STATES, type CourseStudentRow } from '@/types/domain';

const FILTER_KEYS = ['state', 'sectionId'] as const;

/**
 * The students of one course.
 *
 * The section filter is what makes the per-section exports honest. A student
 * is included for a section when their enrolment covers the whole course *or*
 * when a section-scoped code named that section — the backend applies that
 * rule in the query, so "who bought Post-Mid" cannot drift from who can
 * actually watch Post-Mid.
 *
 * Every export re-fetches the full filtered result set, so a spreadsheet is
 * never one page of a longer list.
 */
export function CourseStudentsTab({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const sections = useCourseSections(courseId);
  const students = useCourseStudents(courseId, list.queryParams);
  const [selected, setSelected] = useState<CourseStudentRow | null>(null);

  const sectionOptions = (sections.data ?? []).map((section) => ({
    value: section.id,
    label: section.title,
  }));

  const columns: Column<CourseStudentRow>[] = [
    {
      key: 'student',
      header: 'Student',
      className: 'min-w-[14rem]',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{row.user.fullName}</span>
          <span className="truncate text-xs text-muted" dir="ltr">
            {formatPhone(row.user.phone)}
          </span>
        </div>
      ),
    },
    {
      key: 'academic',
      header: 'University / year',
      secondary: true,
      render: (row) => (
        <div className="flex min-w-0 flex-col text-xs">
          <span className="truncate text-foreground">{row.user.university?.name ?? '—'}</span>
          <span className="truncate text-muted">
            {[row.user.faculty?.name, row.user.academicYear?.name]
              .filter(Boolean)
              .join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <EnrollmentStateBadge state={row.state} />
          {!row.coversAllSections ? (
            <Badge tone="info">{row.sectionIds?.length ?? 0} section(s)</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Purchase / code',
      secondary: true,
      render: (row) =>
        row.redemption ? (
          <div className="flex min-w-0 flex-col text-xs">
            <span className="font-mono text-foreground">{maskCode(row.redemption.code)}</span>
            <span className="text-muted">
              {row.redemption.amount !== null
                ? formatMoney(row.redemption.amount, row.redemption.currency)
                : row.redemption.targetType.toLowerCase()}
            </span>
          </div>
        ) : row.payments.length > 0 ? (
          <span className="text-xs text-foreground">
            {formatMoney(row.payments[0]?.amount, row.payments[0]?.currency)}
          </span>
        ) : (
          <span className="text-xs text-muted">{row.method.toLowerCase()}</span>
        ),
    },
    {
      key: 'accessStartsAt',
      header: 'Access date',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.accessStartsAt)}
        </span>
      ),
    },
    {
      key: 'lastAccessedAt',
      header: 'Last active',
      secondary: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.lastAccessedAt)}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<CourseStudentRow>[] = [
    { header: 'Student', key: 'name', width: 30, value: (row) => row.user.fullName },
    { header: 'Phone', key: 'phone', width: 16, value: (row) => row.user.phone },
    { header: 'Email', key: 'email', width: 26, value: (row) => row.user.email ?? '' },
    {
      header: 'University',
      key: 'university',
      width: 26,
      value: (row) => row.user.university?.name ?? '',
    },
    { header: 'College', key: 'faculty', width: 26, value: (row) => row.user.faculty?.name ?? '' },
    {
      header: 'Department',
      key: 'department',
      width: 26,
      value: (row) => row.user.department?.name ?? '',
    },
    {
      header: 'Academic year',
      key: 'year',
      width: 18,
      value: (row) => row.user.academicYear?.name ?? '',
    },
    { header: 'Access state', key: 'state', width: 16, value: (row) => row.state },
    { header: 'Method', key: 'method', width: 14, value: (row) => row.method },
    {
      header: 'Covers whole course',
      key: 'coversAll',
      width: 18,
      value: (row) => (row.coversAllSections ? 'Yes' : 'No'),
    },
    {
      header: 'Code',
      key: 'code',
      width: 20,
      // The export is a deliberate, audited action by an administrator, so it
      // carries the real code — the masking in the table is about shoulder
      // surfing, not about hiding it from the person who generated it.
      value: (row) => row.redemption?.code ?? '',
    },
    {
      header: 'Amount',
      key: 'amount',
      width: 12,
      value: (row) => row.redemption?.amount ?? row.payments[0]?.amount ?? null,
      format: EXCEL_MONEY_FORMAT,
    },
    {
      header: 'Access date',
      key: 'accessStartsAt',
      width: 20,
      value: (row) => asDate(row.accessStartsAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Access ends',
      key: 'accessEndsAt',
      width: 20,
      value: (row) => asDate(row.accessEndsAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Last active',
      key: 'lastAccessedAt',
      width: 20,
      value: (row) => asDate(row.lastAccessedAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  const activeSection = sectionOptions.find(
    (option) => option.value === list.filters.sectionId,
  );

  return (
    <DataTable
      columns={columns}
      rows={students.data?.items ?? []}
      rowKey={(row) => row.id}
      isLoading={students.isLoading}
      error={students.error}
      onRetry={() => void students.refetch()}
      meta={students.data?.meta}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onRowClick={(row) => setSelected(selected?.id === row.id ? null : row)}
      caption={`Students of ${courseTitle}`}
      emptyTitle={
        list.isFiltered ? 'No students match these filters' : 'No students have joined yet'
      }
      emptyDescription={
        list.isFiltered
          ? 'Try a different section or access state.'
          : 'Students appear here as soon as they redeem a code or complete a purchase.'
      }
      toolbar={
        <FilterBar
          isFiltered={list.isFiltered}
          onClear={list.clear}
          actions={
            <ExportButton
              filename={exportFilename(
                activeSection
                  ? `${courseTitle}-${activeSection.label}-students`
                  : `${courseTitle}-students`,
              )}
              sheetName="Students"
              title={
                activeSection
                  ? `${courseTitle} — ${activeSection.label} purchasers`
                  : `${courseTitle} — course purchasers`
              }
              subtitle={
                activeSection
                  ? `Students whose access covers “${activeSection.label}”, including whole-course access.`
                  : 'Every student with an enrolment on this course.'
              }
              columns={exportColumns}
              loadRows={(onProgress) =>
                fetchAllPages<CourseStudentRow>(
                  'admin/enrollments',
                  { ...list.queryParams, courseId },
                  { onProgress },
                )
              }
            />
          }
        >
          <SearchInput
            value={list.q}
            onChange={list.setSearch}
            placeholder="Search by name or phone…"
            label="Search students"
          />

          <FilterSelect
            label="Section"
            placeholder="Whole course"
            value={list.filters.sectionId ?? ''}
            onChange={(value) => list.setFilter('sectionId', value)}
            options={sectionOptions}
          />

          <FilterSelect
            label="Access state"
            placeholder="Any state"
            value={list.filters.state ?? ''}
            onChange={(value) => list.setFilter('state', value)}
            options={ENROLLMENT_STATES.map((state) => ({
              value: state,
              label: state.replace(/_/g, ' ').toLowerCase(),
            }))}
          />
        </FilterBar>
      }
    />
  );
}

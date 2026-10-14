'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { EnrollmentStateBadge, RefundStatusBadge } from '@/components/data/status';
import { ActionMenu } from '@/components/ui/action-menu';
import { ReasonConfirmDialog } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCourseSections,
  useCourseStudents,
  useRemoveStudentFromCourse,
  type RemoveStudentResult,
} from '@/features/courses/hooks';
import { RefundDialog } from '@/features/courses/refund-dialog';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDateTime, formatMoney, formatPhone, maskCode } from '@/lib/format';
import { useSession } from '@/lib/session-context';
import { useListQuery } from '@/lib/use-list-query';
import { ENROLLMENT_STATES, type CourseStudentRow } from '@/types/domain';

const FILTER_KEYS = ['state', 'sectionId'] as const;

/**
 * The newest captured payment with money not yet refunded, judged from the
 * list row. It is only a hint for the menu label: the list does not know about
 * pending provider refunds, so the dialog reads the authoritative balance and
 * decides what can actually be refunded (and offers to resolve pending ones).
 */
function refundablePayment(row: CourseStudentRow) {
  return row.payments.find(
    (payment) =>
      (payment.status === undefined ||
        payment.status === 'PAID' ||
        payment.status === 'PARTIALLY_REFUNDED') &&
      Math.round(payment.amount * 100) > Math.round((payment.refundedAmount ?? 0) * 100),
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** The success toast's detail, built from what the API says it actually did. */
function removalSummary(result: RemoveStudentResult): string {
  const parts = ['Their access to this course has ended.'];
  if (result.cancelledPayments > 0) {
    parts.push(
      `${plural(result.cancelledPayments, 'unpaid payment was', 'unpaid payments were')} cancelled.`,
    );
  }
  if (result.revokedPartEntitlements > 0) {
    parts.push(`${plural(result.revokedPartEntitlements, 'part', 'parts')} revoked.`);
  }
  parts.push('Paid payments, revenue and code history were kept — nothing was refunded.');
  return parts.join(' ');
}

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
  const { isAdmin } = useSession();
  const toast = useToast();
  const removeStudent = useRemoveStudentFromCourse(courseId);
  const [removing, setRemoving] = useState<CourseStudentRow | null>(null);
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);

  async function confirmRemoval(reason: string) {
    // The dialog's button is disabled while busy; this also covers a second
    // Enter press landing before the re-render.
    if (!removing || removeStudent.isPending) return;

    try {
      const result = await removeStudent.mutateAsync({ enrollmentId: removing.id, reason });
      if (result.alreadyRemoved) {
        toast.success(
          'Already removed',
          `${removing.user.fullName} had already been removed from this course. Nothing changed.`,
        );
      } else {
        toast.success(`${removing.user.fullName} was removed`, removalSummary(result));
      }
      setRemoving(null);
    } catch (error) {
      toast.error(error, 'The student could not be removed');
    }
  }

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
          <div className="flex flex-col items-start gap-1 text-xs">
            <span className="text-foreground">
              {formatMoney(row.payments[0]?.amount, row.payments[0]?.currency)}
            </span>
            <RefundStatusBadge status={row.payments[0]?.refundStatus} />
          </div>
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

  // Administrators only — the API refuses everyone else, and a teacher's
  // `students` permission is a permission to view them.
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (row) => {
        const refundable = refundablePayment(row);
        const latest = row.payments[0];
        return (
          <ActionMenu
            label={`Actions for ${row.user.fullName}`}
            items={[
              // Offered only where a payment exists: code enrollments have
              // none (the card was sold offline), so there is nothing here to
              // refund. A fully refunded payment opens its history instead.
              ...(latest
                ? [
                    {
                      label: refundable ? 'Refund' : 'Refund history',
                      onSelect: () => setRefundingPaymentId((refundable ?? latest).id),
                    },
                  ]
                : []),
              {
                label: row.state === 'REVOKED' ? 'Removed from course' : 'Remove from course',
                danger: true,
                disabled: row.state === 'REVOKED',
                onSelect: () => setRemoving(row),
              },
            ]}
          />
        );
      },
    });
  }

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
    <>
      <RefundDialog paymentId={refundingPaymentId} onClose={() => setRefundingPaymentId(null)} />
      <ReasonConfirmDialog
        open={removing !== null}
        onCancel={() => {
          if (!removeStudent.isPending) setRemoving(null);
        }}
        onConfirm={(reason) => void confirmRemoval(reason)}
        title="Remove this student from the course?"
        message={
          removing ? (
            <div className="flex flex-col gap-2">
              <p>
                <strong className="text-foreground">{removing.user.fullName}</strong> loses access
                to <strong className="text-foreground">{courseTitle}</strong> immediately, including
                any video they are watching now. Their other courses and their account are not
                affected.
              </p>
              <p>
                Their enrollment in this course is revoked: section and part access bought for it is
                withdrawn, and any unpaid (pending) payment for it is cancelled.
              </p>
              <p>
                Paid payments and reported revenue are kept and{' '}
                <strong className="text-foreground">nothing is refunded</strong>. A redeemed code
                stays used. Watch history is kept. To give access back later, grant it again.
              </p>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Remove from course"
        busy={removeStudent.isPending}
        reasonPlaceholder="Why is this student being removed? Recorded in the audit log."
      />
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
    </>
  );
}

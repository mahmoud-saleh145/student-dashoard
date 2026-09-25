'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { AccountStatusBadge } from '@/components/data/status';
import { ActionMenu } from '@/components/ui/action-menu';
import { ReasonConfirmDialog } from '@/components/ui/overlay';
import { Avatar, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Tabs, useTabParam } from '@/components/ui/tabs';
import { useAcademicYears, useUniversities } from '@/features/catalog/hooks';
import { useStudents } from '@/features/students/hooks';
import { DeviceRequests } from '@/features/students/device-requests';
import { StudentDrawer } from '@/features/students/student-drawer';
import { useDeleteAccount } from '@/features/teachers/hooks';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDate, formatDateTime, formatPhone } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import type { StudentRow } from '@/types/domain';

const FILTER_KEYS = ['universityId', 'academicYearId'] as const;

/**
 * Student accounts.
 *
 * Two tabs over the same endpoint: active accounts, and blocked ones. Blocked
 * students are never removed from the system — their purchases, watch history
 * and support tickets are business records — so "Blocked accounts" is a status
 * filter, not a separate store.
 */
export function StudentList() {
  const [tab, setTab] = useTabParam('active');
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const deleteAccount = useDeleteAccount();
  const toast = useToast();

  async function runDelete(reason: string) {
    if (!deleteTarget) return;
    try {
      await deleteAccount.mutateAsync({ userId: deleteTarget.id, reason });
      toast.success(
        'Student deleted',
        `${deleteTarget.fullName} can no longer sign in. Their history was kept.`,
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setDeleteTarget(null);
    }
  }

  const universities = useUniversities();
  const years = useAcademicYears();

  // The tab is the status filter. SUSPENDED is what "blocked" means in the
  // account model; DISABLED accounts are shown alongside them because to an
  // administrator both mean "cannot sign in".
  const statusQuery = tab === 'blocked' ? { status: 'SUSPENDED' } : { status: 'ACTIVE' };
  const query = { ...list.queryParams, ...statusQuery };

  const students = useStudents(query);

  const columns: Column<StudentRow>[] = [
    {
      key: 'student',
      header: 'Student',
      className: 'min-w-[15rem]',
      render: (student) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={student.fullName} src={student.avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => setOpenStudentId(student.id)}
              className="truncate text-start font-medium text-foreground hover:text-primary hover:underline"
            >
              {student.fullName}
            </button>
            <span className="truncate text-xs text-muted" dir="ltr">
              {formatPhone(student.phone)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'academic',
      header: 'University / college',
      secondary: true,
      render: (student) => (
        <div className="flex min-w-0 flex-col text-xs">
          <span className="truncate text-foreground">{student.university?.name ?? '—'}</span>
          <span className="truncate text-muted">{student.faculty?.name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'year',
      header: 'Year',
      secondary: true,
      render: (student) => (
        <span className="text-xs text-muted">{student.academicYear?.name ?? '—'}</span>
      ),
    },
    {
      key: 'gender',
      header: 'Gender',
      secondary: true,
      render: (student) => (
        <span className="text-xs text-muted capitalize">{student.gender.toLowerCase()}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (student) => <AccountStatusBadge status={student.status} />,
    },
    {
      key: 'createdAt',
      header: 'Registered',
      secondary: true,
      render: (student) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDate(student.createdAt)}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (student) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(student.lastLoginAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (student) => (
        <ActionMenu
          label={`Actions for ${student.fullName}`}
          items={[
            { label: 'Open', onSelect: () => setOpenStudentId(student.id) },
            { label: 'Delete student', danger: true, onSelect: () => setDeleteTarget(student) },
          ]}
        />
      ),
    },
  ];

  const exportColumns: ExportColumn<StudentRow>[] = [
    { header: 'Full name', key: 'name', width: 30, value: (row) => row.fullName },
    { header: 'Phone', key: 'phone', width: 16, value: (row) => row.phone },
    { header: 'Email', key: 'email', width: 26, value: (row) => row.email ?? '' },
    { header: 'Gender', key: 'gender', width: 10, value: (row) => row.gender },
    { header: 'Status', key: 'status', width: 12, value: (row) => row.status },
    {
      header: 'University',
      key: 'university',
      width: 26,
      value: (row) => row.university?.name ?? '',
    },
    { header: 'College', key: 'faculty', width: 26, value: (row) => row.faculty?.name ?? '' },
    {
      header: 'Department',
      key: 'department',
      width: 26,
      value: (row) => row.department?.name ?? '',
    },
    {
      header: 'Academic year',
      key: 'year',
      width: 18,
      value: (row) => row.academicYear?.name ?? '',
    },
    {
      header: 'Registered',
      key: 'createdAt',
      width: 20,
      value: (row) => asDate(row.createdAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Last login',
      key: 'lastLoginAt',
      width: 20,
      value: (row) => asDate(row.lastLoginAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description="Every student account on the platform. Blocked accounts keep all their records — blocking is a status, never a deletion."
      />

      <Tabs
        tabs={[
          { id: 'active', label: 'Student accounts' },
          { id: 'blocked', label: 'Blocked accounts' },
          { id: 'devices', label: 'Device requests' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'devices' ? <DeviceRequests /> : null}

      {tab === 'devices' ? null : (
        <DataTable
          columns={columns}
          rows={students.data?.items ?? []}
          rowKey={(student) => student.id}
          isLoading={students.isLoading}
          error={students.error}
          onRetry={() => void students.refetch()}
          meta={students.data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          onRowClick={(student) => setOpenStudentId(student.id)}
          caption={tab === 'blocked' ? 'Blocked students' : 'Students'}
          emptyTitle={
            tab === 'blocked'
              ? 'No blocked accounts'
              : list.isFiltered
                ? 'No students match these filters'
                : 'No students yet'
          }
          emptyDescription={
            tab === 'blocked'
              ? 'Accounts you block appear here and can be unblocked at any time.'
              : list.isFiltered
                ? 'Try widening the filters.'
                : 'Students appear here as soon as they register in the mobile app.'
          }
          toolbar={
            <FilterBar
              isFiltered={list.isFiltered}
              onClear={list.clear}
              actions={
                <ExportButton
                  filename={exportFilename(tab === 'blocked' ? 'blocked-students' : 'students')}
                  sheetName="Students"
                  title={tab === 'blocked' ? 'Blocked students' : 'Students'}
                  subtitle={
                    list.isFiltered
                      ? 'Reflects the filters applied on screen.'
                      : 'All students matching this tab.'
                  }
                  columns={exportColumns}
                  loadRows={(onProgress) =>
                    fetchAllPages<StudentRow>(
                      'admin/users',
                      { ...query, role: 'STUDENT' },
                      { onProgress },
                    )
                  }
                />
              }
            >
              <SearchInput
                value={list.q}
                onChange={list.setSearch}
                placeholder="Search name or phone…"
                label="Search students"
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
            </FilterBar>
          }
        />
      )}

      <StudentDrawer studentId={openStudentId} onClose={() => setOpenStudentId(null)} />

      <ReasonConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={(reason) => void runDelete(reason)}
        title={`Delete ${deleteTarget?.fullName ?? 'this student'}?`}
        message={
          <>
            <strong className="text-foreground">{deleteTarget?.fullName}</strong>
            {deleteTarget ? ` (${formatPhone(deleteTarget.phone)})` : ''} is signed out
            everywhere, can never sign in again and disappears from the dashboard; the phone
            number becomes free to register again. This is a soft delete — purchases,
            enrollments, wallet history and watch history are kept. To suspend reversibly, use
            Block instead.
          </>
        }
        confirmLabel="Delete student"
        busy={deleteAccount.isPending}
      />
    </div>
  );
}

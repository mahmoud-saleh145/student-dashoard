'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { AccountStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { ActionMenu } from '@/components/ui/action-menu';
import { ConfirmDialog, Modal, ReasonConfirmDialog } from '@/components/ui/overlay';
import { Avatar, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/lib/session-context';
import {
  useCreateTeacher,
  useResetPassword,
  useTeachers,
  useUpdateTeacher,
  useDeleteAccount,
} from '@/features/teachers/hooks';
import { fetchAllPages } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import {
  EXCEL_DATE_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDate, formatNumber, formatPhone } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { ACCOUNT_STATUSES, type TeacherRow } from '@/types/domain';

const FILTER_KEYS = ['status'] as const;

/**
 * Teacher accounts.
 *
 * Course and student counts come from the server in the same query as the
 * list, so this page costs one request rather than one per teacher.
 */
export function TeacherList() {
  const toast = useToast();
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const teachers = useTeachers(list.queryParams);

  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<TeacherRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<TeacherRow | null>(null);

  const updateTeacher = useUpdateTeacher();
  const deleteAccount = useDeleteAccount();
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null);
  const { isMaster, isAdmin } = useSession();

  async function runDelete(reason: string) {
    if (!deleteTarget) return;
    try {
      await deleteAccount.mutateAsync({ userId: deleteTarget.id, reason });
      toast.success(
        'Teacher deleted',
        `${deleteTarget.fullName} can no longer sign in. Their history was kept.`,
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function toggleStatus() {
    if (!statusTarget) return;

    const next = statusTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    try {
      await updateTeacher.mutateAsync({ id: statusTarget.id, status: next });
      toast.success(
        next === 'ACTIVE' ? 'Teacher reactivated' : 'Teacher deactivated',
        next === 'ACTIVE'
          ? 'They can sign in to the dashboard again.'
          : 'They are signed out and cannot sign in. Their courses and content are untouched.',
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setStatusTarget(null);
    }
  }

  const columns: Column<TeacherRow>[] = [
    {
      key: 'teacher',
      header: 'Teacher',
      className: 'min-w-[15rem]',
      render: (teacher) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={teacher.fullName} src={teacher.avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{teacher.fullName}</span>
            <span className="truncate text-xs text-muted" dir="ltr">
              {formatPhone(teacher.phone)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      secondary: true,
      render: (teacher) => (
        <span className="truncate text-xs text-muted">{teacher.email ?? '—'}</span>
      ),
    },
    {
      key: 'courses',
      header: 'Courses',
      align: 'end',
      render: (teacher) => (
        <span className="tabular-nums">
          {formatNumber(teacher.courseCount)}
          <span className="ms-1 text-xs text-muted">
            ({formatNumber(teacher.publishedCourseCount)} live)
          </span>
        </span>
      ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      render: (teacher) => (
        <span className="tabular-nums">{formatNumber(teacher.studentCount)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (teacher) => <AccountStatusBadge status={teacher.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      secondary: true,
      render: (teacher) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDate(teacher.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (teacher) => (
        <div className="flex justify-end gap-1.5">
          <ActionMenu
            label={`Actions for ${teacher.fullName}`}
            items={[
              { label: 'Set password', onSelect: () => setResetting(teacher) },
              {
                label: teacher.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate',
                onSelect: () => setStatusTarget(teacher),
              },
              ...(isAdmin || isMaster
                ? [
                    {
                      label: 'Delete teacher',
                      danger: true,
                      onSelect: () => setDeleteTarget(teacher),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const exportColumns: ExportColumn<TeacherRow>[] = [
    { header: 'Full name', key: 'name', width: 30, value: (row) => row.fullName },
    { header: 'Phone', key: 'phone', width: 16, value: (row) => row.phone },
    { header: 'Email', key: 'email', width: 26, value: (row) => row.email ?? '' },
    { header: 'Gender', key: 'gender', width: 10, value: (row) => row.gender },
    { header: 'Status', key: 'status', width: 12, value: (row) => row.status },
    { header: 'Courses', key: 'courses', width: 12, value: (row) => row.courseCount },
    {
      header: 'Published courses',
      key: 'published',
      width: 18,
      value: (row) => row.publishedCourseCount,
    },
    { header: 'Students', key: 'students', width: 12, value: (row) => row.studentCount },
    {
      header: 'Created',
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
        title="Teachers"
        description="Teacher accounts, their courses and their student totals."
        actions={<Button onClick={() => setCreating(true)}>Add teacher</Button>}
      />

      <DataTable
        columns={columns}
        rows={teachers.data?.items ?? []}
        rowKey={(teacher) => teacher.id}
        isLoading={teachers.isLoading}
        error={teachers.error}
        onRetry={() => void teachers.refetch()}
        meta={teachers.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        caption="Teachers"
        emptyTitle={list.isFiltered ? 'No teachers match these filters' : 'No teachers yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try a different status or search.'
            : 'Add a teacher to assign them courses.'
        }
        emptyAction={
          <Button size="sm" onClick={() => setCreating(true)}>
            Add teacher
          </Button>
        }
        toolbar={
          <FilterBar
            isFiltered={list.isFiltered}
            onClear={list.clear}
            actions={
              <ExportButton
                filename={exportFilename('teachers')}
                sheetName="Teachers"
                title="Teachers"
                columns={exportColumns}
                loadRows={(onProgress) =>
                  fetchAllPages<TeacherRow>('admin/users/teachers', list.queryParams, {
                    onProgress,
                  })
                }
              />
            }
          >
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search teachers…"
              label="Search teachers"
            />

            <FilterSelect
              label="Status"
              placeholder="Any status"
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={ACCOUNT_STATUSES.map((status) => ({
                value: status,
                label: status.toLowerCase(),
              }))}
            />
          </FilterBar>
        }
      />

      <CreateTeacherDialog open={creating} onClose={() => setCreating(false)} />

      <SetPasswordDialog teacher={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={statusTarget !== null}
        onCancel={() => setStatusTarget(null)}
        onConfirm={toggleStatus}
        title={
          statusTarget?.status === 'ACTIVE'
            ? 'Deactivate this teacher?'
            : 'Reactivate this teacher?'
        }
        message={
          statusTarget?.status === 'ACTIVE' ? (
            <>
              <strong className="text-foreground">{statusTarget?.fullName}</strong> is signed
              out and can no longer sign in. Their courses stay published and their students
              keep their access — nothing about the content changes.
            </>
          ) : (
            <>They will be able to sign in to the dashboard again.</>
          )
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        variant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        busy={updateTeacher.isPending}
      />

      <ReasonConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={(reason) => void runDelete(reason)}
        title={`Delete ${deleteTarget?.fullName ?? 'this teacher'}?`}
        message={
          <>
            <strong className="text-foreground">{deleteTarget?.fullName}</strong>
            {deleteTarget?.phone ? ` (${deleteTarget.phone})` : ''} is signed out and can never
            sign in again; the account disappears from the dashboard. This is a soft delete:
            revenue shares, course history and audit records are kept. A teacher who is the only
            teacher on an active course cannot be deleted until another is assigned.
          </>
        }
        confirmLabel="Delete teacher"
        busy={deleteAccount.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Enter the full name').max(120),
    phone: z
      .string()
      .trim()
      .refine(
        (value) => /^(?:\+?20|0020|0)?1[0125]\d{8}$/.test(value.replace(/[\s()-]/g, '')),
        {
          message: 'Enter a valid Egyptian mobile number',
        },
      ),
    email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE']).optional().or(z.literal('')),
    title: z.string().trim().max(120).optional().or(z.literal('')),
    password: z.string().min(8, 'At least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  });

type CreateValues = z.input<typeof createSchema>;

function CreateTeacherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const createTeacher = useCreateTeacher();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: '', phone: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: CreateValues) {
    try {
      const parsed = createSchema.parse(values);

      await createTeacher.mutateAsync({
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email || undefined,
        password: parsed.password,
        gender: parsed.gender || undefined,
        title: parsed.title || undefined,
      });

      toast.success('Teacher added', 'They can sign in to the dashboard with this password.');
      reset();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          setError(field as keyof CreateValues, { message: messages[0] });
        }
        return;
      }
      toast.error(error, 'The teacher was not created');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add teacher"
      description="The phone number is the account's identifier and must be unique across the platform."
      size="lg"
      busy={createTeacher.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createTeacher.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={createTeacher.isPending}>
            Add teacher
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Full name" error={errors.fullName?.message} required>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              {...register('fullName')}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errors.phone?.message} required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                dir="ltr"
                inputMode="tel"
                placeholder="01XXXXXXXXX"
                aria-describedby={describedBy}
                invalid={invalid}
                {...register('phone')}
              />
            )}
          </Field>

          <Field label="Email" error={errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="email"
                dir="ltr"
                aria-describedby={describedBy}
                invalid={invalid}
                {...register('email')}
              />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gender">
            {({ id }) => (
              <Select
                id={id}
                placeholder="Not set"
                options={[
                  { value: 'MALE', label: 'Male' },
                  { value: 'FEMALE', label: 'Female' },
                ]}
                {...register('gender')}
              />
            )}
          </Field>

          <Field label="Title" hint="Optional, e.g. “Dr”.">
            {({ id }) => <TextInput id={id} {...register('title')} />}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password?.message} required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                {...register('password')}
              />
            )}
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword?.message} required>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                {...register('confirmPassword')}
              />
            )}
          </Field>
        </div>

        <p className="rounded-lg border border-border bg-surface-alt p-3 text-xs text-muted">
          Give this password to the teacher directly. It is hashed the moment it reaches the
          server and can never be read back — if it is lost, set a new one.
        </p>
      </form>
    </Modal>
  );
}

function SetPasswordDialog({
  teacher,
  onClose,
}: {
  teacher: TeacherRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit() {
    if (!teacher || !valid) return;

    try {
      await resetPassword.mutateAsync({ userId: teacher.id, newPassword: password });
      toast.success('Password set', 'Every session for this account was revoked.');
      setPassword('');
      setConfirm('');
      onClose();
    } catch (error) {
      toast.error(error, 'The password was not changed');
    }
  }

  return (
    <Modal
      open={teacher !== null}
      onClose={onClose}
      title="Set a new password"
      description={teacher ? `For ${teacher.fullName}` : undefined}
      busy={resetPassword.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={resetPassword.isPending} disabled={!valid}>
            Set password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="New password" required hint="At least 8 characters.">
          {({ id }) => (
            <TextInput
              id={id}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          )}
        </Field>

        <Field
          label="Confirm password"
          required
          error={mismatch ? 'The passwords do not match' : null}
        >
          {({ id, invalid }) => (
            <TextInput
              id={id}
              type="password"
              autoComplete="new-password"
              invalid={invalid}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </Field>

        <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
          This signs the account out of every device immediately. The existing password is never
          shown — it is stored only as a one-way hash.
        </p>
      </div>
    </Modal>
  );
}

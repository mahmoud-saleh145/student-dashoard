'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DataTable, type Column } from '@/components/data/data-table';
import { SearchInput } from '@/components/data/filters';
import { AccountStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Avatar, Badge, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useResetPassword } from '@/features/teachers/hooks';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import { formatDateTime, formatPhone } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useSession } from '@/lib/session-context';
import { useListQuery } from '@/lib/use-list-query';
import type { AdminUser } from '@/types/domain';

/**
 * Admin accounts.
 *
 * Master-only, and the backend agrees: `POST /admin/users` refuses to create an
 * ADMIN unless the caller is the master, and refuses to create a MASTER at all.
 * There is no endpoint anywhere in the API that creates or modifies the master
 * account — it exists only through `scripts/create-master.ts`, run by hand
 * against the database.
 *
 * That is why this screen shows the master but offers no action on it.
 */
export function AdminAccounts() {
  const { isMaster } = useSession();
  const list = useListQuery({});

  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const admins = useQuery({
    queryKey: queryKeys.admins.list(list.queryParams),
    queryFn: () =>
      api.page<AdminUser>('admin/users', {
        query: { ...list.queryParams, role: 'ADMIN' },
      }),
    placeholderData: (previous) => previous,
  });

  const masters = useQuery({
    queryKey: queryKeys.admins.list({ role: 'MASTER' }),
    queryFn: () =>
      api.page<AdminUser>('admin/users', { query: { role: 'MASTER', page: 1, pageSize: 5 } }),
  });

  // The master is shown at the top of the same table, so the page answers
  // "who can administer this platform" completely rather than omitting the
  // one account with the most authority.
  const rows = [...(masters.data?.items ?? []), ...(admins.data?.items ?? [])];

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Account name',
      className: 'min-w-[14rem]',
      render: (admin) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={admin.fullName} src={admin.avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{admin.fullName}</span>
            <span className="truncate text-xs text-muted" dir="ltr">
              {formatPhone(admin.phone)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Account type',
      render: (admin) =>
        admin.role === 'MASTER' ? (
          <Badge tone="primary" dot>
            Master admin
          </Badge>
        ) : (
          <Badge tone="neutral">Admin</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (admin) => <AccountStatusBadge status={admin.status} />,
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      secondary: true,
      render: (admin) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(admin.lastLoginAt)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (admin) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(admin.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (admin) =>
        admin.role === 'MASTER' ? (
          <span className="text-xs text-muted">Managed out of band</span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setResetting(admin)}>
            Set password
          </Button>
        ),
    },
  ];

  if (!isMaster) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Admin accounts" />
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Only the master admin can manage administrator accounts
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            This is enforced by the API, not just by this screen: creating or changing an
            administrator is refused for any other role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin accounts"
        description="Administrators who can manage the platform. Only the master admin can add or change them."
        actions={<Button onClick={() => setCreating(true)}>Add admin</Button>}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(admin) => admin.id}
        isLoading={admins.isLoading || masters.isLoading}
        error={admins.error}
        onRetry={() => void admins.refetch()}
        meta={admins.data?.meta}
        onPageChange={list.setPage}
        caption="Administrator accounts"
        emptyTitle="No administrators yet"
        emptyDescription="Add an admin to share day-to-day operational work."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search admins…"
              label="Search admin accounts"
            />
          </div>
        }
      />

      <CreateAdminDialog open={creating} onClose={() => setCreating(false)} />

      <SetAdminPasswordDialog admin={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

const schema = z
  .object({
    fullName: z.string().trim().min(3, 'Enter the account name').max(120),
    phone: z
      .string()
      .trim()
      .refine((value) => /^(?:\+?20|0020|0)?1[0125]\d{8}$/.test(value.replace(/[\s()-]/g, '')), {
        message: 'Enter a valid Egyptian mobile number',
      }),
    email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
    password: z.string().min(8, 'At least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.input<typeof schema>;

function CreateAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    try {
      const parsed = schema.parse(values);

      await api.post('admin/users', {
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email || undefined,
        password: parsed.password,
        role: 'ADMIN',
      });

      toast.success('Admin added', 'They can sign in to the dashboard with this password.');
      reset();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
        return;
      }
      toast.error(error, 'The admin was not created');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add administrator"
      description="Regular admins get every operational permission except managing admin accounts."
      size="lg"
      busy={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            Add admin
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Account name" error={errors.fullName?.message} required>
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
          <Field
            label="Username (phone)"
            error={errors.phone?.message}
            hint="The phone number is the sign-in identifier."
            required
          >
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

        <Field label="Account type">
          {({ id }) => (
            <Select
              id={id}
              disabled
              value="ADMIN"
              options={[{ value: 'ADMIN', label: 'Admin' }]}
            />
          )}
        </Field>

        <p className="rounded-lg border border-border bg-surface-alt p-3 text-xs text-muted">
          There is only one master admin, and it cannot be created here — the API has no endpoint
          for it at all. It is provisioned directly against the database by the platform owner.
        </p>
      </form>
    </Modal>
  );
}

function SetAdminPasswordDialog({
  admin,
  onClose,
}: {
  admin: AdminUser | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit() {
    if (!admin || !valid) return;

    try {
      await resetPassword.mutateAsync({ userId: admin.id, newPassword: password });
      toast.success('Password set', 'Every session for that account was revoked.');
      setPassword('');
      setConfirm('');
      onClose();
    } catch (error) {
      toast.error(error, 'The password was not changed');
    }
  }

  return (
    <Modal
      open={admin !== null}
      onClose={onClose}
      title="Set a new password"
      description={admin ? `For ${admin.fullName}` : undefined}
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
      </div>
    </Modal>
  );
}

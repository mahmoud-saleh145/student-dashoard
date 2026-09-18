'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, SearchInput } from '@/components/data/filters';
import { Drawer } from '@/components/ui/overlay';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/tabs';
import { api, fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDateTime, formatPhone } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useListQuery } from '@/lib/use-list-query';
import type { AuditLogRow, LoginLogRow } from '@/types/domain';

/**
 * Logs.
 *
 * Both tabs read append-only records. The audit trail has no update or delete
 * path anywhere in the API — not for admins, not for the master — which is the
 * property that makes it worth having at all. The login log is read from the
 * security-event stream the auth path already writes, so there is no second
 * log that could drift out of step with it.
 */
export function LogsView() {
  const [tab, setTab] = useTabParam('actions');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Logs"
        description="Administrative actions and student sign-ins. Both are append-only: there is no way to edit or remove an entry."
      />

      <Tabs
        tabs={[
          { id: 'actions', label: 'Admin action log' },
          { id: 'logins', label: 'Login log' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel id="actions" active={tab}>
        <AuditLogPanel />
      </TabPanel>

      <TabPanel id="logins" active={tab}>
        <LoginLogPanel />
      </TabPanel>
    </div>
  );
}

function AuditLogPanel() {
  const list = useListQuery({ filterKeys: ['entity', 'action'] });
  const [inspecting, setInspecting] = useState<AuditLogRow | null>(null);

  const logs = useQuery({
    queryKey: queryKeys.logs.audit(list.queryParams),
    queryFn: () => api.page<AuditLogRow>('audit', { query: list.queryParams }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'actor',
      header: 'Admin',
      className: 'min-w-[12rem]',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {row.actor?.fullName ?? 'System'}
          </span>
          <span className="text-xs text-muted">{row.actor?.role.toLowerCase() ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge tone={toneForAction(row.action)}>
          {row.action.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-foreground">{row.entity}</span>
          {row.entityId ? (
            <span className="truncate font-mono text-xs text-muted">{row.entityId}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      secondary: true,
      render: (row) => (
        <span className="line-clamp-2 text-xs text-muted">{row.note ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (row) => (
        <button
          type="button"
          onClick={() => setInspecting(row)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Details
        </button>
      ),
    },
  ];

  const exportColumns: ExportColumn<AuditLogRow>[] = [
    { header: 'Admin', key: 'actor', width: 26, value: (row) => row.actor?.fullName ?? 'System' },
    { header: 'Role', key: 'role', width: 12, value: (row) => row.actor?.role ?? '' },
    { header: 'Action', key: 'action', width: 20, value: (row) => row.action },
    { header: 'Entity', key: 'entity', width: 20, value: (row) => row.entity },
    { header: 'Entity id', key: 'entityId', width: 28, value: (row) => row.entityId ?? '' },
    { header: 'Note', key: 'note', width: 40, value: (row) => row.note ?? '' },
    { header: 'IP', key: 'ip', width: 18, value: (row) => row.ipAddress ?? '' },
    {
      header: 'When',
      key: 'createdAt',
      width: 20,
      value: (row) => asDate(row.createdAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={logs.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={logs.isLoading}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        meta={logs.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        caption="Administrative action log"
        emptyTitle={list.isFiltered ? 'No entries match this search' : 'No entries yet'}
        emptyDescription="Every administrative change is recorded here automatically."
        toolbar={
          <FilterBar
            isFiltered={list.isFiltered}
            onClear={list.clear}
            actions={
              <ExportButton
                filename={exportFilename('admin-action-log')}
                sheetName="Actions"
                title="Administrative action log"
                columns={exportColumns}
                loadRows={(onProgress) =>
                  fetchAllPages<AuditLogRow>('audit', list.queryParams, {
                    onProgress,
                    maxRows: 5000,
                  })
                }
              />
            }
          >
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search admin, entity or note…"
              label="Search the action log"
            />
          </FilterBar>
        }
      />

      <Drawer
        open={inspecting !== null}
        onClose={() => setInspecting(null)}
        title={inspecting?.action.replace(/_/g, ' ') ?? 'Entry'}
        description={
          inspecting
            ? `${inspecting.entity}${inspecting.entityId ? ` · ${inspecting.entityId}` : ''}`
            : undefined
        }
      >
        {inspecting ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted uppercase">Admin</dt>
                <dd className="mt-1 text-foreground">
                  {inspecting.actor?.fullName ?? 'System'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted uppercase">When</dt>
                <dd className="mt-1 text-foreground">{formatDateTime(inspecting.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted uppercase">IP address</dt>
                <dd className="mt-1 text-foreground" dir="ltr">
                  {inspecting.ipAddress ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted uppercase">Note</dt>
                <dd className="mt-1 text-foreground">{inspecting.note ?? '—'}</dd>
              </div>
            </dl>

            <ValueBlock title="Before" value={inspecting.before} />
            <ValueBlock title="After" value={inspecting.after} />

            <p className="text-xs text-muted">
              Snapshots are redacted before storage — passwords, tokens and signatures are
              stripped rather than trusted not to be passed in.
            </p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function ValueBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted">Not recorded.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
      <pre className="table-scroll max-h-56 rounded-lg border border-border bg-surface-alt p-3 text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function LoginLogPanel() {
  const list = useListQuery({});

  const logs = useQuery({
    queryKey: queryKeys.logs.logins(list.queryParams),
    queryFn: () => api.page<LoginLogRow>('audit/logins', { query: list.queryParams }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<LoginLogRow>[] = [
    {
      key: 'student',
      header: 'Student',
      className: 'min-w-[14rem]',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {row.student?.fullName ?? 'Unknown'}
          </span>
          <span className="truncate text-xs text-muted" dir="ltr">
            {row.student ? formatPhone(row.student.phone) : '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Device',
      render: (row) => (
        <div className="flex min-w-0 flex-col text-xs">
          <span className="text-foreground capitalize">{row.platform ?? 'Unknown'}</span>
          <span className="truncate text-muted">{row.model ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP address',
      secondary: true,
      render: (row) => (
        <span className="font-mono text-xs text-muted" dir="ltr">
          {row.ipAddress ?? '—'}
        </span>
      ),
    },
    {
      key: 'year',
      header: 'Academic year',
      secondary: true,
      render: (row) => (
        <span className="text-xs text-muted">{row.student?.academicYear?.name ?? '—'}</span>
      ),
    },
    {
      key: 'occurredAt',
      header: 'Signed in',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.occurredAt)}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<LoginLogRow>[] = [
    { header: 'Student', key: 'name', width: 30, value: (row) => row.student?.fullName ?? '' },
    { header: 'Phone', key: 'phone', width: 16, value: (row) => row.student?.phone ?? '' },
    { header: 'Platform', key: 'platform', width: 14, value: (row) => row.platform ?? '' },
    { header: 'Model', key: 'model', width: 20, value: (row) => row.model ?? '' },
    { header: 'IP', key: 'ip', width: 18, value: (row) => row.ipAddress ?? '' },
    {
      header: 'University',
      key: 'university',
      width: 26,
      value: (row) => row.student?.university?.name ?? '',
    },
    {
      header: 'Academic year',
      key: 'year',
      width: 18,
      value: (row) => row.student?.academicYear?.name ?? '',
    },
    {
      header: 'Registered',
      key: 'registeredAt',
      width: 20,
      value: (row) => asDate(row.student?.registeredAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Signed in',
      key: 'occurredAt',
      width: 20,
      value: (row) => asDate(row.occurredAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={logs.data?.items ?? []}
      rowKey={(row) => row.id}
      isLoading={logs.isLoading}
      error={logs.error}
      onRetry={() => void logs.refetch()}
      meta={logs.data?.meta}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      caption="Student login log"
      emptyTitle={list.isFiltered ? 'No sign-ins match this search' : 'No sign-ins recorded yet'}
      emptyDescription="Successful student sign-ins are recorded automatically."
      toolbar={
        <FilterBar
          isFiltered={list.isFiltered}
          onClear={list.clear}
          actions={
            <ExportButton
              filename={exportFilename('login-log')}
              sheetName="Logins"
              title="Student login log"
              columns={exportColumns}
              loadRows={(onProgress) =>
                fetchAllPages<LoginLogRow>('audit/logins', list.queryParams, {
                  onProgress,
                  maxRows: 5000,
                })
              }
            />
          }
        >
          <SearchInput
            value={list.q}
            onChange={list.setSearch}
            placeholder="Search name or phone…"
            label="Search the login log"
          />
        </FilterBar>
      }
    />
  );
}

function toneForAction(action: string) {
  if (action.includes('DELETE') || action.includes('REVOKE') || action === 'ARCHIVE') {
    return 'danger' as const;
  }
  if (action.includes('CREATE') || action.includes('GRANT') || action === 'PUBLISH') {
    return 'success' as const;
  }
  if (action.includes('PASSWORD') || action.includes('ROLE') || action === 'SETTINGS_CHANGE') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

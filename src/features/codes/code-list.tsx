'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { CodeStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import { Drawer, Modal } from '@/components/ui/overlay';
import { Badge, DescriptionList, PageHeader } from '@/components/ui/primitives';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { GenerateCodesDialog } from '@/features/codes/generate-codes-dialog';
import { useCodeRedemptions, useCodes, useRevokeCode } from '@/features/codes/hooks';
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
import {
  CODE_STATUSES,
  CODE_STATUS_LABEL,
  CODE_TARGET_TYPES,
  CODE_TARGET_TYPE_LABEL,
  type CodeRow,
} from '@/types/domain';

const FILTER_KEYS = ['status', 'targetType', 'courseId'] as const;

/**
 * Access codes.
 *
 * Codes are **masked in the table**. The full value is what the card is worth,
 * and a list of hundreds of them on a shared screen is the easiest way to
 * leak a batch. Revealing one is a deliberate act: open the code, or copy it.
 *
 * Status wording follows what operators say rather than the enum: the database
 * records EXHAUSTED and REVOKED, the screen says "Used" and "Cancelled". The
 * mapping lives in one place so a filter and a badge cannot disagree.
 */
export function CodeList() {
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const codes = useCodes(list.queryParams);

  const [generating, setGenerating] = useState(false);
  const [inspecting, setInspecting] = useState<CodeRow | null>(null);
  const [revoking, setRevoking] = useState<CodeRow | null>(null);

  const columns: Column<CodeRow>[] = [
    {
      key: 'serial',
      header: '#',
      align: 'end',
      className: 'w-14',
      render: (code) => <span className="tabular-nums text-muted">{code.serial}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      render: (code) => (
        <button
          type="button"
          onClick={() => setInspecting(code)}
          className="font-mono text-sm tracking-wider text-foreground hover:text-primary hover:underline"
          title="Open to see the full code"
        >
          {maskCode(code.code)}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (code) => <CodeStatusBadge status={code.status} />,
    },
    {
      key: 'target',
      header: 'Target',
      className: 'min-w-[14rem]',
      render: (code) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-foreground">{code.targetName}</span>
          <Badge tone={code.targetType === 'PART' ? 'info' : 'neutral'} className="mt-1 w-fit">
            {CODE_TARGET_TYPE_LABEL[code.targetType]}
          </Badge>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (code) => (
        <span className="tabular-nums">
          {code.amount === null ? '—' : formatMoney(code.amount, code.currency)}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      secondary: true,
      render: (code) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {code.expiresAt ? formatDateTime(code.expiresAt) : 'No expiry'}
        </span>
      ),
    },
    {
      key: 'issuedBy',
      header: 'Created by',
      secondary: true,
      render: (code) => (
        <span className="truncate text-xs text-muted">{code.issuedBy?.fullName ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      secondary: true,
      render: (code) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(code.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (code) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setInspecting(code)}>
            View
          </Button>
          {code.status === 'ACTIVE' ? (
            <Button size="sm" variant="ghost" onClick={() => setRevoking(code)}>
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const exportColumns: ExportColumn<CodeRow>[] = [
    { header: '#', key: 'serial', width: 8, value: (row) => row.serial },
    { header: 'Code', key: 'code', width: 22, value: (row) => row.code },
    { header: 'Status', key: 'status', width: 14, value: (row) => CODE_STATUS_LABEL[row.status] },
    { header: 'Target type', key: 'targetType', width: 14, value: (row) => row.targetType },
    { header: 'Target', key: 'target', width: 34, value: (row) => row.targetName },
    { header: 'Batch', key: 'batch', width: 24, value: (row) => row.batchName ?? '' },
    {
      header: 'Amount',
      key: 'amount',
      width: 12,
      value: (row) => row.amount,
      format: EXCEL_MONEY_FORMAT,
    },
    { header: 'Currency', key: 'currency', width: 10, value: (row) => row.currency },
    { header: 'Uses', key: 'uses', width: 10, value: (row) => row.redemptionCount },
    { header: 'Max uses', key: 'maxUses', width: 12, value: (row) => row.maxRedemptions },
    {
      header: 'Expires',
      key: 'expiresAt',
      width: 20,
      value: (row) => asDate(row.expiresAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Created by',
      key: 'issuedBy',
      width: 26,
      value: (row) => row.issuedBy?.fullName ?? '',
    },
    {
      header: 'Created',
      key: 'createdAt',
      width: 20,
      value: (row) => asDate(row.createdAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Codes"
        description="Every access card generated for the platform. Codes are masked here — open one to reveal or copy it."
        actions={<Button onClick={() => setGenerating(true)}>Generate codes</Button>}
      />

      <DataTable
        columns={columns}
        rows={codes.data?.items ?? []}
        rowKey={(code) => code.id}
        isLoading={codes.isLoading}
        error={codes.error}
        onRetry={() => void codes.refetch()}
        meta={codes.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        caption="Access codes"
        emptyTitle={list.isFiltered ? 'No codes match these filters' : 'No codes generated yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try a different status or target.'
            : 'Generate a batch to sell access to a course, one of its parts, a section, or a teacher’s whole catalogue.'
        }
        emptyAction={
          <Button size="sm" onClick={() => setGenerating(true)}>
            Generate codes
          </Button>
        }
        toolbar={
          <FilterBar
            isFiltered={list.isFiltered}
            onClear={list.clear}
            actions={
              <ExportButton
                filename={exportFilename('codes')}
                sheetName="Codes"
                title="Access codes"
                subtitle="Full code values — treat this file as sensitive."
                columns={exportColumns}
                loadRows={(onProgress) =>
                  fetchAllPages<CodeRow>('admin/codes', list.queryParams, { onProgress })
                }
              />
            }
          >
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search by code…"
              label="Search codes"
            />

            <FilterSelect
              label="Status"
              placeholder="Any status"
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={CODE_STATUSES.map((status) => ({
                value: status,
                label: CODE_STATUS_LABEL[status],
              }))}
            />

            <FilterSelect
              label="Target type"
              placeholder="Any target"
              value={list.filters.targetType ?? ''}
              onChange={(value) => list.setFilter('targetType', value)}
              options={CODE_TARGET_TYPES.map((type) => ({
                value: type,
                label: CODE_TARGET_TYPE_LABEL[type],
              }))}
            />
          </FilterBar>
        }
      />

      <GenerateCodesDialog open={generating} onClose={() => setGenerating(false)} />

      <CodeDrawer code={inspecting} onClose={() => setInspecting(null)} />

      <RevokeCodeDialog code={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}

function CodeDrawer({ code, onClose }: { code: CodeRow | null; onClose: () => void }) {
  const toast = useToast();
  const redemptions = useCodeRedemptions(code?.id ?? null);
  const [revealed, setRevealed] = useState(false);

  async function copy() {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code.code);
      toast.success('Code copied');
    } catch {
      // Clipboard access can be refused (an insecure origin, a browser
      // setting). Revealing the code is the useful fallback — the operator can
      // still read it out.
      setRevealed(true);
      toast.push({
        tone: 'info',
        title: 'Could not copy automatically',
        description: 'The code is shown below so you can copy it by hand.',
      });
    }
  }

  return (
    <Drawer
      open={code !== null}
      onClose={() => {
        setRevealed(false);
        onClose();
      }}
      title="Access code"
      description={code?.targetName}
      footer={
        code ? (
          <>
            <Button variant="secondary" onClick={() => setRevealed((value) => !value)}>
              {revealed ? 'Hide code' : 'Reveal code'}
            </Button>
            <Button onClick={copy}>Copy code</Button>
          </>
        ) : null
      }
    >
      {code ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-surface-alt p-4 text-center">
            <p className="font-mono text-xl tracking-[0.2em] break-all text-foreground">
              {revealed ? code.code : maskCode(code.code)}
            </p>
            {!revealed ? (
              <p className="mt-2 text-xs text-muted">
                Hidden by default so a shared screen does not leak it.
              </p>
            ) : null}
          </div>

          <DescriptionList
            columns={2}
            items={[
              { label: 'Status', value: <CodeStatusBadge status={code.status} /> },
              {
                label: 'Target type',
                value: CODE_TARGET_TYPE_LABEL[code.targetType],
              },
              { label: 'Target', value: code.targetName },
              ...(code.coursePart
                ? [{ label: 'Part', value: code.coursePart.title }]
                : []),
              {
                label: 'Amount',
                value: code.amount === null ? '—' : formatMoney(code.amount, code.currency),
              },
              { label: 'Uses', value: `${code.redemptionCount} of ${code.maxRedemptions}` },
              {
                label: 'Expires',
                value: code.expiresAt ? formatDateTime(code.expiresAt) : 'No expiry',
              },
              { label: 'Batch', value: code.batchName ?? code.batchId ?? '—' },
              { label: 'Created by', value: code.issuedBy?.fullName ?? '—' },
              { label: 'Created', value: formatDateTime(code.createdAt) },
            ]}
          />

          <div>
            <h3 className="mb-2 border-b border-border pb-2 text-sm font-semibold text-foreground">
              Usage
            </h3>

            {redemptions.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (redemptions.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="Not redeemed yet"
                description="When a student uses this code, they appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {redemptions.data?.items.map((redemption) => (
                  <li key={redemption.id} className="flex flex-wrap gap-2 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {redemption.user.fullName}
                      </p>
                      <p className="text-xs text-muted" dir="ltr">
                        {formatPhone(redemption.user.phone)}
                      </p>
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted">
                      {formatDateTime(redemption.redeemedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function RevokeCodeDialog({ code, onClose }: { code: CodeRow | null; onClose: () => void }) {
  const toast = useToast();
  const revoke = useRevokeCode();
  const [reason, setReason] = useState('');

  async function submit() {
    if (!code || reason.trim().length < 3) return;

    try {
      await revoke.mutateAsync({ codeId: code.id, reason: reason.trim() });
      toast.success('Code cancelled', 'Students who already used it keep their access.');
      setReason('');
      onClose();
    } catch (error) {
      toast.error(error, 'The code was not cancelled');
    }
  }

  return (
    <Modal
      open={code !== null}
      onClose={onClose}
      title="Cancel this code?"
      size="sm"
      busy={revoke.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={revoke.isPending}
            disabled={reason.trim().length < 3}
          >
            Cancel code
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          The code stops working from now on. A student who has{' '}
          <strong className="text-foreground">already redeemed it keeps their access</strong> —
          cancelling stops future use, it does not claw back a grant that was legitimate when it
          was made.
        </p>

        <Field label="Reason" required hint="Recorded in the audit log.">
          {({ id }) => (
            <TextArea
              id={id}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

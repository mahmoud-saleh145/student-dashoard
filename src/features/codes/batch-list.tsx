'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { GenerateCodesDialog } from '@/features/codes/generate-codes-dialog';
import { useCodeBatches, type BatchCodesResponse } from '@/features/codes/hooks';
import { api } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
  exportToExcel,
} from '@/lib/export-excel';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { CODE_TARGET_TYPES, type CodeBatchRow } from '@/types/domain';

const FILTER_KEYS = ['targetType'] as const;

/**
 * Code batch generation.
 *
 * One row per generation run. The target name is a snapshot taken when the
 * batch was created, so a batch still reads correctly after the course it was
 * for has been renamed or archived — which is exactly when someone goes
 * looking for it.
 *
 * Exporting a batch fetches all of its cards in one unpaginated request: a
 * half-exported batch of printed cards is indistinguishable from cards that
 * were never made.
 */
export function BatchList() {
  const toast = useToast();
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const batches = useCodeBatches(list.queryParams);

  const [generating, setGenerating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  async function exportBatch(batch: CodeBatchRow) {
    setExportingId(batch.id);

    try {
      const data = await api.get<BatchCodesResponse>(
        `admin/code-batches/${batch.id}/codes`,
      );

      await exportToExcel({
        filename: exportFilename(batch.name ?? `${batch.targetName}-batch`),
        sheetName: 'Codes',
        title: `${batch.targetName} — ${batch.name ?? 'access codes'}`,
        subtitle: `${data.codes.length} cards · ${batch.targetType.toLowerCase()} scope · created ${formatDateTime(batch.createdAt)}`,
        columns: [
          { header: 'Code', key: 'code', width: 24, value: (row) => row.code },
          { header: 'Status', key: 'status', width: 14, value: (row) => row.status },
          {
            header: 'Amount',
            key: 'amount',
            width: 12,
            value: (row) => row.amount,
            format: EXCEL_MONEY_FORMAT,
          },
          { header: 'Currency', key: 'currency', width: 10, value: (row) => row.currency },
          { header: 'Uses', key: 'uses', width: 10, value: (row) => row.redemptionCount },
          {
            header: 'Expires',
            key: 'expiresAt',
            width: 18,
            value: (row) => asDate(row.expiresAt),
            format: EXCEL_DATE_FORMAT,
          },
        ],
        rows: data.codes,
      });

      toast.success('Batch exported', `${data.codes.length} cards downloaded.`);
    } catch (error) {
      toast.error(error, 'The batch could not be exported');
    } finally {
      setExportingId(null);
    }
  }

  const columns: Column<CodeBatchRow>[] = [
    {
      key: 'name',
      header: 'Batch',
      className: 'min-w-[14rem]',
      render: (batch) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {batch.name ?? `Batch ${batch.id.slice(0, 8)}`}
          </span>
          {batch.prefix ? (
            <span className="font-mono text-xs text-muted">prefix {batch.prefix}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'targetType',
      header: 'Target category',
      render: (batch) => <Badge tone="neutral">{batch.targetType.toLowerCase()}</Badge>,
    },
    {
      key: 'targetName',
      header: 'Target name',
      className: 'min-w-[14rem]',
      render: (batch) => <span className="truncate">{batch.targetName}</span>,
    },
    {
      key: 'cards',
      header: 'Cards',
      align: 'end',
      render: (batch) => (
        <span className="tabular-nums">
          {formatNumber(batch.cardCount)}
          {batch.cardCount !== batch.quantity ? (
            <span className="ms-1 text-xs text-muted">of {formatNumber(batch.quantity)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Price',
      align: 'end',
      secondary: true,
      render: (batch) => (
        <span className="tabular-nums text-muted">
          {batch.amount === null ? '—' : formatMoney(batch.amount, batch.currency)}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Created by',
      secondary: true,
      render: (batch) => (
        <span className="truncate text-xs text-muted">{batch.createdBy?.fullName ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (batch) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(batch.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      render: (batch) => (
        <Button
          size="sm"
          variant="secondary"
          loading={exportingId === batch.id}
          onClick={() => void exportBatch(batch)}
        >
          Export Excel
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Code batch generation"
        description="Every batch of cards ever generated, with the target frozen as it was at creation."
        actions={<Button onClick={() => setGenerating(true)}>Generate batch</Button>}
      />

      <DataTable
        columns={columns}
        rows={batches.data?.items ?? []}
        rowKey={(batch) => batch.id}
        isLoading={batches.isLoading}
        error={batches.error}
        onRetry={() => void batches.refetch()}
        meta={batches.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        caption="Code batches"
        emptyTitle={list.isFiltered ? 'No batches match this search' : 'No batches yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try a different name or target category.'
            : 'Generating codes creates a batch, which you can re-export at any time.'
        }
        emptyAction={
          <Button size="sm" onClick={() => setGenerating(true)}>
            Generate batch
          </Button>
        }
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search batch or target…"
              label="Search batches"
            />

            <FilterSelect
              label="Target category"
              placeholder="Any category"
              value={list.filters.targetType ?? ''}
              onChange={(value) => list.setFilter('targetType', value)}
              options={CODE_TARGET_TYPES.map((type) => ({
                value: type,
                label: type.toLowerCase(),
              }))}
            />
          </FilterBar>
        }
      />

      <GenerateCodesDialog open={generating} onClose={() => setGenerating(false)} />
    </div>
  );
}

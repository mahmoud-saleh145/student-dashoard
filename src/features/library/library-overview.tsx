'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { DateRangeFilter, FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { ExportButton } from '@/components/data/export-button';
import { ContentStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader, StatTile } from '@/components/ui/primitives';
import { CardsSkeleton } from '@/components/ui/states';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/tabs';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
} from '@/lib/export-excel';
import { endOfDayIso, formatDateTime, formatMoney, formatPhone, startOfDayIso } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { CONTENT_STATUSES } from '@/types/domain';
import type { LibraryMaterialRow, LibraryPurchaseRow } from '@/types/commerce';

import { MaterialDialog } from './library-dialogs';
import { useLibraryMaterials, useLibraryPurchases } from './hooks';

/**
 * The Library catalogue.
 *
 * A separate top-level system from courses, in both directions: a student may
 * buy here while enrolled in nothing, and owning every course grants nothing
 * here. The one thing it shares with the rest of the platform is the wallet,
 * and the wallet exists for this.
 */
export function LibraryOverview() {
  const [tab, setTab] = useTabParam('materials');
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Library"
        description="Documents sold for wallet credit. Independent of courses in both directions."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Library' }]}
        actions={<Button onClick={() => setCreating(true)}>New material</Button>}
      />

      <Tabs
        tabs={[
          { id: 'materials', label: 'Materials' },
          { id: 'purchases', label: 'Purchases' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel id="materials" active={tab}>
        <MaterialsTab />
      </TabPanel>

      <TabPanel id="purchases" active={tab}>
        <PurchasesTab />
      </TabPanel>

      <MaterialDialog open={creating} onClose={() => setCreating(false)} material={null} />
    </div>
  );
}

function MaterialsTab() {
  const list = useListQuery({ filterKeys: ['status'] });
  const { data, isLoading, error, refetch } = useLibraryMaterials(list.queryParams);

  const columns: Column<LibraryMaterialRow>[] = [
    {
      key: 'title',
      header: 'Material',
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/library/${row.id}`}
            className="truncate font-medium text-foreground hover:text-primary"
          >
            {row.title}
          </Link>
          {row.titleAr ? (
            <p className="truncate text-xs text-muted" dir="rtl">
              {row.titleAr}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <ContentStatusBadge status={row.status} />
          {!row.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      secondary: true,
      render: (row) => (
        <span className="text-muted">{row.subject?.name ?? '—'}</span>
      ),
    },
    {
      key: 'partCount',
      header: 'Documents',
      align: 'end',
      render: (row) => <span className="tabular-nums">{row.partCount}</span>,
    },
    {
      key: 'packageCount',
      header: 'Packages',
      align: 'end',
      secondary: true,
      render: (row) => <span className="tabular-nums">{row.packageCount}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      secondary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</p>
          {row.createdBy ? (
            <p className="truncate text-xs text-subtle">{row.createdBy.fullName}</p>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data?.items ?? []}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      meta={data?.meta}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      caption="Library materials"
      emptyTitle={list.isFiltered ? 'No materials match' : 'The library is empty'}
      emptyDescription="A material is a publication. Its documents are what students actually buy."
      toolbar={
        <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
          <SearchInput
            value={list.q}
            onChange={list.setSearch}
            placeholder="Search materials…"
            label="Search library materials"
          />
          <FilterSelect
            value={list.filters.status ?? ''}
            onChange={(value) => list.setFilter('status', value)}
            options={CONTENT_STATUSES.map((status) => ({ value: status, label: status }))}
            placeholder="Any status"
            label="Filter by status"
          />
        </FilterBar>
      }
    />
  );
}

/**
 * Credit spent in the Library.
 *
 * The total is **credits spent**, not revenue. The cash entered the business
 * when the recharge card was redeemed and was recognised there; this is that
 * credit being drawn down. Summing this with recharge revenue would count
 * every pound twice, and the tile says so rather than leaving it to be
 * inferred.
 */
function PurchasesTab() {
  const list = useListQuery({ filterKeys: ['userId', 'from', 'to'] });

  const query = useMemo(() => {
    const { from, to, ...rest } = list.queryParams as Record<string, string | number>;
    return {
      ...rest,
      ...(from ? { from: startOfDayIso(String(from)) } : {}),
      ...(to ? { to: endOfDayIso(String(to)) } : {}),
    };
  }, [list.queryParams]);

  const { data, isLoading, error, refetch } = useLibraryPurchases(query);
  const totals = data?.totals;

  const columns: Column<LibraryPurchaseRow>[] = [
    {
      key: 'purchasedAt',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.purchasedAt)}</span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) =>
        row.student ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.student.fullName}</p>
            <p className="truncate text-xs text-muted">{formatPhone(row.student.phone)}</p>
          </div>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'title',
      header: 'Bought',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.title}</p>
          {row.materialTitle ? (
            <p className="truncate text-xs text-muted">{row.materialTitle}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) => (
        <Badge tone={row.kind === 'PACKAGE' ? 'info' : 'neutral'}>
          {row.kind === 'PACKAGE' ? `Package · ${row.partCount} docs` : 'Document'}
        </Badge>
      ),
    },
    {
      key: 'pricePaid',
      header: 'Credit spent',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium text-info">
          {formatMoney(row.pricePaid)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {isLoading && !totals ? (
        <CardsSkeleton count={2} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="Credits spent"
            value={formatMoney(totals?.creditsSpent ?? 0)}
            tone="info"
            hint="Not revenue — the cash was recognised at recharge."
          />
          <StatTile label="Purchases" value={totals?.count ?? 0} />
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        caption="Library purchases"
        emptyTitle="No library purchases in this range"
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <DateRangeFilter
              from={list.filters.from ?? ''}
              to={list.filters.to ?? ''}
              onChange={(range) => list.setFilters(range)}
            />
            <ExportButton
              filename={exportFilename('library-purchases')}
              sheetName="Library purchases"
              title="Library purchases"
              subtitle="Credit spent. Cash was recognised when the recharge card was redeemed — do not add these to recharge revenue."
              columns={PURCHASE_EXPORT_COLUMNS}
              loadRows={(onProgress) =>
                fetchAllPages<LibraryPurchaseRow>('admin/library/purchases', query, {
                  onProgress,
                })
              }
            />
          </FilterBar>
        }
      />
    </div>
  );
}

const PURCHASE_EXPORT_COLUMNS = [
  {
    header: 'When',
    key: 'purchasedAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: LibraryPurchaseRow) => asDate(row.purchasedAt),
  },
  {
    header: 'Student',
    key: 'student',
    width: 24,
    value: (row: LibraryPurchaseRow) => row.student?.fullName ?? '',
  },
  {
    header: 'Phone',
    key: 'phone',
    width: 16,
    value: (row: LibraryPurchaseRow) => row.student?.phone ?? '',
  },
  { header: 'Kind', key: 'kind', width: 12, value: (row: LibraryPurchaseRow) => row.kind },
  { header: 'Item', key: 'title', width: 30, value: (row: LibraryPurchaseRow) => row.title },
  {
    header: 'Material',
    key: 'materialTitle',
    width: 28,
    value: (row: LibraryPurchaseRow) => row.materialTitle ?? '',
  },
  {
    header: 'Documents',
    key: 'partCount',
    width: 12,
    value: (row: LibraryPurchaseRow) => row.partCount,
  },
  {
    header: 'Credit spent (EGP)',
    key: 'pricePaid',
    width: 18,
    format: EXCEL_MONEY_FORMAT,
    value: (row: LibraryPurchaseRow) => row.pricePaid,
  },
];

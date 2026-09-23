'use client';

import { useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { DateRangeFilter, FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { ExportButton } from '@/components/data/export-button';
import {
  CodeStatusBadge,
  WalletDirectionBadge,
  WalletTxTypeBadge,
} from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/overlay';
import { Badge, DescriptionList, PageHeader, StatTile } from '@/components/ui/primitives';
import { CardsSkeleton } from '@/components/ui/states';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/tabs';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
} from '@/lib/export-excel';
import { endOfDayIso, formatDateTime, formatMoney, maskCode, startOfDayIso } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { CODE_STATUSES } from '@/types/domain';
import {
  DISCOUNT_TYPE_LABEL,
  WALLET_TX_DIRECTIONS,
  WALLET_TX_SOURCE_LABEL,
  WALLET_TX_SOURCES,
  WALLET_TX_TYPES,
  WALLET_TX_TYPE_LABEL,
} from '@/types/commerce';
import type {
  RechargeCodeRow,
  RechargeRevenueRow,
  WalletRow,
  WalletTxRow,
} from '@/types/commerce';

import { GenerateRechargeDialog } from './generate-recharge-dialog';
import { StudentCell, WalletDrawer } from './wallet-drawer';
import {
  useRechargeCodes,
  useRechargeRevenue,
  useWalletTransactions,
  useWallets,
} from './hooks';

/**
 * Wallet and recharge.
 *
 * This whole screen belongs to one financial system and says so at the top:
 * cash buys a recharge card, the card becomes wallet credit, and credit buys
 * library material. Courses are not part of it. Course access is sold through
 * access cards on the Codes screen, and no amount of wallet credit unlocks a
 * course or a course part.
 *
 * The distinction is not decoration. Recharge revenue is **cash taken**;
 * credit issued is a liability; library purchases are that liability being
 * spent. Adding any two of them together produces a number that means nothing,
 * so they are never shown as a single total anywhere in this file.
 */
export function WalletOverview() {
  const [tab, setTab] = useTabParam('cards');
  const [generating, setGenerating] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Wallet & recharge"
        description="Credit for the library. Courses and course parts are sold separately, through access codes."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Wallet & recharge' }]}
        actions={
          <Button onClick={() => setGenerating(true)}>Generate recharge cards</Button>
        }
      />



      <Tabs
        tabs={[
          { id: 'cards', label: 'Recharge cards' },
          { id: 'revenue', label: 'Revenue' },
          { id: 'wallets', label: 'Student wallets' },
          { id: 'ledger', label: 'Ledger' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel id="cards" active={tab}>
        <RechargeCardsTab />
      </TabPanel>

      <TabPanel id="revenue" active={tab}>
        <RechargeRevenueTab />
      </TabPanel>

      <TabPanel id="wallets" active={tab}>
        <WalletsTab />
      </TabPanel>

      <TabPanel id="ledger" active={tab}>
        <LedgerTab />
      </TabPanel>

      <GenerateRechargeDialog open={generating} onClose={() => setGenerating(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recharge cards
// ---------------------------------------------------------------------------

function RechargeCardsTab() {
  const list = useListQuery({ filterKeys: ['status', 'batchId', 'from', 'to'] });
  const [inspecting, setInspecting] = useState<RechargeCodeRow | null>(null);

  const query = useMemo(() => {
    const { from, to, ...rest } = list.queryParams as Record<string, string | number>;
    return {
      ...rest,
      ...(from ? { from: startOfDayIso(String(from)) } : {}),
      ...(to ? { to: endOfDayIso(String(to)) } : {}),
    };
  }, [list.queryParams]);

  const { data, isLoading, error, refetch } = useRechargeCodes(query);

  const columns: Column<RechargeCodeRow>[] = [
    {
      key: 'code',
      header: 'Card',
      render: (row) => (
        <span className="font-mono text-xs tracking-wide">{maskCode(row.code)}</span>
      ),
    },
    {
      key: 'faceValue',
      header: 'Face value',
      align: 'end',
      render: (row) => <span className="tabular-nums">{formatMoney(row.faceValue)}</span>,
    },
    {
      key: 'actualPaidAmount',
      header: 'Paid',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium text-success">
          {formatMoney(row.actualPaidAmount)}
        </span>
      ),
    },
    {
      key: 'creditAmount',
      header: 'Credit',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium text-info">
          {formatMoney(row.creditAmount)}
        </span>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      secondary: true,
      render: (row) =>
        row.discountType && row.discountType !== 'NONE' ? (
          <Badge tone="warning">
            {row.discountType === 'PERCENTAGE'
              ? `${row.discountPercent ?? 0}%`
              : formatMoney(row.discountAmount)}
          </Badge>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <CodeStatusBadge status={row.status} />,
    },
    {
      key: 'batch',
      header: 'Batch',
      secondary: true,
      render: (row) => (
        <span className="text-muted">{row.batch?.name ?? row.batch?.id ?? '—'}</span>
      ),
    },
    {
      key: 'redeemedBy',
      header: 'Redeemed by',
      secondary: true,
      render: (row) => <StudentCell student={row.redeemedBy} />,
    },
  ];

  return (
    <>
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
        onRowClick={setInspecting}
        caption="Recharge cards"
        emptyTitle={list.isFiltered ? 'No cards match these filters' : 'No recharge cards yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try widening the date range or clearing the status filter.'
            : 'Generate a batch to start selling wallet credit.'
        }
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search code or note…"
              label="Search recharge cards"
            />
            <FilterSelect
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={CODE_STATUSES.map((status) => ({ value: status, label: status }))}
              placeholder="Any status"
              label="Filter by status"
            />
            <DateRangeFilter
              from={list.filters.from ?? ''}
              to={list.filters.to ?? ''}
              onChange={(range) => list.setFilters(range)}
            />
            <ExportButton
              filename={exportFilename('recharge-cards')}
              sheetName="Recharge cards"
              title="Recharge cards"
              columns={RECHARGE_EXPORT_COLUMNS}
              loadRows={(onProgress) =>
                fetchAllPages<RechargeCodeRow>('admin/recharge-codes', query, { onProgress })
              }
            />
          </FilterBar>
        }
      />

      <RechargeCardDialog row={inspecting} onClose={() => setInspecting(null)} />
    </>
  );
}

const RECHARGE_EXPORT_COLUMNS = [
  { header: 'Code', key: 'code', width: 18, value: (row: RechargeCodeRow) => row.code },
  { header: 'Status', key: 'status', width: 12, value: (row: RechargeCodeRow) => row.status },
  {
    header: 'Face value (EGP)',
    key: 'faceValue',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeCodeRow) => row.faceValue ?? 0,
  },
  {
    header: 'Paid (EGP)',
    key: 'actualPaidAmount',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeCodeRow) => row.actualPaidAmount ?? 0,
  },
  {
    header: 'Credit (EGP)',
    key: 'creditAmount',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeCodeRow) => row.creditAmount ?? 0,
  },
  {
    header: 'Discount',
    key: 'discount',
    width: 14,
    value: (row: RechargeCodeRow) =>
      row.discountType === 'PERCENTAGE'
        ? `${row.discountPercent ?? 0}%`
        : (row.discountAmount ?? 0),
  },
  {
    header: 'Batch',
    key: 'batch',
    width: 24,
    value: (row: RechargeCodeRow) => row.batch?.name ?? '',
  },
  {
    header: 'Redeemed by',
    key: 'redeemedBy',
    width: 24,
    value: (row: RechargeCodeRow) => row.redeemedBy?.fullName ?? '',
  },
  {
    header: 'Redeemed at',
    key: 'redeemedAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: RechargeCodeRow) => asDate(row.redeemedAt),
  },
  {
    header: 'Created',
    key: 'createdAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: RechargeCodeRow) => asDate(row.createdAt),
  },
];

/**
 * One card, in full.
 *
 * The code is revealed here and masked in the table — a list is the thing most
 * likely to be screenshotted or shoulder-surfed, and a recharge card is worth
 * its face value to whoever can read it.
 */
function RechargeCardDialog({
  row,
  onClose,
}: {
  row: RechargeCodeRow | null;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <Modal open onClose={onClose} title="Recharge card" size="lg">
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Code</p>
          <p className="mt-1 font-mono text-lg tracking-widest text-foreground">{row.code}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] tracking-wide text-muted uppercase">Face value</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatMoney(row.faceValue)}
            </p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-muted uppercase">Student paid</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-success">
              {formatMoney(row.actualPaidAmount)}
            </p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-muted uppercase">Wallet credit</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-info">
              {formatMoney(row.creditAmount)}
            </p>
          </div>
        </div>

        <DescriptionList
          columns={2}
          items={[
            { label: 'Status', value: <CodeStatusBadge status={row.status} /> },
            {
              label: 'Discount',
              value: row.discountType
                ? DISCOUNT_TYPE_LABEL[row.discountType]
                : DISCOUNT_TYPE_LABEL.NONE,
            },
            { label: 'Batch', value: row.batch?.name ?? row.batch?.id ?? '—' },
            { label: 'Issued by', value: row.issuedBy?.fullName ?? '—' },
            { label: 'Redeemed by', value: row.redeemedBy?.fullName ?? 'Not redeemed' },
            { label: 'Redeemed at', value: formatDateTime(row.redeemedAt) },
            {
              label: 'Revenue recognised',
              value: formatDateTime(row.revenueRecognizedAt),
            },
            { label: 'Expires', value: formatDateTime(row.expiresAt, 'Never') },
            { label: 'Created', value: formatDateTime(row.createdAt) },
            { label: 'Note', value: row.note ?? '—' },
          ]}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

/**
 * What the recharge business actually took.
 *
 * Four totals, deliberately separate. Revenue is cash received. Credit issued
 * is a liability created at the same moment and is **not** income. Discount
 * given is face value forgone, which was never income either. Summing any of
 * them together is the mistake this layout exists to prevent.
 */
function RechargeRevenueTab() {
  const list = useListQuery({ filterKeys: ['batchId', 'userId', 'from', 'to'] });

  const query = useMemo(() => {
    const { from, to, ...rest } = list.queryParams as Record<string, string | number>;
    return {
      ...rest,
      ...(from ? { from: startOfDayIso(String(from)) } : {}),
      ...(to ? { to: endOfDayIso(String(to)) } : {}),
    };
  }, [list.queryParams]);

  const { data, isLoading, error, refetch } = useRechargeRevenue(query);
  const totals = data?.totals;

  const columns: Column<RechargeRevenueRow>[] = [
    {
      key: 'recognizedAt',
      header: 'Recognised',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">
          {formatDateTime(row.recognizedAt)}
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) => <StudentCell student={row.student} />,
    },
    {
      key: 'code',
      header: 'Card',
      secondary: true,
      render: (row) => <span className="font-mono text-xs">{maskCode(row.code)}</span>,
    },
    {
      key: 'faceValue',
      header: 'Face value',
      align: 'end',
      secondary: true,
      render: (row) => <span className="tabular-nums">{formatMoney(row.faceValue)}</span>,
    },
    {
      key: 'discountAmount',
      header: 'Discount',
      align: 'end',
      secondary: true,
      render: (row) =>
        row.discountAmount > 0 ? (
          <span className="tabular-nums text-warning">
            −{formatMoney(row.discountAmount)}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'actualPaidAmount',
      header: 'Revenue',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium text-success">
          {formatMoney(row.actualPaidAmount)}
        </span>
      ),
    },
    {
      key: 'creditAmount',
      header: 'Credit issued',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums text-info">{formatMoney(row.creditAmount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {isLoading && !totals ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Revenue (cash taken)"
            value={formatMoney(totals?.revenue ?? 0)}
            tone="success"
            hint="The only figure here that is income."
          />
          <StatTile
            label="Credit issued"
            value={formatMoney(totals?.creditsIssued ?? 0)}
            tone="info"
            hint="A liability, not income."
          />
          <StatTile
            label="Discount given"
            value={formatMoney(totals?.discountGiven ?? 0)}
            tone="warning"
            hint="Face value forgone."
          />
          <StatTile
            label="Cards redeemed"
            value={totals?.count ?? 0}
            hint="Across the current filter."
          />
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
        caption="Recharge revenue"
        emptyTitle="No recharge revenue in this range"
        emptyDescription="Revenue is recognised when a student redeems a card, not when it is printed."
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <DateRangeFilter
              from={list.filters.from ?? ''}
              to={list.filters.to ?? ''}
              onChange={(range) => list.setFilters(range)}
            />
            <ExportButton
              filename={exportFilename('recharge-revenue')}
              sheetName="Recharge revenue"
              title="Recharge revenue"
              subtitle="Revenue is cash received. Credit issued is a liability and must not be added to it."
              columns={REVENUE_EXPORT_COLUMNS}
              loadRows={(onProgress) =>
                fetchAllPages<RechargeRevenueRow>('admin/recharge-revenue', query, {
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

const REVENUE_EXPORT_COLUMNS = [
  {
    header: 'Recognised',
    key: 'recognizedAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: RechargeRevenueRow) => asDate(row.recognizedAt),
  },
  {
    header: 'Student',
    key: 'student',
    width: 24,
    value: (row: RechargeRevenueRow) => row.student?.fullName ?? '',
  },
  { header: 'Card', key: 'code', width: 18, value: (row: RechargeRevenueRow) => row.code },
  {
    header: 'Batch',
    key: 'batchName',
    width: 24,
    value: (row: RechargeRevenueRow) => row.batchName ?? '',
  },
  {
    header: 'Face value (EGP)',
    key: 'faceValue',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeRevenueRow) => row.faceValue,
  },
  {
    header: 'Discount (EGP)',
    key: 'discountAmount',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeRevenueRow) => row.discountAmount,
  },
  {
    header: 'Revenue (EGP)',
    key: 'actualPaidAmount',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeRevenueRow) => row.actualPaidAmount,
  },
  {
    header: 'Credit issued (EGP)',
    key: 'creditAmount',
    width: 18,
    format: EXCEL_MONEY_FORMAT,
    value: (row: RechargeRevenueRow) => row.creditAmount,
  },
];

// ---------------------------------------------------------------------------
// Student wallets
// ---------------------------------------------------------------------------

function WalletsTab() {
  const list = useListQuery({
    filterKeys: ['minBalance'],
    defaultSort: { key: 'balance', direction: 'desc' },
  });
  const [openWallet, setOpenWallet] = useState<WalletRow | null>(null);

  const { data, isLoading, error, refetch } = useWallets(list.queryParams);

  const columns: Column<WalletRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => <StudentCell student={row.student} />,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'end',
      sortable: true,
      render: (row) => (
        <span className="tabular-nums font-semibold text-primary">
          {formatMoney(row.balance)}
        </span>
      ),
    },
    {
      key: 'totalRecharged',
      header: 'Recharged',
      align: 'end',
      sortable: true,
      secondary: true,
      render: (row) => (
        <span className="tabular-nums text-success">{formatMoney(row.totalRecharged)}</span>
      ),
    },
    {
      key: 'totalSpent',
      header: 'Spent on library',
      align: 'end',
      sortable: true,
      secondary: true,
      render: (row) => (
        <span className="tabular-nums text-info">{formatMoney(row.totalSpent)}</span>
      ),
    },
    {
      key: 'transactionCount',
      header: 'Entries',
      align: 'end',
      secondary: true,
      render: (row) => <span className="tabular-nums">{row.transactionCount}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Last activity',
      secondary: true,
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.updatedAt)}</span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        sort={list.sort}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onRowClick={setOpenWallet}
        caption="Student wallets"
        emptyTitle="No wallets yet"
        emptyDescription="A wallet is created the first time a student opens theirs or redeems a card."
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search name or phone…"
              label="Search wallets"
            />
            <FilterSelect
              value={list.filters.minBalance ?? ''}
              onChange={(value) => list.setFilter('minBalance', value)}
              options={[
                { value: '0.01', label: 'Has any credit' },
                { value: '50', label: '50 EGP or more' },
                { value: '200', label: '200 EGP or more' },
              ]}
              placeholder="Any balance"
              label="Filter by balance"
            />
          </FilterBar>
        }
      />

      <WalletDrawer
        userId={openWallet?.student.id ?? null}
        studentName={openWallet?.student.fullName ?? null}
        onClose={() => setOpenWallet(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Every credit movement on the platform.
 *
 * Append-only: nothing in this dashboard edits an entry, and the balance shown
 * on a wallet is the sum of these rows rather than a separately maintained
 * figure. `source` is what tells you which subsystem moved the credit, and the
 * only spending sources are library ones.
 */
function LedgerTab() {
  const list = useListQuery({
    filterKeys: ['type', 'direction', 'source', 'userId', 'from', 'to'],
  });

  const query = useMemo(() => {
    const { from, to, ...rest } = list.queryParams as Record<string, string | number>;
    return {
      ...rest,
      ...(from ? { from: startOfDayIso(String(from)) } : {}),
      ...(to ? { to: endOfDayIso(String(to)) } : {}),
    };
  }, [list.queryParams]);

  const { data, isLoading, error, refetch } = useWalletTransactions(query);

  const columns: Column<WalletTxRow>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) => <StudentCell student={row.student} />,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <WalletTxTypeBadge type={row.type} />,
    },
    {
      key: 'source',
      header: 'Source',
      secondary: true,
      render: (row) => (
        <span className="text-muted">{WALLET_TX_SOURCE_LABEL[row.source]}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (row) => (
        <WalletDirectionBadge direction={row.direction}>
          {formatMoney(row.amount)}
        </WalletDirectionBadge>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Balance after',
      align: 'end',
      secondary: true,
      render: (row) => (
        <span className="tabular-nums">{formatMoney(row.balanceAfter)}</span>
      ),
    },
    {
      key: 'performedBy',
      header: 'By',
      secondary: true,
      render: (row) =>
        row.performedBy ? (
          <span className="text-muted">{row.performedBy.fullName}</span>
        ) : (
          <span className="text-subtle">—</span>
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
      caption="Wallet ledger"
      emptyTitle={list.isFiltered ? 'No entries match these filters' : 'The ledger is empty'}
      toolbar={
        <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
          <FilterSelect
            value={list.filters.type ?? ''}
            onChange={(value) => list.setFilter('type', value)}
            options={WALLET_TX_TYPES.map((type) => ({
              value: type,
              label: WALLET_TX_TYPE_LABEL[type],
            }))}
            placeholder="Any type"
            label="Filter by type"
          />
          <FilterSelect
            value={list.filters.direction ?? ''}
            onChange={(value) => list.setFilter('direction', value)}
            options={WALLET_TX_DIRECTIONS.map((direction) => ({
              value: direction,
              label: direction === 'CREDIT' ? 'Credit in' : 'Credit out',
            }))}
            placeholder="Any direction"
            label="Filter by direction"
          />
          <FilterSelect
            value={list.filters.source ?? ''}
            onChange={(value) => list.setFilter('source', value)}
            options={WALLET_TX_SOURCES.map((source) => ({
              value: source,
              label: WALLET_TX_SOURCE_LABEL[source],
            }))}
            placeholder="Any source"
            label="Filter by source"
          />
          <DateRangeFilter
            from={list.filters.from ?? ''}
            to={list.filters.to ?? ''}
            onChange={(range) => list.setFilters(range)}
          />
          <ExportButton
            filename={exportFilename('wallet-ledger')}
            sheetName="Wallet ledger"
            title="Wallet ledger"
            columns={LEDGER_EXPORT_COLUMNS}
            loadRows={(onProgress) =>
              fetchAllPages<WalletTxRow>('admin/wallet-transactions', query, { onProgress })
            }
          />
        </FilterBar>
      }
    />
  );
}

const LEDGER_EXPORT_COLUMNS = [
  {
    header: 'When',
    key: 'createdAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: WalletTxRow) => asDate(row.createdAt),
  },
  {
    header: 'Student',
    key: 'student',
    width: 24,
    value: (row: WalletTxRow) => row.student?.fullName ?? '',
  },
  { header: 'Type', key: 'type', width: 18, value: (row: WalletTxRow) => row.type },
  {
    header: 'Direction',
    key: 'direction',
    width: 12,
    value: (row: WalletTxRow) => row.direction,
  },
  { header: 'Source', key: 'source', width: 18, value: (row: WalletTxRow) => row.source },
  {
    header: 'Amount (EGP)',
    key: 'amount',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: WalletTxRow) => (row.direction === 'DEBIT' ? -row.amount : row.amount),
  },
  {
    header: 'Balance after (EGP)',
    key: 'balanceAfter',
    width: 18,
    format: EXCEL_MONEY_FORMAT,
    value: (row: WalletTxRow) => row.balanceAfter,
  },
  { header: 'Note', key: 'note', width: 30, value: (row: WalletTxRow) => row.note ?? '' },
];

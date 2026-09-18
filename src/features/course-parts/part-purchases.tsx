'use client';

import { useMemo } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { DateRangeFilter, FilterBar } from '@/components/data/filters';
import { ExportButton } from '@/components/data/export-button';
import { Badge, PageHeader, StatTile } from '@/components/ui/primitives';
import { CardsSkeleton } from '@/components/ui/states';
import { fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  asDate,
  exportFilename,
} from '@/lib/export-excel';
import { endOfDayIso, formatDateTime, formatMoney, formatPhone, startOfDayIso } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import type { CoursePartPurchaseRow } from '@/types/commerce';
import { PART_PRICING_MODEL_LABEL } from '@/types/commerce';

import { usePartPurchases } from './hooks';

/**
 * Who unlocked which part of which course.
 *
 * **These totals are catalogue value, not cash.** A part is unlocked by
 * redeeming an access card; the money for that card changed hands offline, and
 * is accounted for wherever that sale was recorded. Reading this as revenue
 * would double-count it against the payment that actually happened, so the
 * tiles are labelled for what they are.
 *
 * Equally, none of this is wallet activity. The wallet funds the Library and
 * only the Library — a figure from this screen has no business being added to
 * one from there.
 */
export function PartPurchaseReport() {
  const list = useListQuery({
    filterKeys: ['courseId', 'coursePartId', 'userId', 'from', 'to'],
  });

  const query = useMemo(() => {
    const { from, to, ...rest } = list.queryParams as Record<string, string | number>;
    return {
      ...rest,
      ...(from ? { from: startOfDayIso(String(from)) } : {}),
      ...(to ? { to: endOfDayIso(String(to)) } : {}),
    };
  }, [list.queryParams]);

  const { data, isLoading, error, refetch } = usePartPurchases(query);
  const totals = data?.totals;

  const columns: Column<CoursePartPurchaseRow>[] = [
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
      key: 'part',
      header: 'Part',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.partTitle}</p>
          <p className="truncate text-xs text-muted">{row.courseTitle}</p>
        </div>
      ),
    },
    {
      key: 'sectionsUnlocked',
      header: 'Sections',
      align: 'end',
      secondary: true,
      render: (row) => <span className="tabular-nums">{row.sectionsUnlocked}</span>,
    },
    {
      key: 'pricingModel',
      header: 'Priced as',
      secondary: true,
      render: (row) => (
        <Badge tone="neutral">
          {row.pricingModel === 'PERCENTAGE' && row.pricePercent != null
            ? `${row.pricePercent}% of course`
            : PART_PRICING_MODEL_LABEL[row.pricingModel]}
        </Badge>
      ),
    },
    {
      key: 'priceAtPurchase',
      header: 'Value',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium">{formatMoney(row.priceAtPurchase)}</span>
      ),
    },
    {
      key: 'teacherAmount',
      header: 'Teacher share',
      align: 'end',
      secondary: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="tabular-nums">{formatMoney(row.teacherAmount)}</p>
          {row.teacher ? (
            <p className="truncate text-xs text-muted">{row.teacher.fullName}</p>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Part unlocks"
        description="Parts unlocked by redeeming an access code. The cash for those codes was taken offline — these figures are catalogue value, not revenue."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Part unlocks' }]}
      />

      {isLoading && !totals ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Value unlocked"
            value={formatMoney(totals?.valueAtAcquisition ?? 0)}
            hint="Catalogue value, not cash received."
          />
          <StatTile
            label="Teacher share"
            value={formatMoney(totals?.teacherShare ?? 0)}
            tone="info"
          />
          <StatTile
            label="Platform share"
            value={formatMoney(totals?.platformShare ?? 0)}
            tone="primary"
          />
          <StatTile label="Unlocks" value={totals?.count ?? 0} />
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
        caption="Course part unlocks"
        emptyTitle={
          list.isFiltered ? 'No unlocks match these filters' : 'No parts unlocked yet'
        }
        emptyDescription="A row appears here when a student redeems a part-scoped access code."
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <DateRangeFilter
              from={list.filters.from ?? ''}
              to={list.filters.to ?? ''}
              onChange={(range) => list.setFilters(range)}
            />
            <ExportButton
              filename={exportFilename('part-unlocks')}
              sheetName="Part unlocks"
              title="Course part unlocks"
              subtitle="Catalogue value at the time of unlock. Not cash received, and not wallet activity."
              columns={PART_EXPORT_COLUMNS}
              loadRows={(onProgress) =>
                fetchAllPages<CoursePartPurchaseRow>('admin/part-purchases', query, {
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

const PART_EXPORT_COLUMNS = [
  {
    header: 'When',
    key: 'purchasedAt',
    width: 20,
    format: EXCEL_DATE_FORMAT,
    value: (row: CoursePartPurchaseRow) => asDate(row.purchasedAt),
  },
  {
    header: 'Student',
    key: 'student',
    width: 24,
    value: (row: CoursePartPurchaseRow) => row.student?.fullName ?? '',
  },
  {
    header: 'Phone',
    key: 'phone',
    width: 16,
    value: (row: CoursePartPurchaseRow) => row.student?.phone ?? '',
  },
  {
    header: 'Course',
    key: 'courseTitle',
    width: 28,
    value: (row: CoursePartPurchaseRow) => row.courseTitle,
  },
  {
    header: 'Part',
    key: 'partTitle',
    width: 28,
    value: (row: CoursePartPurchaseRow) => row.partTitle,
  },
  {
    header: 'Sections unlocked',
    key: 'sectionsUnlocked',
    width: 18,
    value: (row: CoursePartPurchaseRow) => row.sectionsUnlocked,
  },
  {
    header: 'Value (EGP)',
    key: 'priceAtPurchase',
    width: 16,
    format: EXCEL_MONEY_FORMAT,
    value: (row: CoursePartPurchaseRow) => row.priceAtPurchase,
  },
  {
    header: 'Teacher',
    key: 'teacher',
    width: 24,
    value: (row: CoursePartPurchaseRow) => row.teacher?.fullName ?? '',
  },
  {
    header: 'Teacher share (EGP)',
    key: 'teacherAmount',
    width: 18,
    format: EXCEL_MONEY_FORMAT,
    value: (row: CoursePartPurchaseRow) => row.teacherAmount,
  },
  {
    header: 'Platform share (EGP)',
    key: 'platformAmount',
    width: 18,
    format: EXCEL_MONEY_FORMAT,
    value: (row: CoursePartPurchaseRow) => row.platformAmount,
  },
];

'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import type { PageMeta } from '@/types/api';

/**
 * The table every list screen is built from.
 *
 * Three things it deliberately does not do:
 *
 *  - it does not sort, filter or paginate in the browser. Those are query
 *    parameters sent to the API, because a page of twenty rows sorted
 *    client-side is sorting twenty rows out of nine thousand, which is worse
 *    than not sorting at all;
 *  - it does not virtualise. Page sizes are capped at 100 by the backend;
 *  - it does not own its state. The page owns the query, the table renders it.
 *
 * On narrow screens the table scrolls horizontally inside its own container
 * rather than collapsing into cards: an administrator comparing rows needs the
 * columns to stay columns, and the page itself must never scroll sideways.
 */

export interface Column<T> {
  /** Stable key, also used for the sort parameter when `sortable` is set. */
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  /** Extra classes for the cell — width hints, alignment, truncation. */
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  /** Hidden below `sm`. Use for columns that are context rather than content. */
  secondary?: boolean;
  align?: 'start' | 'center' | 'end';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }) => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  caption?: string;
  className?: string;
  /** Rendered above the table — filters, search, export. */
  toolbar?: ReactNode;
}

const ALIGN = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  meta,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  caption,
  className,
  toolbar,
}: DataTableProps<T>) {
  const showBody = !isLoading && !error && rows.length > 0;

  return (
    <div className={cn('card overflow-hidden', className)}>
      {toolbar ? (
        <div className="border-b border-border px-4 py-3">{toolbar}</div>
      ) : null}

      {isLoading ? <TableSkeleton columns={Math.min(columns.length, 6)} /> : null}

      {!isLoading && error ? <ErrorState error={error} onRetry={onRetry} /> : null}

      {!isLoading && !error && rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          }
        />
      ) : null}

      {showBody ? (
        <div className="table-scroll">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            {caption ? <caption className="sr-only">{caption}</caption> : null}

            <thead>
              <tr className="border-b border-border bg-surface-alt">
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const nextDirection =
                    active && sort?.direction === 'asc' ? 'desc' : 'asc';

                  return (
                    <th
                      key={column.key}
                      scope="col"
                      // aria-sort is what makes a sortable column announce its
                      // state; the arrow glyph alone is invisible to a reader.
                      aria-sort={
                        active
                          ? sort?.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : column.sortable
                            ? 'none'
                            : undefined
                      }
                      className={cn(
                        'px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase whitespace-nowrap',
                        ALIGN[column.align ?? 'start'],
                        column.secondary && 'hidden sm:table-cell',
                        column.headerClassName,
                      )}
                    >
                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSortChange({ key: column.key, direction: nextDirection })
                          }
                          className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
                        >
                          {column.header}
                          <SortGlyph active={active} direction={sort?.direction} />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border last:border-0',
                    onRowClick && 'cursor-pointer transition-colors hover:bg-surface-alt',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-foreground',
                        ALIGN[column.align ?? 'start'],
                        column.secondary && 'hidden sm:table-cell',
                        column.className,
                      )}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {meta && !isLoading && !error && rows.length > 0 ? (
        <Pagination
          meta={meta}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
    </div>
  );
}

function SortGlyph({
  active,
  direction,
}: {
  active: boolean;
  direction?: 'asc' | 'desc';
}) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 3 11 7H5L8 3Z"
        fill="currentColor"
        opacity={active && direction === 'asc' ? 1 : 0.3}
      />
      <path
        d="M8 13 5 9h6l-3 4Z"
        fill="currentColor"
        opacity={active && direction === 'desc' ? 1 : 0.3}
      />
    </svg>
  );
}

const PAGE_SIZES = [20, 50, 100];

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
}: {
  meta: PageMeta;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
    >
      <p className="text-xs text-muted" aria-live="polite">
        Showing <span className="font-medium text-foreground">{first}</span>–
        <span className="font-medium text-foreground">{last}</span> of{' '}
        <span className="font-medium text-foreground">{meta.total}</span>
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={meta.pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <Button
          size="sm"
          variant="secondary"
          disabled={!meta.hasPrevious}
          onClick={() => onPageChange?.(meta.page - 1)}
        >
          Previous
        </Button>

        <span className="px-1 text-xs whitespace-nowrap text-muted">
          {meta.page} / {meta.totalPages}
        </span>

        <Button
          size="sm"
          variant="secondary"
          disabled={!meta.hasNext}
          onClick={() => onPageChange?.(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

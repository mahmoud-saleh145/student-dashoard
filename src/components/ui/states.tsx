'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { messageFor, isRetryable, ApiError } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Loading, empty and error states.
 *
 * Every list in this application uses these three rather than inventing its
 * own, because the difference between "no results for this filter" and
 * "something broke" is the single most common thing a back-office UI gets
 * wrong, and it is what turns a working screen into a support call.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} aria-hidden="true" />;
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="p-4" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-3">
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn(
                  'h-5 flex-1',
                  // Vary the widths so it reads as content rather than as a
                  // broken grid.
                  columnIndex === 0 && 'max-w-[22%]',
                  columnIndex === columns - 1 && 'max-w-[12%]',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <span
          className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-subtle"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  title?: string;
}) {
  const message = messageFor(error);
  const apiError = error instanceof ApiError ? error : null;
  const canRetry = Boolean(onRetry) && (isRetryable(error) || !apiError);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger"
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <p className="text-sm font-medium text-foreground">
        {title ?? 'This could not be loaded'}
      </p>
      <p className="max-w-sm text-sm text-muted">{message}</p>

      {/* The request id is the one piece of diagnostic detail worth surfacing:
          it is what makes a support message actionable against the API logs. */}
      {apiError?.requestId ? (
        <p className="mt-1 font-mono text-[11px] text-subtle">
          Reference: {apiError.requestId}
        </p>
      ) : null}

      {canRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Chooses between the three states for a query-backed panel.
 *
 * Takes `isEmpty` explicitly rather than inspecting the data, because "empty"
 * means different things to different endpoints and guessing produces the
 * exact confusion this component exists to prevent.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  loadingFallback,
  emptyState,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  emptyState?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <>{loadingFallback ?? <TableSkeleton />}</>;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{emptyState ?? <EmptyState title="Nothing to show yet" />}</>;
  return <>{children}</>;
}

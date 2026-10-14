'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { ExportButton } from '@/components/data/export-button';
import { SearchInput } from '@/components/data/filters';
import { Drawer } from '@/components/ui/overlay';
import { Badge, StatTile } from '@/components/ui/primitives';
import { api, fetchAllPages } from '@/lib/api-client';
import {
  EXCEL_DATE_FORMAT,
  asDate,
  exportFilename,
  type ExportColumn,
} from '@/lib/export-excel';
import { formatDateTime, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import type { LessonRow, LessonViewerRow } from '@/types/domain';

/**
 * `lesson` and `summary` are optional because an API deployed before the
 * envelope fix drops them (it kept only `items`/`meta`); the drawer must still
 * render the table against that API rather than crash.
 */
interface LessonViewersResponse {
  lesson?: {
    id: string;
    title: string;
    courseTitle: string;
    durationSeconds: number;
    completionRule: { type: string; threshold: number };
  };
  summary?: {
    viewers: number;
    completed: number;
    averagePercent: number;
    totalWatchSeconds: number;
  };
  items: LessonViewerRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Who watched a lecture.
 *
 * Completion is not recomputed here. It is the `completed` flag the progress
 * service already wrote using the course's own configured rule — the platform
 * default is a watched-percentage threshold, and it is configurable per course
 * and per lecture. Recomputing it in the browser from a percentage would give
 * a second, subtly different answer to a question the student's own app has
 * already answered, and the two would disagree at the boundary.
 *
 * The rule actually in force is printed above the table, so nobody has to
 * guess which threshold produced these numbers.
 */
export function LessonAnalyticsDrawer({
  lesson,
  onClose,
}: {
  lesson: LessonRow | null;
  onClose: () => void;
}) {
  // Keyed by lecture, so opening another lecture starts on page 1 with an
  // empty search instead of inheriting the previous lecture's position.
  return lesson ? <LessonViewers key={lesson.id} lesson={lesson} onClose={onClose} /> : null;
}

function LessonViewers({ lesson, onClose }: { lesson: LessonRow; onClose: () => void }) {
  // Local, not URL, state. This drawer opens over the course page, whose own
  // lists (the Students tab) keep `page`/`q` in the URL; sharing them meant a
  // search typed here filtered the Students tab after the drawer closed, and
  // page 2 of one lecture became page 2 of the next.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');

  const onSearch = useCallback((value: string) => {
    setQ(value);
    setPage(1);
  }, []);

  const queryParams = useMemo(
    () => ({ page, pageSize, ...(q ? { q } : {}) }),
    [page, pageSize, q],
  );

  const viewers = useQuery({
    queryKey: queryKeys.lessons.viewers(lesson.id, queryParams),
    queryFn: () =>
      api.get<LessonViewersResponse>(`analytics/lessons/${lesson.id}/students`, {
        query: queryParams,
      }),
    placeholderData: (previous) => previous,
  });

  const data = viewers.data;
  // Read defensively: an older API rebuilt this response as `{ items, meta }`
  // and dropped `lesson`/`summary`, and reading through them crashed the page.
  const threshold = data?.lesson?.completionRule?.threshold;
  const summary = data?.summary;

  const columns: Column<LessonViewerRow>[] = [
    {
      key: 'student',
      header: 'Student',
      className: 'min-w-[12rem]',
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{row.student.fullName}</span>
          <span className="truncate text-xs text-muted" dir="ltr">
            {row.student.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'firstWatchedAt',
      header: 'First opened',
      secondary: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.firstWatchedAt)}
        </span>
      ),
    },
    {
      key: 'watched',
      header: 'Watched',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums">{formatDuration(row.watchedSeconds)}</span>
      ),
    },
    {
      key: 'percent',
      header: 'Progress',
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
            />
          </span>
          <span className="w-10 text-end tabular-nums">{formatPercent(row.percent)}</span>
        </div>
      ),
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (row) =>
        row.completed ? (
          <Badge tone="success">Completed</Badge>
        ) : (
          <Badge tone="neutral">In progress</Badge>
        ),
    },
    {
      key: 'lastWatchedAt',
      header: 'Last activity',
      secondary: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatDateTime(row.lastWatchedAt)}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<LessonViewerRow>[] = [
    { header: 'Student', key: 'name', width: 30, value: (row) => row.student.fullName },
    { header: 'Phone', key: 'phone', width: 16, value: (row) => row.student.phone },
    {
      header: 'University',
      key: 'university',
      width: 26,
      value: (row) => row.student.university?.name ?? '',
    },
    {
      header: 'Academic year',
      key: 'year',
      width: 18,
      value: (row) => row.student.academicYear?.name ?? '',
    },
    {
      header: 'First opened',
      key: 'firstWatchedAt',
      width: 20,
      value: (row) => asDate(row.firstWatchedAt),
      format: EXCEL_DATE_FORMAT,
    },
    {
      header: 'Watched (seconds)',
      key: 'watchedSeconds',
      width: 18,
      value: (row) => row.watchedSeconds,
    },
    { header: 'Progress %', key: 'percent', width: 12, value: (row) => row.percent },
    {
      header: 'Completed',
      key: 'completed',
      width: 12,
      value: (row) => (row.completed ? 'Yes' : 'No'),
    },
    {
      header: 'Last activity',
      key: 'lastWatchedAt',
      width: 20,
      value: (row) => asDate(row.lastWatchedAt),
      format: EXCEL_DATE_FORMAT,
    },
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width="xl"
      title={lesson.title}
      description={
        threshold !== undefined
          ? `Completion is counted at ${threshold}% watched, as configured for this course.`
          : 'Viewing activity for this lecture.'
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Viewers"
            value={formatNumber(summary?.viewers)}
            loading={viewers.isLoading}
          />
          <StatTile
            label="Completed"
            value={formatNumber(summary?.completed)}
            tone="success"
            loading={viewers.isLoading}
          />
          <StatTile
            label="Average"
            value={formatPercent(summary?.averagePercent)}
            loading={viewers.isLoading}
          />
          <StatTile
            label="Total watched"
            value={formatDuration(summary?.totalWatchSeconds)}
            loading={viewers.isLoading}
          />
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(row) => row.student.id}
          isLoading={viewers.isLoading}
          error={viewers.error}
          onRetry={() => void viewers.refetch()}
          meta={data?.meta}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          caption="Lecture viewers"
          emptyTitle={q ? 'No viewers match this search' : 'Nobody has opened this lecture yet'}
          emptyDescription={
            q
              ? 'Try another name or phone number.'
              : 'Rows appear as soon as a student starts watching.'
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={q}
                onChange={onSearch}
                placeholder="Search by name or phone…"
                label="Search viewers"
              />

              <div className="ms-auto">
                <ExportButton
                  filename={exportFilename(`${lesson.title}-viewers`)}
                  sheetName="Viewers"
                  title={`${data?.lesson?.courseTitle ?? ''} — ${lesson.title}`}
                  subtitle={
                    threshold !== undefined
                      ? `Completion threshold ${threshold}% · lecture length ${formatDuration(data?.lesson?.durationSeconds)}`
                      : undefined
                  }
                  columns={exportColumns}
                  loadRows={(onProgress) =>
                    fetchAllPages<LessonViewerRow>(
                      `analytics/lessons/${lesson.id}/students`,
                      q ? { q } : {},
                      { onProgress },
                    )
                  }
                />
              </div>
            </div>
          }
        />
      </div>
    </Drawer>
  );
}

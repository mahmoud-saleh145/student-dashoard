'use client';

import { DataTable, type Column } from '@/components/data/data-table';
import { AnnouncementStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/overlay';
import { Badge, DescriptionList, SectionTitle } from '@/components/ui/primitives';
import { QueryState, Skeleton } from '@/components/ui/states';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  ANNOUNCEMENT_FREQUENCY_LABEL,
  ISO_WEEKDAYS,
} from '@/types/commerce';
import type { AnnouncementDetail, AnnouncementDispatchRow } from '@/types/commerce';

import { AudienceChips } from './audience-builder';
import { useAnnouncement } from './hooks';

/**
 * One announcement, with its delivery history.
 *
 * Each dispatch row is an occurrence that was **claimed** — the server inserts
 * it before writing a single notification, which is what makes a duplicate
 * tick a no-op rather than a second broadcast. A row with an error therefore
 * means the send failed *after* the claim, and the claim was deliberately kept
 * so the retry could not resend to everyone already reached.
 */
export function AnnouncementDrawer({
  announcementId,
  onClose,
  onEdit,
  onSendNow,
  onCancel,
  sending,
}: {
  announcementId: string | null;
  onClose: () => void;
  onEdit: (announcement: AnnouncementDetail) => void;
  onSendNow: (id: string) => void;
  onCancel: (id: string) => void;
  sending: boolean;
}) {
  const query = useAnnouncement(announcementId);
  const data = query.data;

  const editable =
    data != null &&
    data.occurrenceCount === 0 &&
    data.status !== 'SENT' &&
    data.status !== 'SENDING';

  return (
    <Drawer
      open={Boolean(announcementId)}
      onClose={onClose}
      title={data?.title ?? 'Announcement'}
      description={data ? `Created ${formatDateTime(data.createdAt)}` : undefined}
      width="xl"
      footer={
        data ? (
          <>
            {data.status !== 'CANCELLED' && data.status !== 'SENT' ? (
              <Button variant="ghost" onClick={() => onCancel(data.id)}>
                Cancel schedule
              </Button>
            ) : null}
            {editable ? (
              <Button variant="secondary" onClick={() => onEdit(data)}>
                Edit
              </Button>
            ) : null}
            <Button onClick={() => onSendNow(data.id)} loading={sending}>
              Send now
            </Button>
          </>
        ) : null
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={!data}
        onRetry={() => void query.refetch()}
        loadingFallback={<Skeleton className="h-64 w-full" />}
      >
        {data ? (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <AnnouncementStatusBadge status={data.status} />
                {data.sendPush ? (
                  <Badge tone="info">Push enabled</Badge>
                ) : (
                  <Badge tone="neutral">Inbox only</Badge>
                )}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap text-foreground">{data.body}</p>
              {data.bodyAr ? (
                <p className="mt-2 text-sm whitespace-pre-wrap text-muted" dir="rtl">
                  {data.bodyAr}
                </p>
              ) : null}
            </div>

            <div>
              <SectionTitle>Audience</SectionTitle>
              <div className="pt-3">
                <AudienceChips rule={data.audienceRule} />
                <p className="mt-2 text-xs text-muted">
                  Re-evaluated at every send, so a recurring announcement reaches whoever
                  matches on the day it fires.
                </p>
              </div>
            </div>

            <div>
              <SectionTitle>Schedule</SectionTitle>
              <DescriptionList
                className="pt-3"
                columns={2}
                items={[
                  {
                    label: 'Repeats',
                    value: ANNOUNCEMENT_FREQUENCY_LABEL[data.frequency],
                  },
                  {
                    label: 'Time',
                    value: data.sendAtLocal
                      ? `${data.sendAtLocal} (${data.timezone})`
                      : 'Not scheduled',
                  },
                  ...(data.frequency === 'WEEKLY'
                    ? [
                        {
                          label: 'Days',
                          value:
                            data.weekdays
                              .map(
                                (day) =>
                                  ISO_WEEKDAYS.find((weekday) => weekday.value === day)
                                    ?.label ?? String(day),
                              )
                              .join(', ') || '—',
                        },
                      ]
                    : []),
                  ...(data.frequency === 'MONTHLY'
                    ? [{ label: 'Day of month', value: data.dayOfMonth ?? '—' }]
                    : []),
                  {
                    label: 'Next occurrence',
                    value: data.nextOccurrenceAt
                      ? formatDateTime(data.nextOccurrenceAt)
                      : 'Nothing further due',
                  },
                  {
                    label: 'Last sent',
                    value: formatDateTime(data.lastOccurrenceAt, 'Never'),
                  },
                  {
                    label: 'Times sent',
                    value: `${data.occurrenceCount}${
                      data.maxOccurrences ? ` of ${data.maxOccurrences}` : ''
                    }`,
                  },
                  {
                    label: 'Notifications delivered',
                    value: formatNumber(data._count.notifications),
                  },
                ]}
              />
            </div>

            <div>
              <SectionTitle>Delivery history</SectionTitle>
              <div className="pt-3">
                <DispatchTable rows={data.dispatches} />
              </div>
            </div>
          </div>
        ) : null}
      </QueryState>
    </Drawer>
  );
}

function DispatchTable({ rows }: { rows: AnnouncementDispatchRow[] }) {
  const columns: Column<AnnouncementDispatchRow>[] = [
    {
      key: 'occurrenceAt',
      header: 'Scheduled for',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">
          {formatDateTime(row.occurrenceAt)}
        </span>
      ),
    },
    {
      key: 'recipientCount',
      header: 'Matched',
      align: 'end',
      render: (row) => <span className="tabular-nums">{formatNumber(row.recipientCount)}</span>,
    },
    {
      key: 'createdCount',
      header: 'Delivered',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium">{formatNumber(row.createdCount)}</span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) =>
        row.error ? (
          <Badge tone="danger">Failed</Badge>
        ) : row.finishedAt ? (
          <Badge tone="success">Sent</Badge>
        ) : (
          <Badge tone="warning">In flight</Badge>
        ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Delivery history"
        emptyTitle="Not sent yet"
        emptyDescription="A row appears here for every occurrence the server claims."
      />

      {rows.some((row) => row.error) ? (
        <div className="mt-3 space-y-2">
          {rows
            .filter((row) => row.error)
            .map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                <p className="font-medium">{formatDateTime(row.occurrenceAt)}</p>
                <p className="mt-0.5 font-mono">{row.error}</p>
              </div>
            ))}
          <p className="text-xs text-muted">
            The occurrence stays claimed after a failure on purpose: releasing it would
            retry on the next tick and send twice to everyone already reached.
          </p>
        </div>
      ) : null}
    </>
  );
}

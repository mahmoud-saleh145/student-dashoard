'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar, FilterSelect } from '@/components/data/filters';
import { AnnouncementStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlay';
import { PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useListQuery } from '@/lib/use-list-query';
import { ANNOUNCEMENT_FREQUENCY_LABEL, ANNOUNCEMENT_STATUSES } from '@/types/commerce';
import type { AnnouncementDetail, AnnouncementRow } from '@/types/commerce';

import { AnnouncementDialog } from './announcement-dialog';
import { AnnouncementDrawer } from './announcement-drawer';
import { AudienceChips } from './audience-builder';
import { useAnnouncements, useCancelAnnouncement, useSendAnnouncementNow } from './hooks';

/**
 * Scheduled and recurring announcements.
 *
 * Separate from the Notification centre, which sends one message to one
 * audience immediately. This is the scheduled side: a rule for who, a schedule
 * for when, and a history of what actually went out.
 */
export function AnnouncementList() {
  const toast = useToast();
  const list = useListQuery({ filterKeys: ['status'] });

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<AnnouncementDetail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<AnnouncementRow | null>(null);

  const { data, isLoading, error, refetch } = useAnnouncements(list.queryParams);
  const sendNow = useSendAnnouncementNow();
  const cancel = useCancelAnnouncement();

  const doSend = (id: string) =>
    sendNow.mutate(id, {
      onSuccess: (result) => {
        if (result.skipped === 'already-claimed') {
          toast.push({
            tone: 'info',
            title: 'Already sent',
            description:
              'Another worker had already claimed this occurrence, so nothing was sent twice.',
          });
        } else {
          toast.success(
            `Sent to ${formatNumber(result.created ?? 0)} student(s)`,
            `${formatNumber(result.recipients ?? 0)} matched the audience.`,
          );
        }
        setConfirmSend(null);
      },
      onError: (sendError) => toast.error(sendError, 'The announcement was not sent'),
    });

  const columns: Column<AnnouncementRow>[] = [
    {
      key: 'title',
      header: 'Announcement',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.title}</p>
          <p className="truncate text-xs text-muted">{row.body}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <AnnouncementStatusBadge status={row.status} />,
    },
    {
      key: 'audience',
      header: 'Audience',
      secondary: true,
      render: (row) => <AudienceChips rule={row.audienceRule} />,
    },
    {
      key: 'frequency',
      header: 'Repeats',
      secondary: true,
      render: (row) => (
        <div className="min-w-0">
          <p>{ANNOUNCEMENT_FREQUENCY_LABEL[row.frequency]}</p>
          {row.sendAtLocal ? (
            <p className="text-xs text-muted">
              {row.sendAtLocal} {row.timezone}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'nextOccurrenceAt',
      header: 'Next',
      render: (row) =>
        row.nextOccurrenceAt ? (
          <span className="whitespace-nowrap text-muted">
            {formatDateTime(row.nextOccurrenceAt)}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'delivered',
      header: 'Delivered',
      align: 'end',
      render: (row) => (
        <div className="min-w-0">
          <p className="tabular-nums">{formatNumber(row._count.notifications)}</p>
          {row.occurrenceCount > 0 ? (
            <p className="text-xs text-muted">
              {row.occurrenceCount} send{row.occurrenceCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmSend(row);
            }}
          >
            Send now
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements"
        description="Targeted, scheduled and recurring. A delivered push cannot be recalled, so every send is previewed first."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Announcements' }]}
        actions={<Button onClick={() => setComposing(true)}>New announcement</Button>}
      />

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
        onRowClick={(row) => setOpenId(row.id)}
        caption="Announcements"
        emptyTitle={list.isFiltered ? 'Nothing matches this filter' : 'No announcements yet'}
        emptyDescription="Create one to reach a chosen group of students, once or on a schedule."
        emptyAction={
          <Button onClick={() => setComposing(true)}>New announcement</Button>
        }
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <FilterSelect
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={ANNOUNCEMENT_STATUSES.map((status) => ({
                value: status,
                label: status,
              }))}
              placeholder="Any status"
              label="Filter by status"
            />
          </FilterBar>
        }
      />

      <AnnouncementDialog
        open={composing || Boolean(editing)}
        onClose={() => {
          setComposing(false);
          setEditing(null);
        }}
        announcement={editing}
      />

      <AnnouncementDrawer
        announcementId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(announcement) => {
          setOpenId(null);
          setEditing(announcement);
        }}
        onSendNow={doSend}
        onCancel={(id) => setCancelling(id)}
        sending={sendNow.isPending}
      />

      <ConfirmDialog
        open={Boolean(confirmSend)}
        onCancel={() => setConfirmSend(null)}
        onConfirm={() => confirmSend && doSend(confirmSend.id)}
        busy={sendNow.isPending}
        variant="primary"
        title="Send this announcement now?"
        confirmLabel="Send now"
        message={
          <>
            <strong className="text-foreground">{confirmSend?.title}</strong> goes out
            immediately to everyone matching its audience.{' '}
            {confirmSend?.sendPush
              ? 'It will buzz their phones, and a delivered push cannot be recalled.'
              : 'It will appear in their inbox without a push notification.'}
          </>
        }
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling, {
            onSuccess: () => {
              toast.success('Schedule cancelled');
              setCancelling(null);
              setOpenId(null);
            },
            onError: (cancelError) =>
              toast.error(cancelError, 'The schedule was not cancelled'),
          });
        }}
        busy={cancel.isPending}
        title="Cancel this schedule?"
        confirmLabel="Cancel schedule"
        message={
          <>
            No further occurrences will fire. Notifications already delivered are
            untouched — they belong to the students who received them.
          </>
        }
      />
    </div>
  );
}


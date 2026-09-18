'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/data/filters';
import { SupportPriorityBadge, SupportStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea } from '@/components/ui/field';
import { Drawer } from '@/components/ui/overlay';
import { Badge, PageHeader, StatTile } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { formatDateTime, formatPhone, formatRelative } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useListQuery } from '@/lib/use-list-query';
import { cn } from '@/lib/utils';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportStatus,
  type SupportTicketDetail,
  type SupportTicketRow,
} from '@/types/domain';

const FILTER_KEYS = ['status', 'priority', 'category'] as const;

/**
 * The Support Centre.
 *
 * Conversations are append-only. A ticket can be resolved or closed, and it
 * can be reopened by the student replying, but nothing here deletes a message
 * — a support history is the evidence in a payment dispute.
 *
 * Internal notes are visible to staff and never sent to the student. They are
 * marked clearly on screen, because a note accidentally written as a reply is
 * the failure mode that matters.
 */
export function SupportCentre() {
  const list = useListQuery({ filterKeys: FILTER_KEYS });
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const counters = useQuery({
    queryKey: queryKeys.support.counters,
    queryFn: () =>
      api.get<{
        open: number;
        pending: number;
        resolved: number;
        closed: number;
        unread: number;
        total: number;
      }>('admin/support/counters'),
  });

  const tickets = useQuery({
    queryKey: queryKeys.support.list(list.queryParams),
    queryFn: () => api.page<SupportTicketRow>('admin/support/tickets', { query: list.queryParams }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<SupportTicketRow>[] = [
    {
      key: 'reference',
      header: 'Ref',
      className: 'w-24',
      render: (ticket) => (
        <span className="font-mono text-xs text-muted">{ticket.reference}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      className: 'min-w-[16rem]',
      render: (ticket) => (
        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setOpenTicketId(ticket.id)}
            className={cn(
              'truncate text-start hover:text-primary hover:underline',
              ticket.unreadForStaff > 0
                ? 'font-semibold text-foreground'
                : 'font-medium text-foreground',
            )}
          >
            {ticket.subject}
          </button>
          <span className="truncate text-xs text-muted">
            {ticket.student.fullName} · {formatPhone(ticket.student.phone)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (ticket) => (
        <div className="flex flex-col items-start gap-1">
          <SupportStatusBadge status={ticket.status} />
          {ticket.unreadForStaff > 0 ? (
            <Badge tone="danger">{ticket.unreadForStaff} new</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      secondary: true,
      render: (ticket) => <SupportPriorityBadge priority={ticket.priority} />,
    },
    {
      key: 'category',
      header: 'Category',
      secondary: true,
      render: (ticket) => (
        <span className="text-xs text-muted capitalize">{ticket.category.toLowerCase()}</span>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned',
      secondary: true,
      render: (ticket) => (
        <span className="truncate text-xs text-muted">
          {ticket.assignedTo?.fullName ?? 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'lastMessageAt',
      header: 'Last activity',
      render: (ticket) => (
        <span
          className="whitespace-nowrap text-xs text-muted"
          title={formatDateTime(ticket.lastMessageAt)}
        >
          {formatRelative(ticket.lastMessageAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Support centre"
        description="Messages from students. Nothing here is ever deleted — closing a ticket is a status, and the conversation stays."
      />

      <section
        aria-label="Ticket counts"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <StatTile
          label="Open"
          value={counters.data?.open ?? 0}
          tone={counters.data?.open ? 'danger' : 'neutral'}
          loading={counters.isLoading}
        />
        <StatTile
          label="Awaiting student"
          value={counters.data?.pending ?? 0}
          tone="warning"
          loading={counters.isLoading}
        />
        <StatTile
          label="Resolved"
          value={counters.data?.resolved ?? 0}
          tone="success"
          loading={counters.isLoading}
        />
        <StatTile
          label="Unread by staff"
          value={counters.data?.unread ?? 0}
          tone={counters.data?.unread ? 'primary' : 'neutral'}
          loading={counters.isLoading}
        />
      </section>

      <DataTable
        columns={columns}
        rows={tickets.data?.items ?? []}
        rowKey={(ticket) => ticket.id}
        isLoading={tickets.isLoading}
        error={tickets.error}
        onRetry={() => void tickets.refetch()}
        meta={tickets.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onRowClick={(ticket) => setOpenTicketId(ticket.id)}
        caption="Support tickets"
        emptyTitle={list.isFiltered ? 'No tickets match these filters' : 'No tickets yet'}
        emptyDescription={
          list.isFiltered
            ? 'Try a different status or category.'
            : 'Tickets appear here when a student writes in from the app.'
        }
        toolbar={
          <FilterBar isFiltered={list.isFiltered} onClear={list.clear}>
            <SearchInput
              value={list.q}
              onChange={list.setSearch}
              placeholder="Search ref, subject or student…"
              label="Search tickets"
            />

            <FilterSelect
              label="Status"
              placeholder="Any status"
              value={list.filters.status ?? ''}
              onChange={(value) => list.setFilter('status', value)}
              options={SUPPORT_STATUSES.map((status) => ({
                value: status,
                label: status.toLowerCase(),
              }))}
            />

            <FilterSelect
              label="Priority"
              placeholder="Any priority"
              value={list.filters.priority ?? ''}
              onChange={(value) => list.setFilter('priority', value)}
              options={SUPPORT_PRIORITIES.map((priority) => ({
                value: priority,
                label: priority.toLowerCase(),
              }))}
            />

            <FilterSelect
              label="Category"
              placeholder="Any category"
              value={list.filters.category ?? ''}
              onChange={(value) => list.setFilter('category', value)}
              options={SUPPORT_CATEGORIES.map((category) => ({
                value: category,
                label: category.toLowerCase(),
              }))}
            />
          </FilterBar>
        }
      />

      <TicketDrawer ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />
    </div>
  );
}

function TicketDrawer({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);

  const ticket = useQuery({
    queryKey: queryKeys.support.detail(ticketId ?? 'none'),
    queryFn: () => api.get<SupportTicketDetail>(`admin/support/tickets/${ticketId}`),
    enabled: Boolean(ticketId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.support.all }),
      ticket.refetch(),
    ]);
  };

  const send = useMutation({
    mutationFn: (input: { body: string; isInternal: boolean }) =>
      api.post(`admin/support/tickets/${ticketId}/reply`, input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: { status?: SupportStatus; priority?: string }) =>
      api.patch(`admin/support/tickets/${ticketId}`, input),
    onSuccess: invalidate,
  });

  async function submitReply() {
    if (reply.trim().length < 1) return;

    try {
      await send.mutateAsync({ body: reply.trim(), isInternal: internal });
      toast.success(internal ? 'Internal note added' : 'Reply sent to the student');
      setReply('');
      setInternal(false);
    } catch (error) {
      toast.error(error, 'The message was not sent');
    }
  }

  const data = ticket.data;

  return (
    <Drawer
      open={ticketId !== null}
      onClose={onClose}
      width="xl"
      title={data?.subject ?? 'Ticket'}
      description={data ? `${data.reference} · ${data.student.fullName}` : undefined}
      footer={
        data ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Select
              aria-label="Ticket status"
              className="w-40"
              value={data.status}
              onChange={(event) =>
                void update.mutateAsync({ status: event.target.value as SupportStatus })
              }
              options={SUPPORT_STATUSES.map((status) => ({
                value: status,
                label: status.toLowerCase(),
              }))}
            />

            <Select
              aria-label="Ticket priority"
              className="w-36"
              value={data.priority}
              onChange={(event) => void update.mutateAsync({ priority: event.target.value })}
              options={SUPPORT_PRIORITIES.map((priority) => ({
                value: priority,
                label: priority.toLowerCase(),
              }))}
            />

            <div className="ms-auto flex items-center gap-2">
              <Button
                onClick={submitReply}
                loading={send.isPending}
                disabled={reply.trim().length === 0}
              >
                {internal ? 'Add note' : 'Send reply'}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {ticket.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : ticket.isError ? (
        <ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} />
      ) : data ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SupportStatusBadge status={data.status} />
            <SupportPriorityBadge priority={data.priority} />
            <Badge tone="neutral">{data.category.toLowerCase()}</Badge>
            <span className="text-xs text-muted">opened {formatDateTime(data.createdAt)}</span>
          </div>

          {data.messages.length === 0 ? (
            <EmptyState title="No messages" />
          ) : (
            <ol className="flex flex-col gap-3">
              {data.messages.map((message) => {
                const fromStudent = message.authorRole === 'STUDENT';

                return (
                  <li
                    key={message.id}
                    className={cn(
                      'rounded-xl border p-3',
                      message.isInternal
                        ? 'border-warning/30 bg-warning-soft'
                        : fromStudent
                          ? 'border-border bg-surface-alt'
                          : 'border-primary-border bg-primary-soft',
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {message.author?.fullName ?? (fromStudent ? 'Student' : 'Staff')}
                      </span>
                      {message.isInternal ? (
                        <Badge tone="warning">Internal note — not sent to the student</Badge>
                      ) : null}
                      <span className="ms-auto text-xs text-muted">
                        {formatDateTime(message.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                      {message.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="rounded-xl border border-border p-3">
            <Field label={internal ? 'Internal note' : 'Reply to the student'}>
              {({ id }) => (
                <TextArea
                  id={id}
                  rows={4}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={4000}
                  placeholder={
                    internal
                      ? 'Visible to staff only. The student never sees this.'
                      : 'This is sent to the student and notifies them in the app.'
                  }
                />
              )}
            </Field>

            <div className="mt-3">
              <Checkbox
                label="Internal note (staff only)"
                checked={internal}
                onChange={(event) => setInternal(event.target.checked)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

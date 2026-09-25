'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import { formatDateTime, formatPhone } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

/**
 * Device change requests.
 *
 * The student app lets a student on a new phone ask for it to be authorised
 * (`POST /devices/change-request`). Until now nothing in the dashboard showed
 * those requests, so the request went nowhere and the student stayed locked
 * out of protected content. This is the review queue for them — backed by
 * `GET /admin/devices/change-requests` and the approve/reject routes, which
 * swap the binding atomically on the server.
 */
interface ChangeRequestRow {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  requestedDeviceName: string;
  createdAt: string;
  user: { id: string; fullName: string; phone: string };
  requestedDevice: { platform: string; model: string | null; appVersion: string | null } | null;
}

const KEY = [...queryKeys.students.all, 'device-requests'] as const;

export function DeviceRequests() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{
    row: ChangeRequestRow;
    action: 'approve' | 'reject';
  } | null>(null);

  const requests = useQuery({
    queryKey: KEY,
    queryFn: () =>
      api.page<ChangeRequestRow>('admin/devices/change-requests', {
        query: { status: 'PENDING', page: 1, pageSize: 50 },
      }),
    refetchInterval: 60_000,
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`admin/devices/change-requests/${id}/${action}`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });

  async function run() {
    if (!pending) return;
    try {
      await review.mutateAsync({ id: pending.row.id, action: pending.action });
      toast.success(
        pending.action === 'approve' ? 'Device approved' : 'Request rejected',
        pending.action === 'approve'
          ? 'The new device is authorised; the previous one was signed out.'
          : 'The student keeps their current device.',
      );
    } catch (error) {
      toast.error(error);
    } finally {
      setPending(null);
    }
  }

  const rows = requests.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Device change requests"
        description="Students asking to move protected playback to a new phone."
      />
      <CardBody>
        {requests.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="Requests made from the app appear here for review."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {row.user.fullName}{' '}
                    <span className="text-muted">· {formatPhone(row.user.phone)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.requestedDeviceName}
                    {row.requestedDevice ? ` · ${row.requestedDevice.platform}` : ''} ·
                    requested {formatDateTime(row.createdAt)}
                    {row.reason ? ` · “${row.reason}”` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setPending({ row, action: 'approve' })}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPending({ row, action: 'reject' })}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => void run()}
        title={pending?.action === 'approve' ? 'Approve this device?' : 'Reject this request?'}
        message={
          pending?.action === 'approve' ? (
            <>
              <strong className="text-foreground">{pending?.row.requestedDeviceName}</strong>{' '}
              becomes {pending?.row.user.fullName}’s authorised device. Their previous device is
              revoked and signed out.
            </>
          ) : (
            <>The student keeps their current device and can request again.</>
          )
        }
        confirmLabel={pending?.action === 'approve' ? 'Approve' : 'Reject'}
        variant={pending?.action === 'approve' ? 'primary' : 'danger'}
        busy={review.isPending}
      />
    </Card>
  );
}

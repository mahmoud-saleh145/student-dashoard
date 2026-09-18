'use client';

import { useState } from 'react';

import { AccountStatusBadge, EnrollmentStateBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/overlay';
import {
  Badge,
  DescriptionList,
  SectionTitle,
} from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  useNotifyStudent,
  useResetDeviceBinding,
  useSetStudentStatus,
  useStudent,
  useStudentEnrollments,
  useStudentHistory,
  useStudentSessions,
} from '@/features/students/hooks';
import { formatDate, formatDateTime, formatMoney, formatPhone, maskCode } from '@/lib/format';

/**
 * One student.
 *
 * Deliberately absent: any way to see a password. The backend stores argon2id
 * hashes and exposes no endpoint that returns them or anything derived from
 * them — there is nothing to display, and the dashboard does not pretend
 * otherwise. Setting a new password is a write, and it revokes every session
 * the account holds.
 */
export function StudentDrawer({
  studentId,
  onClose,
}: {
  studentId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState('profile');
  const [confirming, setConfirming] = useState<'block' | 'unblock' | 'reset-device' | null>(
    null,
  );
  const [notifying, setNotifying] = useState(false);
  const [notification, setNotification] = useState({ title: '', body: '' });

  const student = useStudent(studentId);
  const enrollments = useStudentEnrollments(studentId);
  const sessions = useStudentSessions(studentId);
  const history = useStudentHistory(studentId);

  const setStatus = useSetStudentStatus();
  const resetBinding = useResetDeviceBinding();
  const notify = useNotifyStudent();

  const data = student.data;
  const blocked = data?.status === 'SUSPENDED' || data?.status === 'DISABLED';

  async function runConfirmed() {
    if (!studentId || !confirming) return;

    try {
      if (confirming === 'block') {
        await setStatus.mutateAsync({ id: studentId, status: 'SUSPENDED' });
        toast.success('Student blocked', 'Their sessions and playback were revoked.');
      } else if (confirming === 'unblock') {
        await setStatus.mutateAsync({ id: studentId, status: 'ACTIVE' });
        toast.success('Student unblocked');
      } else {
        await resetBinding.mutateAsync({
          userId: studentId,
          reason: 'Device change approved from the dashboard',
        });
        toast.success('Device binding cleared', 'The next device they sign in from is bound.');
        await sessions.refetch();
      }
    } catch (error) {
      toast.error(error);
    } finally {
      setConfirming(null);
    }
  }

  async function sendNotification() {
    if (!studentId) return;

    try {
      await notify.mutateAsync({
        userId: studentId,
        title: notification.title.trim(),
        body: notification.body.trim(),
      });
      toast.success('Notification sent');
      setNotification({ title: '', body: '' });
      setNotifying(false);
    } catch (error) {
      toast.error(error, 'The notification was not sent');
    }
  }

  return (
    <>
      <Drawer
        open={studentId !== null}
        onClose={onClose}
        width="xl"
        title={data?.fullName ?? 'Student'}
        description={data ? formatPhone(data.phone) : undefined}
        footer={
          data ? (
            <>
              <Button variant="secondary" onClick={() => setNotifying(true)}>
                Send notification
              </Button>

              {blocked ? (
                <Button variant="primary" onClick={() => setConfirming('unblock')}>
                  Unblock
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirming('block')}>
                  Block account
                </Button>
              )}
            </>
          ) : null
        }
      >
        {student.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : student.isError ? (
          <ErrorState error={student.error} onRetry={() => void student.refetch()} />
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <AccountStatusBadge status={data.status} />
              <Badge tone="neutral">Registered {formatDate(data.createdAt)}</Badge>
            </div>

            <Tabs
              tabs={[
                { id: 'profile', label: 'Profile' },
                { id: 'devices', label: 'Device' },
                { id: 'purchases', label: 'Purchases' },
                { id: 'history', label: 'Admin history' },
              ]}
              active={tab}
              onChange={setTab}
            />

            <TabPanel id="profile" active={tab}>
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Full name', value: data.fullName },
                  { label: 'Phone', value: <span dir="ltr">{formatPhone(data.phone)}</span> },
                  { label: 'Email', value: data.email ?? '—' },
                  { label: 'Gender', value: data.gender.toLowerCase() },
                  { label: 'University', value: data.university?.name ?? '—' },
                  { label: 'College', value: data.faculty?.name ?? '—' },
                  { label: 'Department', value: data.department?.name ?? '—' },
                  { label: 'Academic year', value: data.academicYear?.name ?? '—' },
                  { label: 'Registered', value: formatDateTime(data.createdAt) },
                  { label: 'Last login', value: formatDateTime(data.lastLoginAt) },
                ]}
              />

              <p className="mt-5 rounded-lg border border-border bg-surface-alt p-3 text-xs text-muted">
                Passwords are stored as one-way hashes and are never retrievable — not here, not
                anywhere in the API. If this student is locked out, set a new password from their
                account; doing so signs them out of every session.
              </p>
            </TabPanel>

            <TabPanel id="devices" active={tab}>
              <SectionTitle
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirming('reset-device')}
                  >
                    Clear device binding
                  </Button>
                }
              >
                Registered device
              </SectionTitle>

              {sessions.isLoading ? (
                <Skeleton className="mt-3 h-24 w-full" />
              ) : (sessions.data?.items.length ?? 0) === 0 ? (
                <EmptyState
                  title="No sessions recorded"
                  description="This account has not signed in from a device yet."
                />
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {sessions.data?.items.map((session) => (
                    <li key={session.id} className="py-3 first:pt-0">
                      <DescriptionList
                        columns={2}
                        items={[
                          { label: 'Device', value: session.device?.name ?? session.platform ?? '—' },
                          { label: 'Platform', value: session.platform ?? '—' },
                          { label: 'App version', value: session.appVersion ?? '—' },
                          {
                            label: 'IP address',
                            value: <span dir="ltr">{session.ipAddress ?? '—'}</span>,
                          },
                          { label: 'First seen', value: formatDateTime(session.createdAt) },
                          { label: 'Last activity', value: formatDateTime(session.lastSeenAt) },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </TabPanel>

            <TabPanel id="purchases" active={tab}>
              {enrollments.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (enrollments.data?.items.length ?? 0) === 0 ? (
                <EmptyState
                  title="No purchases yet"
                  description="Courses this student joins — by code, payment or admin grant — appear here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {enrollments.data?.items.map((enrollment) => (
                    <li key={enrollment.id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {enrollment.course.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {enrollment.coversAllSections
                              ? 'Whole course'
                              : `${enrollment.sectionIds?.length ?? 0} section(s)`}{' '}
                            · access from {formatDate(enrollment.accessStartsAt)}
                            {enrollment.accessEndsAt
                              ? ` until ${formatDate(enrollment.accessEndsAt)}`
                              : ' · lifetime'}
                          </p>

                          {enrollment.redemption ? (
                            <p className="mt-1 font-mono text-xs text-muted">
                              {maskCode(enrollment.redemption.code)}
                              {enrollment.redemption.amount !== null
                                ? ` · ${formatMoney(enrollment.redemption.amount, enrollment.redemption.currency)}`
                                : ''}
                            </p>
                          ) : enrollment.payments.length > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              {formatMoney(
                                enrollment.payments[0]?.amount,
                                enrollment.payments[0]?.currency,
                              )}{' '}
                              paid {formatDate(enrollment.payments[0]?.paidAt)}
                            </p>
                          ) : null}
                        </div>

                        <EnrollmentStateBadge state={enrollment.state} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabPanel>

            <TabPanel id="history" active={tab}>
              {history.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : history.isError ? (
                <ErrorState error={history.error} onRetry={() => void history.refetch()} />
              ) : (history.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No administrative changes recorded"
                  description="Every admin action on this account is written to the audit trail and appears here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {history.data?.map((entry) => (
                    <li key={entry.id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {entry.action.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        by {entry.actor?.fullName ?? 'system'}
                        {entry.note ? ` — ${entry.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabPanel>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={runConfirmed}
        title={
          confirming === 'block'
            ? 'Block this account?'
            : confirming === 'unblock'
              ? 'Unblock this account?'
              : 'Clear the device binding?'
        }
        message={
          confirming === 'block' ? (
            <>
              The student is signed out everywhere immediately and cannot sign in again. Their
              purchases, watch history and support tickets are all kept, and unblocking restores
              access exactly as it was.
            </>
          ) : confirming === 'unblock' ? (
            <>Their account becomes usable again, with the access they had before.</>
          ) : (
            <>
              The current device stops being authorised for protected content. The next device
              this student signs in from becomes the bound one, up to the platform’s device
              limit.
            </>
          )
        }
        confirmLabel={
          confirming === 'block' ? 'Block' : confirming === 'unblock' ? 'Unblock' : 'Clear binding'
        }
        variant={confirming === 'unblock' ? 'primary' : 'danger'}
        busy={setStatus.isPending || resetBinding.isPending}
      />

      <Modal
        open={notifying}
        onClose={() => setNotifying(false)}
        title="Send a notification"
        description={data ? `To ${data.fullName}` : undefined}
        busy={notify.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotifying(false)}>
              Cancel
            </Button>
            <Button
              onClick={sendNotification}
              loading={notify.isPending}
              disabled={
                notification.title.trim().length < 3 || notification.body.trim().length < 3
              }
            >
              Send
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            {({ id }) => (
              <TextInput
                id={id}
                value={notification.title}
                onChange={(event) =>
                  setNotification((current) => ({ ...current, title: event.target.value }))
                }
                maxLength={200}
                autoFocus
              />
            )}
          </Field>

          <Field label="Message" required>
            {({ id }) => (
              <TextArea
                id={id}
                rows={4}
                value={notification.body}
                onChange={(event) =>
                  setNotification((current) => ({ ...current, body: event.target.value }))
                }
                maxLength={2000}
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  );
}

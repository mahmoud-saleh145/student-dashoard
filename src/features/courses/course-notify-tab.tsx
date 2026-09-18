'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCourseAnnouncement } from '@/features/courses/hooks';

/**
 * Notify the students of one course.
 *
 * Targeting is fixed to this course and is applied by the backend from the
 * `courseId` in the request — a teacher cannot widen it to "all students" by
 * editing anything the browser sends, because the announcement endpoint
 * resolves recipients server-side from the course they are allowed to manage.
 *
 * Sending is irreversible: a push notification cannot be recalled. That is why
 * there is a confirmation step showing exactly what will go out.
 */
export function CourseNotifyTab({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const toast = useToast();
  const announce = useCourseAnnouncement();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [confirming, setConfirming] = useState(false);

  const canSend = title.trim().length >= 3 && body.trim().length >= 3;

  async function send() {
    try {
      await announce.mutateAsync({
        courseId,
        title: title.trim(),
        body: body.trim(),
        titleAr: titleAr.trim() || undefined,
        bodyAr: bodyAr.trim() || undefined,
      });

      toast.success('Notification sent', `Delivered to the students of ${courseTitle}.`);
      setTitle('');
      setBody('');
      setTitleAr('');
      setBodyAr('');
    } catch (error) {
      toast.error(error, 'The notification was not sent');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Notify these students"
          description={`Goes to every student with access to ${courseTitle}, in their inbox and as a push notification.`}
        />

        <CardBody className="flex flex-col gap-4">
          <Field label="Title" required hint="Shown as the notification headline.">
            {({ id }) => (
              <TextInput
                id={id}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="e.g. New lecture published"
              />
            )}
          </Field>

          <Field label="Message" required>
            {({ id }) => (
              <TextArea
                id={id}
                rows={4}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                placeholder="What do these students need to know?"
              />
            )}
          </Field>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Arabic version (optional)
            </summary>

            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-muted">
                Both languages are stored on the notification, so a student who switches the app
                to Arabic sees the Arabic text even for messages sent earlier. Left blank, the
                English text is shown to everyone.
              </p>

              <Field label="Arabic title">
                {({ id }) => (
                  <TextInput
                    id={id}
                    dir="rtl"
                    value={titleAr}
                    onChange={(event) => setTitleAr(event.target.value)}
                    maxLength={200}
                  />
                )}
              </Field>

              <Field label="Arabic message">
                {({ id }) => (
                  <TextArea
                    id={id}
                    dir="rtl"
                    rows={4}
                    value={bodyAr}
                    onChange={(event) => setBodyAr(event.target.value)}
                    maxLength={2000}
                  />
                )}
              </Field>
            </div>
          </details>

          <div className="flex justify-end">
            <Button onClick={() => setConfirming(true)} disabled={!canSend}>
              Send notification
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preview" description="Roughly how it appears in the app." />
        <CardBody>
          <div className="rounded-xl border border-border bg-surface-alt p-4">
            <p className="text-sm font-semibold text-foreground">
              {title.trim() || 'Notification title'}
            </p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted">
              {body.trim() || 'Your message appears here.'}
            </p>
          </div>

          <p className="mt-4 text-xs text-muted">
            Recipients are resolved by the server from this course. There is no way to send to
            another course’s students from this screen.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
        title="Send this notification?"
        message={
          <>
            It goes to every student with access to{' '}
            <strong className="text-foreground">{courseTitle}</strong>, immediately, as an inbox
            message and a push notification. A sent notification cannot be recalled.
          </>
        }
        confirmLabel="Send now"
        variant="primary"
        busy={announce.isPending}
      />
    </div>
  );
}

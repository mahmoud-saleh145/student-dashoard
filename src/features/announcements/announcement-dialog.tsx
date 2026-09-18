'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Switch, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { fieldErrors, messageFor } from '@/lib/errors';
import type {
  AnnouncementDetail,
  AnnouncementScheduleInput,
  AudienceRule,
} from '@/types/commerce';

import { AudienceBuilder } from './audience-builder';
import { ScheduleBuilder } from './schedule-builder';
import { useCreateAnnouncement, useUpdateAnnouncement } from './hooks';

/**
 * Writing an announcement.
 *
 * Three steps in the order the decision is actually made: what it says, who
 * gets it, when it goes. The audience tab carries the recipient count, and the
 * send button restates it — the last thing an administrator should see before
 * an irreversible broadcast is how many phones it will reach.
 */
export function AnnouncementDialog({
  open,
  onClose,
  announcement,
}: {
  open: boolean;
  onClose: () => void;
  /** Null when composing a new one. */
  announcement: AnnouncementDetail | null;
}) {
  const toast = useToast();
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();

  const [tab, setTab] = useState('content');
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [body, setBody] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [route, setRoute] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [audience, setAudience] = useState<AudienceRule>({});
  const [schedule, setSchedule] = useState<AnnouncementScheduleInput>({
    frequency: 'ONCE',
  });
  const [sendNow, setSendNow] = useState(false);

  const editing = Boolean(announcement);

  useEffect(() => {
    if (!open) return;

    setTab('content');
    setTitle(announcement?.title ?? '');
    setTitleAr(announcement?.titleAr ?? '');
    setBody(announcement?.body ?? '');
    setBodyAr(announcement?.bodyAr ?? '');
    setRoute(announcement?.route ?? '');
    setSendPush(announcement?.sendPush ?? true);
    setAudience(announcement?.audienceRule ?? {});
    setSendNow(false);
    setSchedule({
      frequency: announcement?.frequency ?? 'ONCE',
      sendAtLocal: announcement?.sendAtLocal ?? undefined,
      timezone: announcement?.timezone,
      weekdays: announcement?.weekdays?.length ? announcement.weekdays : undefined,
      dayOfMonth: announcement?.dayOfMonth ?? undefined,
      startsOn: announcement?.startsOn ?? undefined,
      endsOn: announcement?.endsOn ?? undefined,
      maxOccurrences: announcement?.maxOccurrences ?? undefined,
    });

    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, announcement?.id]);

  const pending = create.isPending || update.isPending;
  const errors = fieldErrors(create.error ?? update.error);

  const contentValid = title.trim().length >= 3 && body.trim().length >= 3;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      title: title.trim(),
      titleAr: titleAr.trim() || undefined,
      body: body.trim(),
      bodyAr: bodyAr.trim() || undefined,
      route: route.trim() || undefined,
      sendPush,
      audience: Object.keys(audience).length > 0 ? audience : undefined,
      ...schedule,
    };

    try {
      if (announcement) {
        await update.mutateAsync({ id: announcement.id, ...payload });
        toast.success('Announcement updated');
      } else {
        await create.mutateAsync({ ...payload, sendNow: sendNow || undefined });
        toast.success(
          sendNow ? 'Announcement sent' : 'Announcement saved',
          sendNow ? undefined : 'It will go out on its schedule.',
        );
      }
      onClose();
    } catch (error) {
      toast.error(error, 'The announcement was not saved');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit announcement' : 'New announcement'}
      description={
        editing
          ? 'Editing is refused once it has sent even once — the text is what people received.'
          : 'A push cannot be recalled. Check the audience before sending.'
      }
      size="xl"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          {!editing ? (
            <Button
              variant="outline"
              onClick={() => {
                setSendNow(false);
                (document.getElementById('announcement-form') as HTMLFormElement)?.requestSubmit();
              }}
              disabled={!contentValid || pending}
            >
              Save without sending
            </Button>
          ) : null}
          <Button
            type="submit"
            form="announcement-form"
            loading={pending}
            disabled={!contentValid}
            onClick={() => setSendNow(!editing && !schedule.sendAtLocal)}
          >
            {editing ? 'Save changes' : schedule.sendAtLocal ? 'Schedule' : 'Send now'}
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} className="space-y-4">
        <Tabs
          tabs={[
            { id: 'content', label: 'Message' },
            { id: 'audience', label: 'Audience' },
            { id: 'schedule', label: 'Schedule' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <TabPanel id="content" active={tab}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" required error={errors.title}>
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                    placeholder="Revision week starts Sunday"
                  />
                )}
              </Field>

              <Field
                label="Title (Arabic)"
                hint="Shown to students reading in Arabic."
                error={errors.titleAr}
              >
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    dir="rtl"
                    value={titleAr}
                    onChange={(event) => setTitleAr(event.target.value)}
                    maxLength={200}
                  />
                )}
              </Field>
            </div>

            <Field label="Message" required error={errors.body}>
              {({ id, describedBy, invalid }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  rows={4}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={2000}
                />
              )}
            </Field>

            <Field label="Message (Arabic)" error={errors.bodyAr}>
              {({ id, describedBy }) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  dir="rtl"
                  rows={4}
                  value={bodyAr}
                  onChange={(event) => setBodyAr(event.target.value)}
                  maxLength={2000}
                />
              )}
            </Field>

            <Field
              label="Opens this screen"
              hint="An in-app path such as /course/abc. External links are rejected by the server."
              error={errors.route}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={route}
                  onChange={(event) => setRoute(event.target.value)}
                  placeholder="/notifications"
                  className="font-mono text-xs"
                />
              )}
            </Field>

            <div className="rounded-lg border border-border px-4 py-1">
              <Switch
                checked={sendPush}
                onChange={setSendPush}
                label="Also send a push notification"
                description="Off means it appears in the app's inbox without buzzing a phone. Students who muted announcements are never pushed either way."
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel id="audience" active={tab}>
          <AudienceBuilder
            rule={audience}
            onChange={setAudience}
            previewEnabled={open && tab === 'audience'}
          />
        </TabPanel>

        <TabPanel id="schedule" active={tab}>
          <ScheduleBuilder value={schedule} onChange={setSchedule} />
        </TabPanel>

        {(create.error ?? update.error) && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(create.error ?? update.error)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

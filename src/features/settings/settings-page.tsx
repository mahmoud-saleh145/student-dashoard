'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Switch, TextInput } from '@/components/ui/field';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { CardsSkeleton, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { usePlatformSettings, useUpdateSettings } from '@/features/settings/hooks';
import type { PlatformSettings } from '@/types/domain';

/**
 * Platform settings.
 *
 * Everything on this page is enforced by the API at the point of use, not by
 * this screen: the device limit is applied when a student signs in, the four
 * teacher switches are re-checked on every content mutation, and the academic
 * year toggle is checked when a student submits a profile change. Turning a
 * switch off here removes the control from the teacher's dashboard *and* makes
 * the backend refuse the request — the second one is the one that matters.
 *
 * Changes are staged locally and saved together, so a half-applied set of
 * permissions never exists.
 */
export function SettingsPage() {
  const toast = useToast();
  const settings = usePlatformSettings();
  const update = useUpdateSettings();

  const [draft, setDraft] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    if (settings.data?.settings) setDraft(settings.data.settings);
  }, [settings.data]);

  const dirty =
    draft !== null &&
    settings.data?.settings !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(settings.data.settings);

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!draft) return;

    try {
      await update.mutateAsync(draft);
      toast.success('Settings saved', 'They take effect immediately, platform-wide.');
    } catch (error) {
      toast.error(error, 'The settings were not saved');
    }
  }

  if (settings.isLoading || !draft) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Settings" />
        <CardsSkeleton count={3} />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Settings" />
        <Card>
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        </Card>
      </div>
    );
  }

  const deviceLimit = draft['student.deviceLimit'];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Platform-wide rules. Every one of these is enforced by the server, not just reflected in this interface."
      />

      <Card>
        <CardHeader
          title="Student devices"
          description="How many devices one student account may be bound to at a time."
        />
        <CardBody className="flex flex-col gap-4">
          <Field
            label="Allowed devices per student"
            hint="The default is 1, which is what stops one account being shared across a study group. Raising it applies to new bindings; existing students are unaffected until they add a device."
          >
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                className="sm:w-32"
                value={String(deviceLimit)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= 10) {
                    set('student.deviceLimit', next);
                  }
                }}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Teacher permissions"
          description="What teachers may do inside their own courses. These apply on top of each teacher's per-course assignment — both must allow an action."
        />
        <CardBody className="divide-y divide-border">
          <Switch
            label="Delete lectures"
            description="Lets a teacher archive a lecture in their own course. Watch history and purchases are always kept."
            checked={draft['teacher.canDeleteLectures']}
            onChange={(value) => set('teacher.canDeleteLectures', value)}
          />
          <Switch
            label="Delete videos"
            description="Lets a teacher archive a video and purge its stored media."
            checked={draft['teacher.canDeleteVideos']}
            onChange={(value) => set('teacher.canDeleteVideos', value)}
          />
          <Switch
            label="Replace video sources"
            description="Lets a teacher upload a new video over an existing lecture. A first upload onto an empty lecture is ordinary authoring and is never blocked by this."
            checked={draft['teacher.canEditVideoUrls']}
            onChange={(value) => set('teacher.canEditVideoUrls', value)}
          />
          <Switch
            label="Edit course prices"
            description="Lets a teacher change the price of their own course. Historical purchases and reported revenue are never rewritten by a price change."
            checked={draft['teacher.canEditCoursePrices']}
            onChange={(value) => set('teacher.canEditCoursePrices', value)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Student interface"
          description="What students can change about their own account from the mobile app."
        />
        <CardBody>
          <Switch
            label="Allow students to change their academic year"
            description="Academic year decides which courses a student is offered. With this off, only an administrator can change it."
            checked={draft['student.allowAcademicYearChange']}
            onChange={(value) => set('student.allowAcademicYearChange', value)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Contact information"
          description="Shown to students in the app's support screen. Leave a field blank to hide it."
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            {({ id }) => (
              <TextInput
                id={id}
                dir="ltr"
                value={draft['contact.phone']}
                onChange={(event) => set('contact.phone', event.target.value)}
                maxLength={40}
              />
            )}
          </Field>

          <Field label="WhatsApp">
            {({ id }) => (
              <TextInput
                id={id}
                dir="ltr"
                value={draft['contact.whatsapp']}
                onChange={(event) => set('contact.whatsapp', event.target.value)}
                maxLength={40}
              />
            )}
          </Field>

          <Field label="Facebook page">
            {({ id }) => (
              <TextInput
                id={id}
                dir="ltr"
                placeholder="https://facebook.com/…"
                value={draft['contact.facebook']}
                onChange={(event) => set('contact.facebook', event.target.value)}
                maxLength={300}
              />
            )}
          </Field>

          <Field label="Support email">
            {({ id }) => (
              <TextInput
                id={id}
                type="email"
                dir="ltr"
                value={draft['contact.email']}
                onChange={(event) => set('contact.email', event.target.value)}
                maxLength={160}
              />
            )}
          </Field>
        </CardBody>
      </Card>

      {/*
        The sticky bar is the ONLY save control on this page, deliberately.
        A second one in the header would give the screen two identically named
        buttons — confusing to read out, and ambiguous to automate against —
        and it would scroll out of sight exactly when it is needed, since these
        settings run well past one screen.
      */}
      {dirty ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-primary-border bg-primary-soft px-4 py-3 shadow-lg">
          <p className="text-sm text-primary">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setDraft(settings.data?.settings ?? null)}
              disabled={update.isPending}
            >
              Discard
            </Button>
            <Button onClick={save} loading={update.isPending}>
              Save changes
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

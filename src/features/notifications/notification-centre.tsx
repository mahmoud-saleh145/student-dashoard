'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { SearchInput } from '@/components/data/filters';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAcademicYears, useUniversities } from '@/features/catalog/hooks';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useSession } from '@/lib/session-context';
import type { CourseSummary } from '@/types/domain';

type Audience = 'ALL' | 'COURSES' | 'SEGMENT';

/**
 * The Notification Centre.
 *
 * Recipients are resolved by the backend from the targeting fields sent with
 * the announcement — a course, a university, an academic year, or nothing at
 * all for every active student. Nothing about the audience is computed in the
 * browser, so what is shown here as the target is what the server actually
 * fans out to.
 *
 * A teacher never sees "all students": the option is not offered, and the
 * announcement endpoint is admin-only, so their notifications go through the
 * per-course screen where ownership is checked.
 */
export function NotificationCentre() {
  const toast = useToast();
  const { can } = useSession();

  const canBroadcast = can('sendBroadcastNotifications');

  const [audience, setAudience] = useState<Audience>(canBroadcast ? 'ALL' : 'COURSES');
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [universityId, setUniversityId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [confirming, setConfirming] = useState(false);

  const universities = useUniversities();
  const years = useAcademicYears();

  const courses = useQuery({
    queryKey: queryKeys.courses.list({ picker: 'notifications' }),
    queryFn: () =>
      api.page<CourseSummary>('admin/courses', { query: { page: 1, pageSize: 100 } }),
  });

  const send = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.post('notifications/announcements', { ...input, publishNow: true }),
  });

  const filteredCourses = useMemo(() => {
    const rows = courses.data?.items ?? [];
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((course) => course.title.toLowerCase().includes(needle));
  }, [courses.data, search]);

  const canSend =
    title.trim().length >= 3 &&
    body.trim().length >= 3 &&
    (audience !== 'COURSES' || selectedCourses.length > 0);

  async function submit() {
    try {
      const base = {
        title: title.trim(),
        body: body.trim(),
        titleAr: titleAr.trim() || undefined,
        bodyAr: bodyAr.trim() || undefined,
      };

      if (audience === 'COURSES') {
        // One announcement per course: the endpoint targets a single course,
        // and sending them separately keeps each student's inbox entry linked
        // to the course it is about.
        for (const courseId of selectedCourses) {
          await send.mutateAsync({ ...base, courseId, route: `/course/${courseId}` });
        }
        toast.success(
          'Notifications sent',
          `Delivered to the students of ${selectedCourses.length} course${selectedCourses.length === 1 ? '' : 's'}.`,
        );
      } else if (audience === 'SEGMENT') {
        await send.mutateAsync({
          ...base,
          universityId: universityId || undefined,
          academicYearId: academicYearId || undefined,
        });
        toast.success('Notification sent', 'Delivered to the selected group.');
      } else {
        await send.mutateAsync(base);
        toast.success('Notification sent', 'Delivered to every active student.');
      }

      setTitle('');
      setBody('');
      setTitleAr('');
      setBodyAr('');
      setSelectedCourses([]);
    } catch (error) {
      toast.error(error, 'The notification was not sent');
    } finally {
      setConfirming(false);
    }
  }

  const audienceLabel =
    audience === 'ALL'
      ? 'every active student on the platform'
      : audience === 'COURSES'
        ? `the students of ${selectedCourses.length} selected course${selectedCourses.length === 1 ? '' : 's'}`
        : describeSegment(universityId, academicYearId, universities.data, years.data);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notification centre"
        description="Send an in-app message and push notification. Recipients are resolved on the server from the target you choose."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Who should receive this?" />
            <CardBody className="flex flex-col gap-3">
              {canBroadcast ? (
                <AudienceOption
                  checked={audience === 'ALL'}
                  onSelect={() => setAudience('ALL')}
                  title="All students"
                  description="Every active student account on the platform."
                />
              ) : null}

              <AudienceOption
                checked={audience === 'COURSES'}
                onSelect={() => setAudience('COURSES')}
                title="Selected courses"
                description="Students with access to the courses you pick."
              />

              {canBroadcast ? (
                <AudienceOption
                  checked={audience === 'SEGMENT'}
                  onSelect={() => setAudience('SEGMENT')}
                  title="A university or academic year"
                  description="Narrow the broadcast to one group of students."
                />
              ) : null}

              {audience === 'COURSES' ? (
                <div className="mt-2 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder="Search courses…"
                      label="Search courses to notify"
                    />
                    <span className="text-xs text-muted">
                      {selectedCourses.length} selected
                    </span>
                  </div>

                  {courses.isLoading ? (
                    <Skeleton className="mt-3 h-40 w-full" />
                  ) : filteredCourses.length === 0 ? (
                    <EmptyState title="No courses match that search" />
                  ) : (
                    <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                      {filteredCourses.map((course) => (
                        <li key={course.id}>
                          <Checkbox
                            label={
                              <span className="flex flex-wrap items-center gap-2">
                                {course.title}
                                <span className="text-xs text-muted">
                                  {formatNumber(course.studentCount)} students
                                </span>
                              </span>
                            }
                            checked={selectedCourses.includes(course.id)}
                            onChange={(event) =>
                              setSelectedCourses((current) =>
                                event.target.checked
                                  ? [...current, course.id]
                                  : current.filter((id) => id !== course.id),
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {audience === 'SEGMENT' ? (
                <div className="mt-2 grid grid-cols-1 gap-4 rounded-xl border border-border p-3 sm:grid-cols-2">
                  <Field label="University" hint="Leave blank for all universities.">
                    {({ id }) => (
                      <select
                        id={id}
                        value={universityId}
                        onChange={(event) => setUniversityId(event.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                      >
                        <option value="">Any university</option>
                        {(universities.data ?? []).map((university) => (
                          <option key={university.id} value={university.id}>
                            {university.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field label="Academic year" hint="Leave blank for all years.">
                    {({ id }) => (
                      <select
                        id={id}
                        value={academicYearId}
                        onChange={(event) => setAcademicYearId(event.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                      >
                        <option value="">Any year</option>
                        {(years.data ?? []).map((year) => (
                          <option key={year.id} value={year.id}>
                            {year.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Message" />
            <CardBody className="flex flex-col gap-4">
              <Field label="Notification title" required>
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                  />
                )}
              </Field>

              <Field label="Content" required>
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={5}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={2000}
                  />
                )}
              </Field>

              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Arabic version (optional)
                </summary>

                <div className="mt-3 flex flex-col gap-3">
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

                  <Field label="Arabic content">
                    {({ id }) => (
                      <TextArea
                        id={id}
                        dir="rtl"
                        rows={5}
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
        </div>

        <Card>
          <CardHeader title="Preview" description="Roughly how it appears in the app." />
          <CardBody className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface-alt p-4">
              <p className="text-sm font-semibold text-foreground">
                {title.trim() || 'Notification title'}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted">
                {body.trim() || 'Your message appears here.'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Audience</p>
              <p className="mt-1 text-sm text-foreground">{audienceLabel}</p>
            </div>

            <Badge tone="info">Sends immediately · cannot be recalled</Badge>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
        title="Send this notification?"
        message={
          <>
            It goes to <strong className="text-foreground">{audienceLabel}</strong> immediately,
            as an inbox message and a push notification. A sent notification cannot be recalled.
          </>
        }
        confirmLabel="Send now"
        variant="primary"
        busy={send.isPending}
      />
    </div>
  );
}

function AudienceOption({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={`flex items-start gap-3 rounded-xl border p-3 text-start transition-colors ${
        checked
          ? 'border-primary bg-primary-soft'
          : 'border-border hover:border-border-strong hover:bg-surface-alt'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? 'border-primary' : 'border-border-strong'
        }`}
        aria-hidden="true"
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}

function describeSegment(
  universityId: string,
  academicYearId: string,
  universities: { id: string; name: string }[] | undefined,
  years: { id: string; name: string }[] | undefined,
): string {
  const university = universities?.find((item) => item.id === universityId)?.name;
  const year = years?.find((item) => item.id === academicYearId)?.name;

  if (!university && !year) return 'every active student on the platform';
  if (university && year) return `${year} students at ${university}`;
  if (university) return `every student at ${university}`;
  return `every ${year} student`;
}

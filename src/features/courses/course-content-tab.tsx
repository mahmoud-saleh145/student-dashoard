'use client';

import { useState } from 'react';

import { ContentStatusBadge, VideoStatusBadge } from '@/components/data/status';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Field, Switch, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LessonAnalyticsDrawer } from '@/features/courses/lesson-analytics-drawer';
import {
  useArchiveSection,
  useCourseSections,
  useCreateLesson,
  useCreateSection,
  useDeleteLesson,
  useSetLessonStatus,
  useUpdateSection,
} from '@/features/courses/hooks';
import { useTeacherCapabilities } from '@/features/settings/hooks';
import { LessonVideoPanel } from '@/features/videos/lesson-video-panel';
import { formatDuration } from '@/lib/format';
import { useSession } from '@/lib/session-context';
import type { ContentStatus, LessonRow, SectionRow } from '@/types/domain';

/**
 * Sections and lectures — the authoring view.
 *
 * Everything here reads `GET /admin/courses/:id/sections`, the staff endpoint
 * that returns every non-deleted lecture whatever its status, each with its
 * live video and a real video count. (It used to read the *student* endpoint,
 * which cannot show a lecture's status or an archived lecture at all.)
 *
 * The lifecycle of a lecture, and what each action does on the backend:
 *
 *   Publish    PATCH status=PUBLISHED  students with access see and play it
 *   Unpublish  PATCH status=DRAFT      hidden from students, kept for editing
 *   Archive    PATCH status=ARCHIVED   retired, reversible — Restore brings it back
 *   Restore    PATCH status=PUBLISHED
 *   Delete     DELETE                  soft delete: gone from the dashboard and
 *                                      the app, watch history kept, not reversible
 *
 * New lectures start as DRAFT on the backend; the add dialog publishes
 * immediately unless the author turns that off, and a draft says "not visible
 * to students" on its row, so a lecture can no longer sit invisible by
 * accident.
 */
export function CourseContentTab({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { isAdmin } = useSession();
  const capabilities = useTeacherCapabilities();

  const sections = useCourseSections(courseId);
  const createSection = useCreateSection(courseId);
  const archiveSection = useArchiveSection(courseId);
  const updateSection = useUpdateSection(courseId);
  const setLessonStatus = useSetLessonStatus(courseId);
  const deleteLesson = useDeleteLesson(courseId);

  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [addingLessonTo, setAddingLessonTo] = useState<SectionRow | null>(null);
  const [confirming, setConfirming] = useState<
    | { kind: 'delete-section'; id: string; title: string }
    | { kind: 'delete-lesson'; id: string; title: string }
    | { kind: 'archive-lesson'; id: string; title: string }
    | null
  >(null);
  const [analyticsLesson, setAnalyticsLesson] = useState<LessonRow | null>(null);
  const [videoLesson, setVideoLesson] = useState<LessonRow | null>(null);

  const canDelete = isAdmin || capabilities.canDeleteLectures;

  async function submitSection() {
    if (sectionTitle.trim().length < 2) return;

    try {
      await createSection.mutateAsync({ title: sectionTitle.trim() });
      toast.success('Section added');
      setSectionTitle('');
      setAddingSection(false);
    } catch (error) {
      toast.error(error);
    }
  }

  async function changeLessonStatus(lesson: LessonRow, status: ContentStatus) {
    try {
      await setLessonStatus.mutateAsync({ lessonId: lesson.id, status });
      const messages: Record<ContentStatus, [string, string]> = {
        PUBLISHED:
          lesson.status === 'ARCHIVED'
            ? ['Lecture restored', 'It is published again and visible to students with access.']
            : ['Lecture published', 'Students with access can now see it.'],
        DRAFT: [
          'Lecture unpublished',
          'It is hidden from students until you publish it again.',
        ],
        HIDDEN: ['Lecture hidden', 'Students no longer see it.'],
        ARCHIVED: ['Lecture archived', 'Hidden from students. Restore it at any time.'],
      };
      toast.success(...messages[status]);
    } catch (error) {
      toast.error(error);
    }
  }

  async function changeSectionStatus(section: SectionRow, status: ContentStatus) {
    try {
      await updateSection.mutateAsync({ sectionId: section.id, status });
      toast.success(
        status === 'PUBLISHED' ? 'Section visible' : 'Section hidden',
        status === 'PUBLISHED'
          ? 'Its published lectures are visible to students again.'
          : 'Students no longer see it or its lectures.',
      );
    } catch (error) {
      toast.error(error);
    }
  }

  async function confirmAction() {
    if (!confirming) return;

    try {
      if (confirming.kind === 'delete-section') {
        await archiveSection.mutateAsync({ sectionId: confirming.id });
        toast.success(
          'Section deleted',
          'Its lectures were deleted with it. Watch history was kept.',
        );
      } else if (confirming.kind === 'delete-lesson') {
        await deleteLesson.mutateAsync({ lessonId: confirming.id });
        toast.success('Lecture deleted', 'Watch history and purchases were kept.');
      } else {
        await setLessonStatus.mutateAsync({ lessonId: confirming.id, status: 'ARCHIVED' });
        toast.success('Lecture archived', 'Hidden from students. Restore it at any time.');
      }
    } catch (error) {
      toast.error(error);
    } finally {
      setConfirming(null);
    }
  }

  if (sections.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (sections.isError) {
    return (
      <Card>
        <ErrorState error={sections.error} onRetry={() => void sections.refetch()} />
      </Card>
    );
  }

  const rows = sections.data ?? [];

  const confirmCopy = confirming
    ? confirming.kind === 'delete-section'
      ? {
          title: 'Delete this section?',
          label: 'Delete section',
          body: (
            <>
              <strong className="text-foreground">{confirming.title}</strong> and every lecture
              in it are removed from the dashboard and the app. This cannot be undone here.
              Watch history, purchases and code redemptions that reference them are kept. To
              hide it temporarily, use “Hide from students” instead.
            </>
          ),
        }
      : confirming.kind === 'delete-lesson'
        ? {
            title: 'Delete this lecture?',
            label: 'Delete lecture',
            body: (
              <>
                <strong className="text-foreground">{confirming.title}</strong> is removed from
                the dashboard and the app, and anyone watching it is stopped. This cannot be
                undone here. Its watch history is kept, because it is the record of what
                students already paid for and watched. To take it down reversibly, archive it
                instead.
              </>
            ),
          }
        : {
            title: 'Archive this lecture?',
            label: 'Archive',
            body: (
              <>
                <strong className="text-foreground">{confirming.title}</strong> stops being
                shown to students and anyone watching it is stopped. Nothing is deleted — use
                Restore to bring it back.
              </>
            ),
          }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} section{rows.length === 1 ? '' : 's'} · sections are dynamic, add as
          many as the course needs
        </p>
        <Button size="sm" onClick={() => setAddingSection(true)}>
          Add section
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="This course has no sections yet"
            description="Add a section — Pre-Mid, Mid Revision, Post-Mid or anything else this course needs — then add lectures to it."
            action={
              <Button size="sm" onClick={() => setAddingSection(true)}>
                Add section
              </Button>
            }
          />
        </Card>
      ) : (
        rows.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            canDelete={canDelete}
            busy={setLessonStatus.isPending || updateSection.isPending}
            onAddLesson={() => setAddingLessonTo(section)}
            onOpenVideo={setVideoLesson}
            onSectionStatus={(status) => void changeSectionStatus(section, status)}
            onDeleteSection={() =>
              setConfirming({ kind: 'delete-section', id: section.id, title: section.title })
            }
            onLessonStatus={(lesson, status) => void changeLessonStatus(lesson, status)}
            onArchiveLesson={(lesson) =>
              setConfirming({ kind: 'archive-lesson', id: lesson.id, title: lesson.title })
            }
            onDeleteLesson={(lesson) =>
              setConfirming({ kind: 'delete-lesson', id: lesson.id, title: lesson.title })
            }
            onOpenAnalytics={setAnalyticsLesson}
          />
        ))
      )}

      <Modal
        open={addingSection}
        onClose={() => setAddingSection(false)}
        title="Add section"
        description="Sections group the lectures of a course. There is no fixed number."
        busy={createSection.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddingSection(false)}>
              Cancel
            </Button>
            <Button onClick={submitSection} loading={createSection.isPending}>
              Add section
            </Button>
          </>
        }
      >
        <Field label="Section title" required>
          {({ id }) => (
            <TextInput
              id={id}
              value={sectionTitle}
              onChange={(event) => setSectionTitle(event.target.value)}
              placeholder="e.g. Post-Mid"
              autoFocus
            />
          )}
        </Field>
      </Modal>

      <AddLessonModal
        courseId={courseId}
        section={addingLessonTo}
        onClose={() => setAddingLessonTo(null)}
      />

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmAction}
        title={confirmCopy?.title ?? ''}
        message={confirmCopy?.body ?? ''}
        confirmLabel={confirmCopy?.label ?? 'Confirm'}
        busy={archiveSection.isPending || deleteLesson.isPending || setLessonStatus.isPending}
      />

      <LessonVideoModal
        courseId={courseId}
        lesson={videoLesson}
        onClose={() => setVideoLesson(null)}
      />

      <LessonAnalyticsDrawer
        lesson={analyticsLesson}
        onClose={() => setAnalyticsLesson(null)}
      />
    </div>
  );
}

function SectionCard({
  section,
  canDelete,
  busy,
  onAddLesson,
  onOpenVideo,
  onSectionStatus,
  onDeleteSection,
  onLessonStatus,
  onArchiveLesson,
  onDeleteLesson,
  onOpenAnalytics,
}: {
  section: SectionRow;
  canDelete: boolean;
  busy: boolean;
  onAddLesson: () => void;
  onOpenVideo: (lesson: LessonRow) => void;
  onSectionStatus: (status: ContentStatus) => void;
  onDeleteSection: () => void;
  onLessonStatus: (lesson: LessonRow, status: ContentStatus) => void;
  onArchiveLesson: (lesson: LessonRow) => void;
  onDeleteLesson: (lesson: LessonRow) => void;
  onOpenAnalytics: (lesson: LessonRow) => void;
}) {
  const rows = section.lessons ?? [];
  const sectionVisible = section.status === 'PUBLISHED';

  const sectionItems: ActionMenuItem[] = [
    sectionVisible
      ? {
          label: 'Hide from students',
          onSelect: () => onSectionStatus('HIDDEN'),
          disabled: busy,
        }
      : {
          label: 'Show to students',
          onSelect: () => onSectionStatus('PUBLISHED'),
          disabled: busy,
        },
  ];
  if (canDelete)
    sectionItems.push({ label: 'Delete section', onSelect: onDeleteSection, danger: true });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {section.title}
            <ContentStatusBadge status={section.status} />
          </span>
        }
        description={section.description ?? undefined}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={onAddLesson}>
              Add lecture
            </Button>
            <ActionMenu items={sectionItems} label={`Actions for section ${section.title}`} />
          </>
        }
      />

      <CardBody>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No lectures in this section yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((lesson) => {
              const videoCount = lesson.videoCount ?? (lesson.video ? 1 : 0);
              const items: ActionMenuItem[] = [
                {
                  label: lesson.video ? 'Manage video' : 'Add video',
                  onSelect: () => onOpenVideo(lesson),
                },
                { label: 'Viewers', onSelect: () => onOpenAnalytics(lesson) },
              ];
              if (lesson.status === 'ARCHIVED') {
                items.push({
                  label: 'Restore',
                  onSelect: () => onLessonStatus(lesson, 'PUBLISHED'),
                  disabled: busy,
                });
              } else {
                if (lesson.status === 'PUBLISHED') {
                  items.push({
                    label: 'Unpublish (hide from students)',
                    onSelect: () => onLessonStatus(lesson, 'DRAFT'),
                    disabled: busy,
                  });
                } else {
                  items.push({
                    label: 'Publish',
                    onSelect: () => onLessonStatus(lesson, 'PUBLISHED'),
                    disabled: busy,
                  });
                }
                items.push({ label: 'Archive', onSelect: () => onArchiveLesson(lesson) });
              }
              if (canDelete) {
                items.push({
                  label: 'Delete lecture',
                  onSelect: () => onDeleteLesson(lesson),
                  danger: true,
                });
              }

              return (
                <li
                  key={lesson.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lesson.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ContentStatusBadge status={lesson.status} />
                      <span>{formatDuration(lesson.durationSeconds)}</span>
                      <span data-testid="lesson-video-count">Videos: {videoCount}</span>
                      {lesson.isPreview ? <Badge tone="info">Free preview</Badge> : null}
                      {lesson.video ? <VideoStatusBadge status={lesson.video.status} /> : null}
                      {lesson.status !== 'PUBLISHED' ? (
                        <span className="text-warning">Not visible to students</span>
                      ) : !sectionVisible ? (
                        <span className="text-warning">Section hidden from students</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => onOpenVideo(lesson)}>
                      {lesson.video ? 'Video' : 'Add video'}
                    </Button>
                    <ActionMenu items={items} label={`Actions for lecture ${lesson.title}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function AddLessonModal({
  courseId,
  section,
  onClose,
}: {
  courseId: string;
  section: SectionRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const createLesson = useCreateLesson(courseId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publishNow, setPublishNow] = useState(true);

  // The dialog has two steps, because the API does. `videos/uploads/init`
  // takes a `lessonId`, so there is nothing to attach a video to until the
  // lecture row exists. Rather than send the reader away to find the lecture
  // they just made, the dialog creates it and then shows the video panel for
  // it — the lecture is saved either way, and closing here loses nothing.
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  async function submit() {
    if (!section || title.trim().length < 2) return;

    try {
      const lesson = await createLesson.mutateAsync({
        sectionId: section.id,
        title: title.trim(),
        description: description.trim() || undefined,
        status: publishNow ? 'PUBLISHED' : 'DRAFT',
      });
      toast.success('Lecture added', 'Now add its video, or close and do it later.');
      setCreated(lesson);
    } catch (error) {
      toast.error(error);
    }
  }

  function close() {
    setTitle('');
    setDescription('');
    setPublishNow(true);
    setCreated(null);
    onClose();
  }

  return (
    <Modal
      open={section !== null}
      onClose={close}
      title={created ? 'Add a video' : 'Add lecture'}
      description={
        created
          ? `“${created.title}” was added. Its video can go up now or later.`
          : section
            ? `Into “${section.title}”`
            : undefined
      }
      busy={createLesson.isPending}
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} loading={createLesson.isPending}>
              Add lecture
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {created ? null : (
          <>
            <Field label="Lecture title" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                />
              )}
            </Field>

            <Field label="Description" hint="Optional.">
              {({ id }) => (
                <TextArea
                  id={id}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
              )}
            </Field>

            <Switch
              checked={publishNow}
              onChange={setPublishNow}
              label="Publish now"
              description={
                publishNow
                  ? 'Students with access see it as soon as its video is ready.'
                  : 'Saved as a draft — hidden from students until you publish it.'
              }
            />
          </>
        )}

        <SectionTitle>Video</SectionTitle>

        {created ? (
          <LessonVideoPanel lessonId={created.id} courseId={courseId} />
        ) : (
          <p className="text-sm text-muted">
            Added in the next step, once the lecture exists. It goes straight to protected
            storage and is only ever played through a signed, per-viewer ticket — the dashboard
            never produces a public or downloadable video URL.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * The video on an existing lecture.
 *
 * The same panel the create dialog ends on, reachable from the lecture row so
 * a video can be added, replaced, or have its failed processing retried long
 * after the lecture was written.
 */
function LessonVideoModal({
  courseId,
  lesson,
  onClose,
}: {
  courseId: string;
  lesson: LessonRow | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={lesson !== null}
      onClose={onClose}
      title="Lecture video"
      description={lesson ? lesson.title : undefined}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {lesson ? (
        <LessonVideoPanel
          // Remounts when the reader opens a different lecture, so no upload
          // or polling state carries across from the previous one.
          key={lesson.id}
          lessonId={lesson.id}
          courseId={courseId}
          existingVideo={lesson.video}
        />
      ) : null}
    </Modal>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ContentStatusBadge, VideoStatusBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { LessonAnalyticsDrawer } from '@/features/courses/lesson-analytics-drawer';
import {
  useArchiveLesson,
  useArchiveSection,
  useCourseSections,
  useCreateLesson,
  useCreateSection,
} from '@/features/courses/hooks';
import { useTeacherCapabilities } from '@/features/settings/hooks';
import { api } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { useSession } from '@/lib/session-context';
import type { LessonRow, SectionRow } from '@/types/domain';

/**
 * Sections and lectures.
 *
 * Sections are fully dynamic. A new course is seeded with three, because that
 * is what this platform's courses usually look like, but nothing in this
 * component — or anywhere downstream of it — assumes a count or a name. Adding
 * a fourth is an ordinary operation.
 *
 * Deleting is archiving. Watch history and code redemptions reference lectures
 * and videos, so removing the rows would destroy the evidence of what a
 * student paid for and watched. The backend has no hard-delete path for these
 * at all; the labels here say "archive" rather than pretending otherwise.
 */
export function CourseContentTab({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { isAdmin } = useSession();
  const capabilities = useTeacherCapabilities();

  const sections = useCourseSections(courseId);
  const createSection = useCreateSection(courseId);
  const archiveSection = useArchiveSection(courseId);

  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [addingLessonTo, setAddingLessonTo] = useState<SectionRow | null>(null);
  const [confirming, setConfirming] = useState<
    | { kind: 'section'; id: string; title: string }
    | { kind: 'lesson'; id: string; title: string }
    | null
  >(null);
  const [analyticsLesson, setAnalyticsLesson] = useState<LessonRow | null>(null);

  const archiveLesson = useArchiveLesson(courseId);

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

  async function confirmArchive() {
    if (!confirming) return;

    try {
      if (confirming.kind === 'section') {
        await archiveSection.mutateAsync({ sectionId: confirming.id });
        toast.success('Section archived', 'Its lectures were archived with it.');
      } else {
        await archiveLesson.mutateAsync({ lessonId: confirming.id });
        toast.success('Lecture archived', 'Watch history and purchases were kept.');
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
            courseId={courseId}
            section={section}
            canArchive={isAdmin || capabilities.canDeleteLectures}
            onAddLesson={() => setAddingLessonTo(section)}
            onArchiveSection={() =>
              setConfirming({ kind: 'section', id: section.id, title: section.title })
            }
            onArchiveLesson={(lesson) =>
              setConfirming({ kind: 'lesson', id: lesson.id, title: lesson.title })
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
        onConfirm={confirmArchive}
        title={confirming?.kind === 'section' ? 'Archive this section?' : 'Archive this lecture?'}
        message={
          confirming?.kind === 'section' ? (
            <>
              <strong className="text-foreground">{confirming.title}</strong> and its lectures
              stop being served to students. Watch history, purchases and code redemptions that
              reference them are kept — this is an archive, not a delete.
            </>
          ) : (
            <>
              <strong className="text-foreground">{confirming?.title}</strong> stops being served
              to students. Its watch history is kept, because it is the record of what students
              already paid for and watched.
            </>
          )
        }
        confirmLabel="Archive"
        busy={archiveSection.isPending || archiveLesson.isPending}
      />

      <LessonAnalyticsDrawer
        lesson={analyticsLesson}
        onClose={() => setAnalyticsLesson(null)}
      />
    </div>
  );
}

function SectionCard({
  courseId,
  section,
  canArchive,
  onAddLesson,
  onArchiveSection,
  onArchiveLesson,
  onOpenAnalytics,
}: {
  courseId: string;
  section: SectionRow;
  canArchive: boolean;
  onAddLesson: () => void;
  onArchiveSection: () => void;
  onArchiveLesson: (lesson: LessonRow) => void;
  onOpenAnalytics: (lesson: LessonRow) => void;
}) {
  // Lessons come from the public course endpoint, which returns the structure
  // with each section's lessons already attached.
  const lessons = useQuery({
    queryKey: ['courses', 'section-lessons', courseId, section.id],
    queryFn: () =>
      api.get<{ id: string; lessons?: LessonRow[] }[]>(`courses/${courseId}/sections`),
    select: (data) => data.find((item) => item.id === section.id)?.lessons ?? [],
  });

  const rows = lessons.data ?? [];

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
            {canArchive ? (
              <Button size="sm" variant="ghost" onClick={onArchiveSection}>
                Archive
              </Button>
            ) : null}
          </>
        }
      />

      <CardBody>
        {lessons.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No lectures in this section yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((lesson) => (
              <li
                key={lesson.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {lesson.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{formatDuration(lesson.durationSeconds)}</span>
                    {lesson.isPreview ? <Badge tone="info">Free preview</Badge> : null}
                    {lesson.video ? <VideoStatusBadge status={lesson.video.status} /> : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => onOpenAnalytics(lesson)}>
                    Viewers
                  </Button>
                  {canArchive ? (
                    <Button size="sm" variant="ghost" onClick={() => onArchiveLesson(lesson)}>
                      Archive
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
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

  async function submit() {
    if (!section || title.trim().length < 2) return;

    try {
      await createLesson.mutateAsync({
        sectionId: section.id,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success('Lecture added', 'Upload its video from the lecture once it is created.');
      setTitle('');
      setDescription('');
      onClose();
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <Modal
      open={section !== null}
      onClose={onClose}
      title="Add lecture"
      description={section ? `Into “${section.title}”` : undefined}
      busy={createLesson.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createLesson.isPending}>
            Add lecture
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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

        <SectionTitle>Video</SectionTitle>
        <p className="text-sm text-muted">
          Video is uploaded separately, straight to protected storage, and is only ever played
          through a signed, per-viewer ticket. The dashboard never produces a public or
          downloadable video URL.
        </p>
      </div>
    </Modal>
  );
}

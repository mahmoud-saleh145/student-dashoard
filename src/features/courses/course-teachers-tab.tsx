'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useAssignCourseTeacher,
  useRemoveCourseTeacher,
  type CourseTeacherRow,
} from '@/features/courses/hooks';
import { useTeacherOptions } from '@/features/teachers/hooks';

/**
 * Who teaches this course.
 *
 * This is the assignment step of the workflow: an administrator creates a
 * course, then decides which teachers work on it. The teacher does not choose
 * — `POST /admin/courses/:courseId/teachers` is `@AdminOnly()` and the service
 * asserts the role again, so a teacher who called it directly would be refused
 * whatever this screen showed them. The tab is therefore rendered only for
 * administrators, and its absence for a teacher is cosmetic rather than the
 * protection.
 *
 * The per-assignment flags matter and are shown rather than hidden behind a
 * default. `Content` is what a teacher normally needs; `Pricing` and `Publish`
 * are the two that let them change what students pay and what they can see,
 * and both are off unless an administrator turns them on for this course.
 */

interface Draft {
  teacherId: string;
  isLead: boolean;
  canEditContent: boolean;
  canEditPricing: boolean;
  canPublish: boolean;
  canViewStudents: boolean;
  canViewRevenue: boolean;
}

const BLANK: Draft = {
  teacherId: '',
  isLead: false,
  canEditContent: true,
  canEditPricing: false,
  canPublish: false,
  canViewStudents: true,
  canViewRevenue: false,
};

export function CourseTeachersTab({
  courseId,
  teachers,
}: {
  courseId: string;
  teachers: CourseTeacherRow[];
}) {
  const toast = useToast();
  const assign = useAssignCourseTeacher(courseId);
  const remove = useRemoveCourseTeacher(courseId);
  const options = useTeacherOptions();

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [pendingRemoval, setPendingRemoval] = useState<CourseTeacherRow | null>(null);

  const assignedIds = new Set(teachers.map((row) => row.teacherId));

  // Someone already on the course is edited through their own row, so offering
  // them in the picker would only produce a second, confusing way to do it.
  const available = options.options.filter((option) => !assignedIds.has(option.value));

  async function submit() {
    if (!draft.teacherId) {
      toast.error(null, 'Choose a teacher to assign');
      return;
    }

    try {
      await assign.mutateAsync(draft);
      toast.success(
        'Teacher assigned',
        'The course now appears in their dashboard under My courses.',
      );
      setDraft(BLANK);
    } catch (error) {
      toast.error(error, 'The teacher could not be assigned');
    }
  }

  async function updateFlag(row: CourseTeacherRow, change: Partial<Draft>) {
    try {
      await assign.mutateAsync({ teacherId: row.teacherId, ...change });
      toast.success('Permissions updated');
    } catch (error) {
      toast.error(error, 'The permissions could not be changed');
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;

    try {
      await remove.mutateAsync({ teacherId: pendingRemoval.teacherId });
      toast.success(
        'Teacher removed',
        'The course no longer appears in their dashboard.',
      );
    } catch (error) {
      toast.error(error, 'The teacher could not be removed');
    } finally {
      setPendingRemoval(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Assigned teachers"
          description="A teacher sees this course in their dashboard as soon as they are assigned, and can work on whatever these permissions allow."
        />

        <CardBody className="p-0">
          {teachers.length === 0 ? (
            <div className="px-5 py-4">
              <EmptyState
                title="No teacher on this course"
                description="A course needs at least one teacher before it can be published."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {teachers.map((row) => (
                <li key={row.teacherId} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {row.teacher.fullName}
                      </span>
                      {row.isLead ? <Badge tone="info">Lead</Badge> : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {row.isLead ? null : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={assign.isPending}
                          onClick={() => void updateFlag(row, { isLead: true })}
                        >
                          Make lead
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        // The backend refuses to remove the last teacher, so
                        // the button is not offered when there is only one.
                        disabled={teachers.length <= 1 || remove.isPending}
                        onClick={() => setPendingRemoval(row)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Checkbox
                      label="Content"
                      checked={row.canEditContent}
                      disabled={assign.isPending}
                      onChange={(event) =>
                        void updateFlag(row, { canEditContent: event.target.checked })
                      }
                    />
                    <Checkbox
                      label="Pricing"
                      checked={row.canEditPricing}
                      disabled={assign.isPending}
                      onChange={(event) =>
                        void updateFlag(row, { canEditPricing: event.target.checked })
                      }
                    />
                    <Checkbox
                      label="Publish"
                      checked={row.canPublish}
                      disabled={assign.isPending}
                      onChange={(event) =>
                        void updateFlag(row, { canPublish: event.target.checked })
                      }
                    />
                    <Checkbox
                      label="See students"
                      checked={row.canViewStudents}
                      disabled={assign.isPending}
                      onChange={(event) =>
                        void updateFlag(row, { canViewStudents: event.target.checked })
                      }
                    />
                    <Checkbox
                      label="See revenue"
                      checked={row.canViewRevenue}
                      disabled={assign.isPending}
                      onChange={(event) =>
                        void updateFlag(row, { canViewRevenue: event.target.checked })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Assign a teacher"
          description="Adds the course to that teacher's dashboard."
        />

        <CardBody className="flex flex-col gap-4">
          <Field label="Teacher" required>
            {({ id }) => (
              <Select
                id={id}
                value={draft.teacherId}
                placeholder={
                  options.isLoading
                    ? 'Loading teachers…'
                    : available.length === 0
                      ? 'Every teacher is already assigned'
                      : 'Choose a teacher'
                }
                options={available}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, teacherId: event.target.value }))
                }
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border p-4">
            <Checkbox
              label="Edit content"
              checked={draft.canEditContent}
              onChange={(event) =>
                setDraft((current) => ({ ...current, canEditContent: event.target.checked }))
              }
            />
            <Checkbox
              label="Change pricing"
              checked={draft.canEditPricing}
              onChange={(event) =>
                setDraft((current) => ({ ...current, canEditPricing: event.target.checked }))
              }
            />
            <Checkbox
              label="Publish"
              checked={draft.canPublish}
              onChange={(event) =>
                setDraft((current) => ({ ...current, canPublish: event.target.checked }))
              }
            />
            <Checkbox
              label="See students"
              checked={draft.canViewStudents}
              onChange={(event) =>
                setDraft((current) => ({ ...current, canViewStudents: event.target.checked }))
              }
            />
            <Checkbox
              label="See revenue"
              checked={draft.canViewRevenue}
              onChange={(event) =>
                setDraft((current) => ({ ...current, canViewRevenue: event.target.checked }))
              }
            />
            <Checkbox
              label="Lead teacher"
              checked={draft.isLead}
              onChange={(event) =>
                setDraft((current) => ({ ...current, isLead: event.target.checked }))
              }
            />
          </div>

          <div>
            <Button
              onClick={() => void submit()}
              loading={assign.isPending}
              disabled={!draft.teacherId}
            >
              Assign teacher
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => void confirmRemoval()}
        title="Remove this teacher from the course?"
        message={`${pendingRemoval?.teacher.fullName ?? 'This teacher'} loses access to the course and it disappears from their dashboard. The course, its content and its students are untouched.`}
        confirmLabel="Remove"
        variant="danger"
        busy={remove.isPending}
      />
    </div>
  );
}

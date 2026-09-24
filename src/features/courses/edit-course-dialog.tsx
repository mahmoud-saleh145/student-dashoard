'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import {
  AcademicStructurePicker,
  type AcademicStructureValue,
} from '@/features/catalog/academic-structure-picker';
import { useAcademicYears, useSubjects } from '@/features/catalog/hooks';
import { useUpdateCourse, type CourseDetail } from '@/features/courses/hooks';
import { ApiError } from '@/lib/errors';

/**
 * Editing a course.
 *
 * `PATCH /admin/courses/:id` has existed the whole time and `useUpdateCourse`
 * was written for it, but nothing ever called either: there was no way to
 * change a course's details after creation. This is that missing screen.
 *
 * Two things it is careful about, both of which are about *not* losing data:
 *
 *  - Only changed fields are sent. A PATCH carrying every field would rewrite
 *    values the person never looked at, and the backend distinguishes "absent"
 *    from "empty" for department links specifically so a partial edit cannot
 *    wipe a course's structure.
 *  - Price, teachers, sections, parts and visibility are NOT here. Each is
 *    owned by its own tab with its own rules — price changes append a version,
 *    publishing runs a readiness check — and duplicating them into a general
 *    edit form is how two paths to the same field start disagreeing.
 */
export function EditCourseDialog({
  course,
  open,
  onClose,
}: {
  course: CourseDetail;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateCourse(course.id);

  const years = useAcademicYears();
  const subjects = useSubjects();

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [structure, setStructure] = useState<AcademicStructureValue>({
    universityId: '',
    facultyId: '',
    departmentIds: [],
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Re-seeded whenever the dialog opens, so reopening after a cancel shows the
  // stored values rather than the abandoned edit.
  useEffect(() => {
    if (!open) return;

    setTitle(course.title);
    setTitleAr(course.titleAr ?? '');
    setShortDescription(course.shortDescription ?? '');
    setDescription(course.description ?? '');
    setAcademicYearId(course.academicYearId ?? '');
    setSubjectId(course.subjectId ?? '');
    setStructure({
      universityId: course.universityId ?? '',
      facultyId: course.facultyId ?? '',
      departmentIds: course.departments.map((d) => d.id),
    });
    setFieldErrors({});
  }, [open, course]);

  async function submit() {
    if (title.trim().length < 3) {
      setFieldErrors({ title: 'Give the course a title of at least 3 characters.' });
      return;
    }

    // Only what actually changed. `undefined` is omitted by the API client, so
    // an untouched field is never mentioned in the request at all.
    const body: Record<string, unknown> = {};

    if (title.trim() !== course.title) body.title = title.trim();
    if ((titleAr.trim() || null) !== (course.titleAr ?? null)) {
      body.titleAr = titleAr.trim();
    }
    if (shortDescription.trim() !== (course.shortDescription ?? '')) {
      body.shortDescription = shortDescription.trim();
    }
    if (description.trim() !== (course.description ?? '')) {
      body.description = description.trim();
    }
    if ((academicYearId || null) !== (course.academicYearId ?? null)) {
      body.academicYearId = academicYearId;
    }
    if ((subjectId || null) !== (course.subjectId ?? null)) {
      body.subjectId = subjectId;
    }
    if ((structure.universityId || null) !== (course.universityId ?? null)) {
      body.universityId = structure.universityId;
    }
    if ((structure.facultyId || null) !== (course.facultyId ?? null)) {
      body.facultyId = structure.facultyId;
    }

    const storedDepartments = [...course.departments.map((d) => d.id)].sort();
    const chosenDepartments = [...structure.departmentIds].sort();
    const departmentsChanged =
      storedDepartments.length !== chosenDepartments.length ||
      storedDepartments.some((id, index) => id !== chosenDepartments[index]);

    // Sent only when they differ. The backend reads an absent field as "leave
    // them alone", which is exactly what an unrelated edit should do.
    if (departmentsChanged) body.departmentIds = structure.departmentIds;

    // Moving the college always restates the departments, even when the set
    // looks unchanged: the server validates the course as it will be, and a
    // stale link under a new college is refused rather than silently kept.
    if (body.facultyId !== undefined && body.departmentIds === undefined) {
      body.departmentIds = structure.departmentIds;
    }

    if (Object.keys(body).length === 0) {
      toast.success('Nothing to save', 'No fields were changed.');
      onClose();
      return;
    }

    try {
      await update.mutateAsync(body);
      toast.success('Course updated');
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([field, messages]) => [field, messages[0] ?? '']),
          ),
        );
        return;
      }
      toast.error(error, 'The course could not be updated');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit course"
      description="Price, teachers, content and visibility are managed in their own tabs."
      size="lg"
      busy={update.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Course title" error={fieldErrors.title} required>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              value={title}
              aria-describedby={describedBy}
              invalid={invalid}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>

        <Field label="Arabic title" error={fieldErrors.titleAr}>
          {({ id }) => (
            <TextInput
              id={id}
              dir="rtl"
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
            />
          )}
        </Field>

        <Field label="Short description" error={fieldErrors.shortDescription}>
          {({ id }) => (
            <TextArea
              id={id}
              rows={2}
              value={shortDescription}
              onChange={(event) => setShortDescription(event.target.value)}
            />
          )}
        </Field>

        <Field label="Description" error={fieldErrors.description}>
          {({ id }) => (
            <TextArea
              id={id}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        <AcademicStructurePicker
          value={structure}
          onChange={setStructure}
          disabled={update.isPending}
        />

        {fieldErrors.facultyId || fieldErrors.departmentIds ? (
          <p className="text-sm text-danger">
            {fieldErrors.facultyId ?? fieldErrors.departmentIds}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            {({ id }) => (
              <Select
                id={id}
                value={academicYearId}
                placeholder="Not set"
                options={(years.data ?? []).map((year) => ({
                  value: year.id,
                  label: year.name,
                }))}
                onChange={(event) => setAcademicYearId(event.target.value)}
              />
            )}
          </Field>

          <Field label="Subject">
            {({ id }) => (
              <Select
                id={id}
                value={subjectId}
                placeholder="Not set"
                options={(subjects.data ?? []).map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
                onChange={(event) => setSubjectId(event.target.value)}
              />
            )}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

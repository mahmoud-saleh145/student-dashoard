'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { useAcademicYears, useSubjects, useUniversities } from '@/features/catalog/hooks';
import { useCreateCourse } from '@/features/courses/hooks';
import { useTeacherOptions } from '@/features/teachers/hooks';
import { ApiError } from '@/lib/errors';

/**
 * New course.
 *
 * A course is created as a DRAFT with its three usual sections seeded by the
 * backend. Sections are dynamic — nothing here or downstream assumes there are
 * exactly three, or that they are named Pre-Mid, Mid Revision and Post-Mid.
 */

const schema = z
  .object({
    title: z.string().trim().min(3, 'Give the course a title').max(200),
    titleAr: z.string().trim().max(200).optional().or(z.literal('')),
    shortDescription: z.string().trim().max(500).optional().or(z.literal('')),
    teacherId: z.string().min(1, 'Choose a teacher'),
    universityId: z.string().optional().or(z.literal('')),
    academicYearId: z.string().optional().or(z.literal('')),
    subjectId: z.string().optional().or(z.literal('')),
    isFree: z.boolean(),
    price: z.coerce.number().min(0, 'Price cannot be negative').max(1_000_000).optional(),
  })
  .refine((values) => values.isFree || (values.price ?? 0) > 0, {
    // A paid course with no price cannot be joined at all — the enrolment
    // service refuses it — so it is caught here rather than at purchase time.
    message: 'A paid course needs a price above zero',
    path: ['price'],
  });

type FormValues = z.input<typeof schema>;

export function CreateCourseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const createCourse = useCreateCourse();

  const teachers = useTeacherOptions();
  const universities = useUniversities();
  const years = useAcademicYears();
  const subjects = useSubjects();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isFree: false, title: '', teacherId: '' },
  });

  const isFree = watch('isFree');

  async function onSubmit(values: FormValues) {
    try {
      const parsed = schema.parse(values);

      const created = await createCourse.mutateAsync({
        title: parsed.title,
        titleAr: parsed.titleAr || undefined,
        shortDescription: parsed.shortDescription || undefined,
        teacherIds: [parsed.teacherId],
        leadTeacherId: parsed.teacherId,
        universityId: parsed.universityId || undefined,
        academicYearId: parsed.academicYearId || undefined,
        subjectId: parsed.subjectId || undefined,
        isFree: parsed.isFree,
        price: parsed.isFree ? 0 : parsed.price,
        enrollmentMethods: parsed.isFree ? ['FREE'] : ['CODE', 'PAYMENT'],
      });

      toast.success('Course created', 'It starts as a draft, so students cannot see it yet.');
      reset();
      onClose();

      const id = (created as { id?: string } | null)?.id;
      if (id) router.push(`/courses/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
        return;
      }
      toast.error(error, 'The course could not be created');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New course"
      description="Created as a draft. Publish it when the content is ready."
      size="lg"
      busy={createCourse.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createCourse.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={createCourse.isPending}
            type="submit"
          >
            Create course
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Course title" error={errors.title?.message} required>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} {...register('title')} />
          )}
        </Field>

        <Field
          label="Arabic title"
          hint="Optional. Shown to students using the app in Arabic."
          error={errors.titleAr?.message}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              dir="rtl"
              aria-describedby={describedBy}
              invalid={invalid}
              {...register('titleAr')}
            />
          )}
        </Field>

        <Field label="Short description" error={errors.shortDescription?.message}>
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              rows={3}
              aria-describedby={describedBy}
              invalid={invalid}
              {...register('shortDescription')}
            />
          )}
        </Field>

        <Field label="Teacher" error={errors.teacherId?.message} required>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder={teachers.isLoading ? 'Loading teachers…' : 'Choose a teacher'}
              options={teachers.options}
              {...register('teacherId')}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="University">
            {({ id }) => (
              <Select
                id={id}
                placeholder="Not set"
                options={(universities.data ?? []).map((university) => ({
                  value: university.id,
                  label: university.name,
                }))}
                {...register('universityId')}
              />
            )}
          </Field>

          <Field label="Academic year">
            {({ id }) => (
              <Select
                id={id}
                placeholder="Not set"
                options={(years.data ?? []).map((year) => ({
                  value: year.id,
                  label: year.name,
                }))}
                {...register('academicYearId')}
              />
            )}
          </Field>

          <Field label="Subject">
            {({ id }) => (
              <Select
                id={id}
                placeholder="Not set"
                options={(subjects.data ?? []).map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
                {...register('subjectId')}
              />
            )}
          </Field>
        </div>

        <div className="rounded-lg border border-border p-4">
          <Checkbox label="This course is free" {...register('isFree')} />

          {!isFree ? (
            <div className="mt-3">
              <Field
                label="Price (EGP)"
                error={errors.price?.message}
                hint="Changing the price later never rewrites existing purchases — historical revenue is frozen at the amount charged."
                required
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    {...register('price')}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

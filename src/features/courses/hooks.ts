'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Paginated } from '@/types/api';
import type {
  AttachmentRow,
  ContentStatus,
  CourseStudentRow,
  CourseSummary,
  LessonRow,
  SectionRow,
} from '@/types/domain';

/** Course reads and writes. Every route here is `/admin/*` on the backend. */

/**
 * One row of `course.teachers` as `GET /admin/courses/:courseId` returns it.
 *
 * Note the shape: the staff detail endpoint returns the `CourseTeacher`
 * assignment rows with the account nested under `teacher`, where the list
 * endpoint flattens each one to `{ id, fullName, isLead }`. They are different
 * shapes for the same idea and reading one as the other yields `undefined`
 * rather than a type error, which is why `CourseDetail` restates the field
 * instead of inheriting it from `CourseSummary`.
 */
export interface CourseTeacherRow {
  teacherId: string;
  isLead: boolean;
  canEditContent: boolean;
  canEditPricing: boolean;
  canPublish: boolean;
  canViewStudents: boolean;
  canViewRevenue: boolean;
  revenueSharePercent: number | null;
  teacher: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface CourseDetail extends Omit<CourseSummary, 'teachers'> {
  teachers: CourseTeacherRow[];
  /** Flattened out of the join rows by `detailForStaff`. */
  departments: { id: string; name: string; facultyId: string }[];
  facultyId: string | null;
  universityId: string | null;
  academicYearId: string | null;
  subjectId: string | null;
  titleAr: string | null;
  shortDescription: string;
  description: string;
  enrollmentMethods: string[];
  accessDurationType: string;
  accessDurationDays: number | null;
  accessEndsAt: string | null;
  completionRuleType: string;
  completionThreshold: number;
  requirements: string[];
  outcomes: string[];
  sections?: SectionRow[];
}

export function useCourses(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.courses.list(query),
    queryFn: () => api.page<CourseSummary>('admin/courses', { query }),
    // Keeps the previous page visible while the next one loads, so paging
    // does not flash an empty table.
    placeholderData: (previous) => previous,
  });
}

export function useCourse(courseId: string) {
  return useQuery({
    queryKey: queryKeys.courses.detail(courseId),
    queryFn: () => api.get<CourseDetail>(`admin/courses/${courseId}`),
    enabled: Boolean(courseId),
  });
}

/**
 * The authoring view of a course: every section with every non-deleted
 * lecture, whatever its status, each with its live video and video count.
 * (`GET /admin/courses/:id/sections` — staff-scoped on the backend.)
 */
export function useCourseSections(courseId: string) {
  return useQuery({
    queryKey: queryKeys.courses.sections(courseId),
    queryFn: () => api.get<SectionRow[]>(`admin/courses/${courseId}/sections`),
    enabled: Boolean(courseId),
    // While any lecture's video is moving through the pipeline, keep the
    // badges and counts honest without the reader having to reload.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((section) =>
        (section.lessons ?? []).some((lesson) =>
          ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(lesson.video?.status ?? ''),
        ),
      )
        ? 8000
        : false,
  });
}

export function useCourseStudents(courseId: string, query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.courses.students(courseId, query),
    queryFn: () =>
      api.page<CourseStudentRow>('admin/enrollments', {
        query: { ...query, courseId },
      }),
    enabled: Boolean(courseId),
    placeholderData: (previous) => previous,
  });
}

export function useCoursePriceHistory(courseId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.courses.priceHistory(courseId),
    queryFn: () =>
      api.get<
        {
          id: string;
          amount: number | string;
          currency: string;
          version: number;
          isCurrent: boolean;
          effectiveFrom: string;
          effectiveTo: string | null;
          reason: string | null;
          changedBy: { id: string; fullName: string } | null;
        }[]
      >(`admin/courses/${courseId}/price-history`),
    enabled: enabled && Boolean(courseId),
  });
}

export function useLessonAttachments(lessonId: string | null) {
  return useQuery({
    queryKey: ['lessons', 'attachments', lessonId],
    queryFn: () => api.get<AttachmentRow[]>(`lessons/${lessonId}/attachments`),
    enabled: Boolean(lessonId),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useCourseMutation<TInput, TResult = unknown>(
  perform: (input: TInput) => Promise<TResult>,
  courseId?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      if (courseId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.courses.detail(courseId),
        });
      }
    },
  });
}

export interface CourseFormValues {
  title: string;
  titleAr?: string;
  shortDescription?: string;
  description?: string;
  universityId?: string;
  facultyId?: string;
  academicYearId?: string;
  subjectId?: string;
  teacherIds: string[];
  leadTeacherId?: string;
  /**
   * Departments the course is offered to.
   *
   * On an update, omitting this leaves the existing links alone and `[]`
   * clears them — the backend treats the two differently on purpose, so a
   * partial edit cannot wipe a course's structure.
   */
  departmentIds?: string[];
  price?: number;
  isFree?: boolean;
  enrollmentMethods: string[];
  accessDurationType?: 'LIFETIME' | 'FIXED_DAYS' | 'UNTIL_DATE';
  accessDurationDays?: number;
}

export function useCreateCourse() {
  return useCourseMutation<CourseFormValues>((input) => api.post('admin/courses', input));
}

export function useUpdateCourse(courseId: string) {
  return useCourseMutation<Partial<CourseFormValues>>(
    (input) => api.patch(`admin/courses/${courseId}`, input),
    courseId,
  );
}

/**
 * Course visibility.
 *
 * `publish` makes a course PUBLISHED. `unpublish` takes it to HIDDEN, which is
 * the state where already-enrolled students keep their access and the course
 * simply stops being listed. That distinction is enforced by the backend's
 * access decision; the dashboard exposes it in those words so nobody has to
 * guess what "hide" costs an existing student.
 */
export type CourseLifecycleAction = 'publish' | 'unpublish' | 'archive' | 'restore';

/**
 * The body each lifecycle route actually validates:
 *
 *   publish   — none
 *   unpublish — `{ status: 'HIDDEN' }` (UnpublishCourseDto requires one of
 *               DRAFT | HIDDEN | SUSPENDED; the dashboard's "Hide" is HIDDEN)
 *   archive   — `{ reason }`, 3–500 characters (ArchiveCourseDto)
 *   restore   — none
 *
 * Both unpublish and archive used to be sent without the required field, so
 * the backend answered 422 and nothing changed — the "archive does not work"
 * report.
 */
export function useCourseVisibility(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, reason }: { action: CourseLifecycleAction; reason?: string }) =>
      api.post(
        `admin/courses/${courseId}/${action}`,
        action === 'archive'
          ? { reason }
          : action === 'unpublish'
            ? { status: 'HIDDEN' }
            : undefined,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      // Enrollment states change with archive/restore.
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

/**
 * Deletes a course. Always a soft delete on the backend — payments,
 * enrollments, codes and watch history are retained — and refused for a
 * published course or one whose students still have access.
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, reason }: { courseId: string; reason: string }) =>
      api.delete<{ id: string; deleted: boolean; revokedCodes: number }>(
        `admin/courses/${courseId}`,
        { reason },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.codes.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

/**
 * The teaching roster for one course.
 *
 * `POST /admin/courses/:courseId/teachers` is an upsert: it adds a teacher who
 * is not on the course and rewrites the per-assignment permissions of one who
 * is. Both routes are `@AdminOnly()` and the service asserts the role again, so
 * these hooks exist for administrators only — see the `assignCourseTeachers`
 * capability.
 *
 * The permission flags are deliberately explicit rather than defaulted here.
 * `canEditPricing` and `canPublish` are the two that let a teacher change what
 * students pay and what they can see, and an admin assigning a course should
 * be choosing them rather than inheriting them from a form they did not read.
 */
export interface CourseTeacherAssignment {
  teacherId: string;
  isLead?: boolean;
  canEditContent?: boolean;
  canEditPricing?: boolean;
  canPublish?: boolean;
  canViewStudents?: boolean;
  canViewRevenue?: boolean;
  revenueSharePercent?: number;
}

export function useAssignCourseTeacher(courseId: string) {
  return useCourseMutation<CourseTeacherAssignment>(
    (input) => api.post(`admin/courses/${courseId}/teachers`, input),
    courseId,
  );
}

/**
 * Removes a teacher from a course.
 *
 * The backend refuses to remove the last one — a course with no teacher cannot
 * be published and nobody could manage its content — so the caller should not
 * offer this for a single-teacher course.
 */
export function useRemoveCourseTeacher(courseId: string) {
  return useCourseMutation<{ teacherId: string }>(
    ({ teacherId }) => api.delete(`admin/courses/${courseId}/teachers/${teacherId}`),
    courseId,
  );
}

export function useChangeCoursePrice(courseId: string) {
  return useCourseMutation<{ amount: number; currency?: string; reason?: string }>(
    (input) => api.post(`admin/courses/${courseId}/price`, input),
    courseId,
  );
}

export function useCreateSection(courseId: string) {
  return useCourseMutation<{ title: string; titleAr?: string; description?: string }>(
    (input) => api.post(`admin/courses/${courseId}/sections`, input),
    courseId,
  );
}

export function useUpdateSection(courseId: string) {
  return useCourseMutation<{
    sectionId: string;
    title?: string;
    titleAr?: string;
    description?: string;
    status?: string;
  }>(({ sectionId, ...body }) => api.patch(`admin/sections/${sectionId}`, body), courseId);
}

export function useArchiveSection(courseId: string) {
  return useCourseMutation<{ sectionId: string }>(
    ({ sectionId }) => api.delete(`admin/sections/${sectionId}`),
    courseId,
  );
}

/**
 * Creates a lecture and returns it.
 *
 * The created row — its `id` in particular — is what the caller needs: a video
 * cannot be uploaded until the lecture exists, because `videos/uploads/init`
 * takes a `lessonId`. The backend's `LessonsService.create` returns the whole
 * row, so only the part this dashboard relies on is typed here.
 */
export function useCreateLesson(courseId: string) {
  return useCourseMutation<
    {
      sectionId: string;
      title: string;
      titleAr?: string;
      description?: string;
      kind?: string;
      isPreview?: boolean;
      /** The backend defaults a new lecture to DRAFT — invisible to students. */
      status?: ContentStatus;
    },
    { id: string; title: string }
  >(
    ({ sectionId, ...body }) => api.post(`admin/sections/${sectionId}/lessons`, body),
    courseId,
  );
}

export function useUpdateLesson(courseId: string) {
  return useCourseMutation<{
    lessonId: string;
    title?: string;
    description?: string;
    status?: ContentStatus;
    isPreview?: boolean;
  }>(({ lessonId, ...body }) => api.patch(`admin/lessons/${lessonId}`, body), courseId);
}

/**
 * Lecture visibility, through `PATCH /admin/lessons/:id { status }`.
 *
 *   PUBLISHED — students with access see and can play it
 *   DRAFT     — hidden from students; how every new lecture starts
 *   ARCHIVED  — retired but kept, reversible (restore → PUBLISHED)
 *
 * Archive used to be wired to DELETE, which is an irreversible soft delete
 * with no way back from the dashboard. Archive and delete are now separate.
 */
export function useSetLessonStatus(courseId: string) {
  return useCourseMutation<{ lessonId: string; status: ContentStatus }>(
    ({ lessonId, status }) => api.patch(`admin/lessons/${lessonId}`, { status }),
    courseId,
  );
}

/** Soft delete (`DELETE /admin/lessons/:id`). Watch history is kept; not reversible here. */
export function useDeleteLesson(courseId: string) {
  return useCourseMutation<{ lessonId: string }>(
    ({ lessonId }) => api.delete(`admin/lessons/${lessonId}`),
    courseId,
  );
}

/** Sends a notification to the students of one course. */
export function useCourseAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      courseId: string;
      title: string;
      body: string;
      titleAr?: string;
      bodyAr?: string;
    }) =>
      api.post('notifications/announcements', {
        ...input,
        route: `/course/${input.courseId}`,
        publishNow: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export type CourseStudentsPage = Paginated<CourseStudentRow>;
export type LessonList = LessonRow[];

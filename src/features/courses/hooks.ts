'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Paginated } from '@/types/api';
import type {
  AttachmentRow,
  CourseStudentRow,
  CourseSummary,
  LessonRow,
  SectionRow,
} from '@/types/domain';

/** Course reads and writes. Every route here is `/admin/*` on the backend. */

export interface CourseDetail extends CourseSummary {
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

export function useCourseSections(courseId: string) {
  return useQuery({
    queryKey: queryKeys.courses.sections(courseId),
    queryFn: () => api.get<SectionRow[]>(`admin/courses/${courseId}/sections`),
    enabled: Boolean(courseId),
  });
}

export function useCourseStudents(
  courseId: string,
  query: Record<string, string | number>,
) {
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

function useCourseMutation<TInput>(
  perform: (input: TInput) => Promise<unknown>,
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
export function useCourseVisibility(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: 'publish' | 'unpublish' | 'archive' | 'restore') =>
      api.post(`admin/courses/${courseId}/${action}`, action === 'archive' ? {} : undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
    },
  });
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

export function useCreateLesson(courseId: string) {
  return useCourseMutation<{
    sectionId: string;
    title: string;
    titleAr?: string;
    description?: string;
    kind?: string;
    isPreview?: boolean;
  }>(
    ({ sectionId, ...body }) => api.post(`admin/sections/${sectionId}/lessons`, body),
    courseId,
  );
}

export function useUpdateLesson(courseId: string) {
  return useCourseMutation<{
    lessonId: string;
    title?: string;
    description?: string;
    status?: string;
    isPreview?: boolean;
  }>(({ lessonId, ...body }) => api.patch(`admin/lessons/${lessonId}`, body), courseId);
}

export function useArchiveLesson(courseId: string) {
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

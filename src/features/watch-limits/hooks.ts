import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import type {
  CourseResetSummary,
  StudentWatchLimits,
  WatchLimitAction,
  WatchLimitVideo,
} from './types';

const base = (courseId: string) => `admin/watch-limits/courses/${courseId}`;

export function useStudentWatchLimits(courseId: string, userId: string | null) {
  return useQuery({
    queryKey: queryKeys.watchLimits.student(courseId, userId ?? ''),
    queryFn: () => api.get<StudentWatchLimits>(`${base(courseId)}/students/${userId}`),
    enabled: Boolean(userId),
  });
}

export interface WatchLimitChange {
  action: WatchLimitAction;
  amount?: number;
  /** Omit for the whole-course bulk change for this student. */
  videoId?: string;
}

export function useChangeWatchLimit(courseId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      amount,
      videoId,
    }: WatchLimitChange): Promise<
      | { video: WatchLimitVideo; affected: number }
      | { targetVideos: number; affectedVideos: number }
    > =>
      videoId
        ? api.post<{ video: WatchLimitVideo; affected: number }>(
            `${base(courseId)}/students/${userId}/videos/${videoId}`,
            { action, amount },
          )
        : api.post<{ targetVideos: number; affectedVideos: number }>(
            `${base(courseId)}/students/${userId}/bulk`,
            { action, amount },
          ),
    // On failure too: a 409 means what was on screen was stale.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.watchLimits.student(courseId, userId),
      }),
  });
}

export function useCourseResetPreview(
  courseId: string,
  restoreDefault: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.watchLimits.resetPreview(courseId, restoreDefault),
    queryFn: () =>
      api.get<CourseResetSummary>(`${base(courseId)}/reset-preview`, {
        query: { restoreDefault: String(restoreDefault) },
      }),
    enabled,
    // The figures must describe the database as it is when the admin decides.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useResetCourseViews(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (restoreDefault: boolean) =>
      api.post<CourseResetSummary>(`${base(courseId)}/reset`, {
        restoreDefault,
        confirm: true,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.watchLimits.all }),
  });
}

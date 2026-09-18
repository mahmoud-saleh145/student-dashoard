'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AuditLogRow,
  CourseStudentRow,
  DeviceRow,
  StudentRow,
} from '@/types/domain';

export function useStudents(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.students.list(query),
    queryFn: () =>
      api.page<StudentRow>('admin/users', { query: { ...query, role: 'STUDENT' } }),
    placeholderData: (previous) => previous,
  });
}

export function useStudent(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.students.detail(userId ?? 'none'),
    queryFn: () => api.get<StudentRow>(`admin/users/${userId}`),
    enabled: Boolean(userId),
  });
}

export function useStudentEnrollments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.students.enrollments(userId ?? 'none', {}),
    queryFn: () =>
      api.page<CourseStudentRow>('admin/enrollments', {
        query: { userId: userId ?? '', page: 1, pageSize: 100 },
      }),
    enabled: Boolean(userId),
  });
}

export function useStudentSessions(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.students.sessions(userId ?? 'none'),
    queryFn: () =>
      api.page<{
        id: string;
        status: string;
        ipAddress: string | null;
        platform: string | null;
        appVersion: string | null;
        createdAt: string;
        lastSeenAt: string;
        device?: DeviceRow | null;
      }>(`sessions/users/${userId}`, { query: { page: 1, pageSize: 20 } }),
    enabled: Boolean(userId),
  });
}

/**
 * Administrative actions taken on this student.
 *
 * Read from the append-only audit trail, scoped to this user's entity id — so
 * it shows who changed what, when, and what the value was before. There is no
 * write path for it anywhere in the API.
 */
export function useStudentHistory(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.students.history(userId ?? 'none'),
    queryFn: () => api.get<AuditLogRow[]>(`audit/user/${userId}`),
    enabled: Boolean(userId),
  });
}

function useStudentMutation<TInput>(perform: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useUpdateStudent() {
  return useStudentMutation<{
    id: string;
    fullName?: string;
    email?: string;
    gender?: string;
    universityId?: string;
    facultyId?: string;
    departmentId?: string;
    academicYearId?: string;
  }>(({ id, ...body }) => api.patch(`admin/users/${id}`, body));
}

/**
 * Blocking and unblocking.
 *
 * Blocking is a status change, never a delete: the account, its purchases, its
 * watch history and its support tickets all remain. Suspending immediately
 * revokes the account's sessions, refresh tokens and any live playback grant —
 * that is done by the backend, not by anything here.
 */
export function useSetStudentStatus() {
  return useStudentMutation<{ id: string; status: 'ACTIVE' | 'SUSPENDED' }>(({ id, status }) =>
    api.patch(`admin/users/${id}`, { status }),
  );
}

/**
 * Clears a student's device binding.
 *
 * After this the next device they sign in from becomes the bound one, up to
 * the platform's configured device limit. Used when someone genuinely changed
 * phone.
 */
export function useResetDeviceBinding() {
  return useStudentMutation<{ userId: string; reason: string }>(({ userId, reason }) =>
    api.post(`admin/devices/users/${userId}/reset-binding`, { reason }),
  );
}

export function useRevokeDevice() {
  return useStudentMutation<{ deviceId: string; reason: string }>(({ deviceId, reason }) =>
    api.post(`admin/devices/${deviceId}/revoke`, { reason }),
  );
}

/** Sends one notification to one student. */
export function useNotifyStudent() {
  return useMutation({
    mutationFn: (input: { userId: string; title: string; body: string }) =>
      api.post('notifications/announcements', {
        title: input.title,
        body: input.body,
        userId: input.userId,
        publishNow: true,
      }),
  });
}

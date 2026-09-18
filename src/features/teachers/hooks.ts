'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { SelectOption } from '@/components/ui/field';
import type { TeacherRow } from '@/types/domain';

export function useTeachers(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.teachers.list(query),
    queryFn: () => api.page<TeacherRow>('admin/users/teachers', { query }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Teachers as select options.
 *
 * One request, cached across every form that needs to pick a teacher — the
 * course dialog, the code generator and the course filter all use this rather
 * than each fetching their own list.
 */
export function useTeacherOptions() {
  const query = useQuery({
    queryKey: queryKeys.teachers.list({ options: true }),
    queryFn: () =>
      api.page<TeacherRow>('admin/users/teachers', {
        query: { page: 1, pageSize: 100, status: 'ACTIVE' },
      }),
    staleTime: 5 * 60_000,
  });

  const options = useMemo<SelectOption[]>(
    () =>
      (query.data?.items ?? []).map((teacher) => ({
        value: teacher.id,
        label: teacher.fullName,
      })),
    [query.data],
  );

  return { ...query, options };
}

function useTeacherMutation<TInput>(perform: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
    },
  });
}

export interface CreateTeacherInput {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  gender?: 'MALE' | 'FEMALE';
  title?: string;
}

export function useCreateTeacher() {
  return useTeacherMutation<CreateTeacherInput>(({ title, ...user }) =>
    api.post('admin/users', {
      ...user,
      role: 'TEACHER',
      ...(title ? { teacher: { title } } : {}),
    }),
  );
}

export function useUpdateTeacher() {
  return useTeacherMutation<{
    id: string;
    fullName?: string;
    email?: string;
    status?: string;
    gender?: string;
    teacher?: { title?: string; bio?: string; isPublic?: boolean };
  }>(({ id, ...body }) => api.patch(`admin/users/${id}`, body));
}

/**
 * Sets a new password for a staff account.
 *
 * There is no way to read an existing password anywhere in this system — the
 * backend stores argon2id hashes and exposes no endpoint that returns them.
 * Every "reset" is a write of a new value, and it revokes that account's
 * sessions.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { userId: string; newPassword: string; note?: string }) =>
      api.put(`admin/users/${input.userId}/password`, {
        newPassword: input.newPassword,
        note: input.note,
      }),
  });
}

export function useTeacherEarnings(teacherId: string, params: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.teachers.earnings(teacherId, params),
    queryFn: () =>
      api.get<{
        totals: { gross: number; teacher: number; platform: number; currency?: string };
        courses: { courseId: string; courseTitle: string; amount: number }[];
      }>(`analytics/teachers/${teacherId}/earnings`, { query: params }),
    enabled: Boolean(teacherId),
  });
}

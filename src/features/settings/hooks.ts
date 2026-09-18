'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useSession } from '@/lib/session-context';
import type { PlatformSettings } from '@/types/domain';

interface SettingsResponse {
  keys: string[];
  settings: PlatformSettings;
}

export function usePlatformSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () => api.get<SettingsResponse>('admin/settings'),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<PlatformSettings>) =>
      api.put<SettingsResponse>('admin/settings', { settings }),
    onSuccess: async (data) => {
      // Seed the cache from the response rather than refetching: the endpoint
      // returns the full, post-write state, so a second request would only
      // confirm what we already have.
      queryClient.setQueryData(queryKeys.settings.all, data);
    },
  });
}

/**
 * What this user may do with course content, right now.
 *
 * Admins and the master are never constrained by the teacher switches, so they
 * short-circuit to `true` without a request. For a teacher, the four switches
 * come from platform settings — which they cannot read through
 * `GET /admin/settings` — so the capabilities are taken from the public
 * app-config document instead.
 *
 * **This is for hiding controls only.** The backend re-checks every one of
 * these when the request arrives, and refuses it regardless of what the
 * dashboard rendered.
 */
export interface TeacherCapabilities {
  canDeleteLectures: boolean;
  canDeleteVideos: boolean;
  canEditVideoUrls: boolean;
  canEditCoursePrices: boolean;
  isLoading: boolean;
}

interface AppConfigResponse {
  features?: Record<string, boolean>;
  teacher?: {
    canDeleteLectures?: boolean;
    canDeleteVideos?: boolean;
    canEditVideoUrls?: boolean;
    canEditCoursePrices?: boolean;
  };
}

export function useTeacherCapabilities(): TeacherCapabilities {
  const { isAdmin, isTeacher } = useSession();

  const settings = usePlatformSettings(isAdmin);

  const appConfig = useQuery({
    queryKey: ['meta', 'app-config'],
    queryFn: () => api.get<AppConfigResponse>('meta/app-config'),
    enabled: isTeacher,
    staleTime: 60_000,
  });

  if (isAdmin) {
    return {
      canDeleteLectures: true,
      canDeleteVideos: true,
      canEditVideoUrls: true,
      canEditCoursePrices: true,
      isLoading: false,
    };
  }

  const teacher = appConfig.data?.teacher;

  return {
    // Default closed while loading and when the flag is absent: showing a
    // control that then fails is worse than briefly hiding one that is allowed.
    canDeleteLectures: teacher?.canDeleteLectures ?? false,
    canDeleteVideos: teacher?.canDeleteVideos ?? false,
    canEditVideoUrls: teacher?.canEditVideoUrls ?? false,
    canEditCoursePrices: teacher?.canEditCoursePrices ?? false,
    isLoading: appConfig.isLoading || settings.isLoading,
  };
}

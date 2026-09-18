'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AnnouncementDetail,
  AnnouncementRow,
  AudiencePreview,
  AudienceRule,
  CreateAnnouncementInput,
  DispatchResult,
  UpdateAnnouncementInput,
} from '@/types/commerce';

/**
 * Announcements.
 *
 * All `@AdminOnly()`. A teacher notifies their own course's students through
 * the course screens; reaching an arbitrary audience is a platform-wide power
 * and is not delegated.
 *
 * The one rule this module enforces above all others: **the recipient count is
 * never computed in the browser.** It comes from the backend's preview
 * endpoint, which compiles the same rule through the same code the send will
 * use. A count the dashboard worked out itself could differ from the real
 * audience, and the person reading it would have no way to tell.
 */

export function useAnnouncements(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.announcements.list(query),
    queryFn: () => api.page<AnnouncementRow>('admin/announcements', { query }),
    placeholderData: (previous) => previous,
  });
}

export function useAnnouncement(id: string | null) {
  return useQuery({
    queryKey: queryKeys.announcements.detail(id ?? 'none'),
    queryFn: () => api.get<AnnouncementDetail>(`admin/announcements/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * How many people a rule would reach.
 *
 * A query rather than a mutation, keyed by the rule itself, so an unchanged
 * rule is not re-counted on every keystroke and a rule the admin returns to is
 * answered from cache. It writes nothing and sends nothing.
 *
 * `enabled` is the caller's gate: previewing while someone is mid-edit costs a
 * round trip per change for a number they are not looking at yet.
 */
export function useAudiencePreview(rule: AudienceRule, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.announcements.preview(rule),
    queryFn: () =>
      api.post<AudiencePreview>('admin/announcements/preview', { audience: rule }),
    enabled,
    // The audience moves as students enrol, so a cached count goes stale; a
    // minute is long enough to stop keystroke-rate refetching and short enough
    // that the figure still means something at send time.
    staleTime: 60_000,
  });
}

function useAnnouncementMutation<TInput, TResult>(
  perform: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
    },
  });
}

export function useCreateAnnouncement() {
  return useAnnouncementMutation((input: CreateAnnouncementInput) =>
    api.post<AnnouncementRow>('admin/announcements', input),
  );
}

/**
 * Edits an announcement that has not been sent.
 *
 * The backend refuses once it has sent even once, with
 * `ANNOUNCEMENT_NOT_EDITABLE`: the text is what people received, and changing
 * it afterwards would make the record disagree with every inbox holding it.
 */
export function useUpdateAnnouncement() {
  return useAnnouncementMutation(
    (input: { id: string } & UpdateAnnouncementInput) => {
      const { id, ...body } = input;
      return api.patch<AnnouncementRow>(`admin/announcements/${id}`, body);
    },
  );
}

/** Stops future occurrences. Never touches notifications already delivered. */
export function useCancelAnnouncement() {
  return useAnnouncementMutation((id: string) =>
    api.delete(`admin/announcements/${id}`),
  );
}

/**
 * Sends an occurrence now.
 *
 * The server claims the occurrence before writing a single notification, so
 * pressing this twice sends once — the second call comes back
 * `skipped: 'already-claimed'` rather than fanning out again.
 */
export function useSendAnnouncementNow() {
  return useAnnouncementMutation((id: string) =>
    api.post<DispatchResult>(`admin/announcements/${id}/send-now`),
  );
}

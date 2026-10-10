'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VideoStatus } from '@/types/domain';

/** Reads and writes for one lecture's video. Every route is `@StaffOnly()`. */

/** How often to re-check a Gumlet asset that has not settled yet. */
const GUMLET_POLL_MS = 5000;

/** Exactly what `VideosService.status` returns. */
export interface VideoStatusDetail {
  id: string;
  lessonId: string;
  courseId: string;
  status: VideoStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isEncrypted: boolean;
  renditions: {
    height: number;
    width: number;
    bitrateKbps: number;
    sizeBytes: number | null;
  }[];
  captions: { language: string; label: string; isDefault: boolean }[];
  processingError: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  sourceSizeBytes: number | null;
  deleted?: boolean;
  /**
   * Playback provider for this video. `null` is the legacy R2/AES-128 HLS
   * path; `'gumlet'` means the media is packaged and DRM-encrypted by Gumlet
   * and delivered as DASH. Present on every status response so the panel can
   * show which pipeline a video is on without a second request.
   */
  drmProvider: 'gumlet' | null;
  gumletAssetId: string | null;
  gumletStatus: string | null;
  gumletError: string | null;
  /**
   * Present while QUEUED/PROCESSING. `workerOnline: false` means no queue
   * consumer has checked in for a minute — the video will not move until one
   * runs, and the panel says so instead of showing QUEUED forever.
   */
  workerOnline?: boolean;
  workerLastSeenAt?: string | null;
  workerCanTranscode?: boolean | null;
}

/** The statuses that will change on their own, so polling is worth the calls. */
const IN_FLIGHT: ReadonlySet<VideoStatus> = new Set<VideoStatus>([
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
]);

const POLL_INTERVAL_MS = 4000;

/**
 * One video's processing state.
 *
 * Polls only while the status can still change. Transcoding is a background
 * job with no push channel to this dashboard, so asking repeatedly is the only
 * way to notice it finished — but `READY` and `FAILED` are terminal, and
 * polling those forever would be a request every four seconds for as long as
 * the tab is open. `refetchIntervalInBackground` is deliberately left off, so a
 * backgrounded tab stops asking.
 */
export function useVideoStatus(videoId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.videos.status(videoId ?? 'none'),
    queryFn: () => api.get<VideoStatusDetail>(`videos/${videoId}/status`),
    enabled: enabled && Boolean(videoId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // No data yet: the first load is in flight, not a reason to schedule.
      if (!status) return false;
      return IN_FLIGHT.has(status) ? POLL_INTERVAL_MS : false;
    },
  });
}

/**
 * Re-runs transcoding from the stored source.
 *
 * The source file is still in the uploads bucket after a failure, so this does
 * not re-upload anything — which matters when the file is 8 GB. The backend
 * refuses if there is no source (`INVALID_STATE`), and the panel says to
 * re-upload in that case.
 */
export function useRetryVideoProcessing(courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) =>
      api.post<{ videoId: string; status: VideoStatus; jobId: string | null }>(
        `videos/${videoId}/retry`,
      ),
    onSuccess: async (_result, videoId) => {
      // Back to QUEUED, which restarts polling.
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.status(videoId) });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      }
    },
  });
}

/**
 * Gumlet-backed delivery.
 *
 * The R2/HLS path needs none of this. These three hooks talk to the staff
 * endpoints on `videos`, and every one of them is gated server-side on
 * `@StaffOnly()` plus the same course-ownership check the other video writes
 * use, so a teacher cannot adopt or inspect a course outside their scope.
 *
 * `sync` returns the mirrored Gumlet state, which is what the panel shows
 * while a Gumlet asset is still processing.
 */
export function useAdoptForGumlet(courseId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api.post<{ assetId: string; status: string }>(`videos/${videoId}/gumlet/adopt`),
    onSuccess: async (_r, videoId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.status(videoId) });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      }
    },
  });
}

export function useSyncGumletAsset(courseId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) =>
      api.post<{ assetId: string; status: string; playable: boolean }>(`videos/${videoId}/gumlet/sync`),
    onSuccess: async (_r, videoId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.status(videoId) });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      }
    },
  });
}

/**
 * Polls only while the Gumlet asset can still change, mirroring
 * `useVideoStatus`: a terminal state stops asking.
 *
 * This is a READ of a staff-only endpoint - it does not ask Gumlet for
 * anything. The backend returns the state already mirrored onto the video row,
 * so polling here costs one cheap API call and leaves the provider alone.
 * Pushing Gumlet's state into the row is the sync endpoint's job.
 */
export function useGumletAssetState(videoId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.videos.gumlet(videoId ?? 'none'),
    queryFn: () =>
      api.get<{
        assetId: string | null;
        gumletStatus: string | null;
        videoStatus: VideoStatus;
        error: string | null;
        playable: boolean;
      }>(`videos/${videoId}/gumlet/status`),
    enabled: enabled && Boolean(videoId),
    refetchInterval: (query) => {
      // Poll while Gumlet can still move the video; stop once it is playable
      // or has failed. Same intent as `useVideoStatus`'s in-flight guard.
      const data = query.state.data;
      if (data?.playable) return false;
      const gumletStatus = data?.gumletStatus;
      if (gumletStatus === 'errored' || gumletStatus === 'failed') return false;
      // No data yet is not a reason to schedule a repeat.
      if (!data) return false;
      return GUMLET_POLL_MS;
    },
  });
}

/**
 * Deletes a lecture's video (`DELETE /videos/:id`).
 *
 * Soft on the metadata — watch events reference the row — and hard on the
 * bytes: the HLS output and the uploaded source are purged from storage. Any
 * live playback grant for it is revoked. A new video can be uploaded to the
 * lecture afterwards.
 */
export function useDeleteVideo(courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => api.delete<{ ok: boolean }>(`videos/${videoId}`),
    onSuccess: async (_result, videoId) => {
      queryClient.removeQueries({ queryKey: queryKeys.videos.status(videoId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.sections(courseId) });
      }
    },
  });
}

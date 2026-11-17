'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { VideoStatus } from '@/types/domain';

/**
 * Gumlet statuses after which an asset will never become playable.
 *
 * Mirrors `isTerminalGumletFailure` in the backend's `gumlet-failure.ts`.
 * `deleted` is the asset having been removed at Gumlet: treated as "still in
 * progress", the panel kept polling it and offering "Check Gumlet status" for a
 * video that can only be fixed by processing it again.
 */
export function isTerminalGumletFailure(status: string | null | undefined): boolean {
  return status === 'errored' || status === 'failed' || status === 'deleted';
}

/** Reads and writes for one lecture's video. Every route is `@StaffOnly()`. */

/** How often to re-check a Gumlet asset that has not settled yet. */
const GUMLET_POLL_MS = 5000;

/**
 * THE THREE INDEPENDENT STATES OF ONE VIDEO
 *
 * A lecture video is one file and two unrelated processing systems:
 *
 *   source   the original file in storage
 *   gumlet   managed transcoding + DRM, played by the web
 *   mobile   our own HLS ladder, played by the Android and iOS apps
 *
 * None is a precondition of another. Gumlet can reject a file that the mobile
 * encoder handles perfectly, and the encoder can be offline while Gumlet
 * finishes. `status` on the response is the Gumlet/web lifecycle (kept for the
 * lecture list and older code); these blocks are what the panel renders, so
 * that "Gumlet failed" is never shown as "the upload failed".
 *
 * All three are optional: an API from before they existed simply omits them
 * and the panel falls back to what it always showed.
 */
export type SourceState = 'NONE' | 'UPLOADING' | 'VERIFIED';

export type GumletPipelineState =
  | 'NOT_APPLICABLE'
  | 'WAITING_UPLOAD'
  | 'PENDING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export type MobilePipelineStatus = 'NONE' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface VideoSourceDetail {
  state: SourceState;
  sizeBytes: number | null;
}

export interface VideoGumletDetail {
  state: GumletPipelineState;
  providerStatus: string | null;
  hasAsset: boolean;
  /** False while the accepted upload is still waiting to reach the queue; null when not queued. */
  queued: boolean | null;
  error: string | null;
  updatedAt: string | null;
  drmVerified: boolean;
  canRetry: boolean;
}

export interface VideoMobileDetail {
  status: MobilePipelineStatus;
  error: string | null;
  jobId: string | null;
  /** When the current processing request was recorded (queued since). */
  requestedAt?: string | null;
  /** False while the request is recorded but the queue has not accepted the job yet. */
  queued?: boolean | null;
  /** How many times processing has been requested for this video. */
  attempts?: number;
  trigger?: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  renditions: number;
  /** 0-100 while a worker is encoding; up to a minute old. */
  progress?: number | null;
  /** A worker has this video on its bench right now. */
  active?: boolean;
  /** Mobile encoding is paused by an operator and this video is waiting for it. */
  paused?: boolean;
  /** Administrators only. */
  pauseReason?: string | null;
  /** Whether new uploads are queued for mobile automatically on this deployment. */
  automatic?: boolean;
  workerOnline?: boolean;
  workerLastSeenAt?: string | null;
  workerCanTranscode?: boolean | null;
  canRetry?: boolean;
}

/** Mobile states that will change without anyone doing anything. */
export function isMobileInFlight(status: MobilePipelineStatus | undefined): boolean {
  return status === 'QUEUED' || status === 'PROCESSING';
}

/** Exactly what `VideosService.status` returns. */
export interface VideoStatusDetail {
  id: string;
  lessonId: string | null;
  courseId: string;
  /** Live lectures attached to this asset, including the owning one. */
  attachmentCount?: number;
  /** True when more than one lecture uses this asset. */
  shared?: boolean;
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
  /**
   * True when the bytes were CONFIRMED in storage.
   *
   * The backend only writes `sourceSizeBytes` after a HEAD on the object
   * proved it is really there, so this is the difference between "an upload
   * was started" and "the file is in the bucket". A video can sit at
   * `UPLOADING` with no job and no provider asset when its upload was
   * interrupted — and the honest thing to say about that is "the file did not
   * arrive", not "it is being processed".
   */
  uploadConfirmed?: boolean;
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
  /** The original file. See the note on the three states above. */
  source?: VideoSourceDetail;
  /** The Gumlet pipeline as one normalised state. */
  gumlet?: VideoGumletDetail;
  /** The independent mobile HLS pipeline. */
  mobile?: VideoMobileDetail;
}

/** The statuses that will change on their own, so polling is worth the calls. */
const IN_FLIGHT: ReadonlySet<VideoStatus> = new Set<VideoStatus>([
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
]);

const POLL_INTERVAL_MS = 4000;

/**
 * How often to re-check while ONLY the mobile encode is still in flight.
 *
 * Slower on purpose. A mobile encode runs for most of an hour on a single
 * machine and its progress is published once a minute, so asking every four
 * seconds would learn nothing new - and each of those requests costs the API
 * a read of the worker's heartbeat on a per-request Redis plan.
 */
const MOBILE_POLL_INTERVAL_MS = 15_000;

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
      const data = query.state.data;
      const status = data?.status;
      // No data yet: the first load is in flight, not a reason to schedule.
      if (!status) return false;
      if (IN_FLIGHT.has(status)) return POLL_INTERVAL_MS;
      // Gumlet has settled (READY or FAILED) but the mobile encode has not:
      // keep following it, more slowly. Before this, a lecture whose Gumlet
      // side finished stopped being watched and its mobile state was never
      // shown changing at all.
      return isMobileInFlight(data?.mobile?.status) ? MOBILE_POLL_INTERVAL_MS : false;
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
 * Retries the MOBILE HLS encode for one video (`POST videos/:id/mobile/retry`).
 *
 * Touches the mobile pipeline only: the Gumlet asset, its DRM state and web
 * playback are not reset, restarted or otherwise affected. The backend keeps
 * the existing job when one is already queued or running, so pressing this
 * twice cannot start two encodes.
 */
export function useRetryMobileProcessing(courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) =>
      api.post<{
        videoId: string;
        jobId: string | null;
        alreadyQueued: boolean;
        /** False when the request is recorded but the queue has not accepted it yet. */
        enqueued?: boolean;
        workerOnline?: boolean;
      }>(`videos/${videoId}/mobile/retry`),
    onSuccess: async (_result, videoId) => {
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
      if (isTerminalGumletFailure(gumletStatus)) return false;
      // No data yet is not a reason to schedule a repeat.
      if (!data) return false;
      return GUMLET_POLL_MS;
    },
  });
}

/**
 * Asks the API to confirm the upload and queue it — WITHOUT sending the file
 * again.
 *
 * This is the recovery for an upload that was interrupted. The bytes may
 * already be in the bucket: an object store can commit a large PUT and then
 * fail to answer it, and the browser is left believing the upload failed. On
 * 2026-10-21 that left a 522 MB lecture sitting in storage with a row that
 * said nothing had arrived, and no way to finish the job.
 *
 * The backend's `complete` endpoint verifies the object with a HEAD and, if
 * it is there, queues the processing job. Nothing is re-uploaded, and nothing
 * is re-created: the same row, the same object, one job.
 *
 * The endpoint is idempotent, so calling it on a video that is already queued
 * returns the current state instead of starting a second job.
 */
export function useCompleteVideoUpload(courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) =>
      api.post<{
        videoId: string;
        status: VideoStatus;
        jobId: string | null;
        sourceSizeBytes?: number;
        alreadyQueued?: boolean;
      }>(`videos/${videoId}/complete`),
    onSuccess: async (_result, videoId) => {
      // Back to QUEUED, which restarts polling.
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.status(videoId) });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      }
    },
  });
}

export interface RemoveVideoResult {
  ok: boolean;
  /** True when the asset is shared and was only detached from this lecture. */
  detached?: boolean;
  /** Other lectures that still use the asset after this removal. */
  remainingAttachments?: number;
}

/**
 * Removes a video from THIS lecture (`DELETE /videos/:id?lessonId=`).
 *
 * The lecture is always sent: a shared asset is attached to several lectures,
 * and the backend refuses to guess which one to remove it from. While other
 * lectures still use it the asset is only detached here; otherwise the
 * metadata is archived (watch events reference the row) and the HLS output and
 * the uploaded source are purged. Live playback grants through this lecture are
 * revoked. A new video can be uploaded to the lecture afterwards.
 */
export function useDeleteVideo(courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ videoId, lessonId }: { videoId: string; lessonId: string }) =>
      api.delete<RemoveVideoResult>(`videos/${videoId}`, undefined, { query: { lessonId } }),
    onSuccess: async (_result, { videoId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.videos.status(videoId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.courses.sections(courseId) });
      }
    },
  });
}

'use client';

import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/primitives';
import type {
  GumletPipelineState,
  VideoGumletDetail,
  VideoMobileDetail,
  VideoSourceDetail,
} from '@/features/videos/hooks';
import { formatBytes, formatDateTime } from '@/lib/format';

/**
 * THE THREE STATES OF A LECTURE VIDEO, SIDE BY SIDE
 *
 * One file, two unrelated processing systems. Until now the panel had a single
 * badge, which is the Gumlet/web state, so every problem looked like the same
 * problem: a lecture Gumlet rejected read as "Failed" although the file was
 * safely uploaded and the mobile encode was running normally, and a reader
 * could reasonably conclude the upload itself had been lost.
 *
 * Each row here answers one question and nothing else:
 *
 *   Upload      is the original file safely in storage?
 *   Gumlet      has the web/DRM pipeline finished with it?
 *   Mobile HLS  has the apps' pipeline finished with it?
 *
 * The functions that decide the wording are pure and exported so they can be
 * read (and reasoned about) without rendering anything.
 */

export interface PipelineChip {
  label: string;
  tone: BadgeTone;
}

/** What the browser itself knows about the transfer, which the server cannot. */
export type LocalUploadPhase = 'busy' | 'failed' | 'unconfirmed' | 'none';

export function uploadChip(
  local: LocalUploadPhase,
  source: VideoSourceDetail | undefined,
): PipelineChip {
  if (local === 'busy') return { label: 'Uploading', tone: 'info' };
  if (local === 'failed') return { label: 'Upload failed', tone: 'danger' };
  if (source?.state === 'VERIFIED') return { label: 'Uploaded', tone: 'success' };
  if (local === 'unconfirmed') return { label: 'Uploaded, not confirmed yet', tone: 'warning' };
  if (source?.state === 'UPLOADING')
    return { label: 'Not confirmed in storage', tone: 'warning' };
  return { label: 'No file', tone: 'neutral' };
}

const GUMLET_CHIPS: Record<GumletPipelineState, PipelineChip> = {
  NOT_APPLICABLE: { label: 'Not used', tone: 'neutral' },
  WAITING_UPLOAD: { label: 'Waiting for the upload', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'info' },
  SUBMITTED: { label: 'Processing', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  READY: { label: 'Ready', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

export function gumletChip(gumlet: VideoGumletDetail | undefined): PipelineChip | null {
  return gumlet ? GUMLET_CHIPS[gumlet.state] : null;
}

export function mobileChip(mobile: VideoMobileDetail | undefined): PipelineChip | null {
  if (!mobile) return null;
  switch (mobile.status) {
    case 'NONE':
      return { label: 'Not processed', tone: 'neutral' };
    case 'QUEUED':
      return { label: 'Queued', tone: 'warning' };
    case 'PROCESSING':
      return {
        label:
          typeof mobile.progress === 'number'
            ? `Processing ${Math.round(mobile.progress)}%`
            : 'Processing',
        tone: 'info',
      };
    case 'READY':
      return { label: 'Ready', tone: 'success' };
    case 'FAILED':
      return { label: 'Failed', tone: 'danger' };
  }
}

/** The one sentence under the Mobile HLS heading. Says what is true, not what is hoped. */
export function describeMobile(mobile: VideoMobileDetail): string {
  switch (mobile.status) {
    case 'READY':
      return `Encoded for the Android and iOS apps (${mobile.renditions} ${
        mobile.renditions === 1 ? 'quality' : 'qualities'
      }).`;
    case 'FAILED':
      return mobile.error ?? 'The mobile encode failed.';
    case 'PROCESSING':
      if (mobile.active === false && mobile.workerOnline === false) {
        return 'The encoder went offline while this was being encoded. It is picked up again automatically when the encoder is back.';
      }
      return 'Being encoded for the apps. A lecture usually takes about half its own length.';
    case 'QUEUED':
      if (mobile.queued === false) {
        return 'Accepted. It is being placed in the processing queue - no action is needed.';
      }
      if (mobile.paused) {
        return 'Queued. Mobile encoding is paused by an administrator, so this starts when it is resumed.';
      }
      if (mobile.workerOnline === false) {
        return 'Queued. The encoder is offline right now; this starts automatically when it is back online.';
      }
      // A note the worker left for a wait that is not the video's fault (disk space).
      if (mobile.error) return `Queued. ${mobile.error}`;
      return 'Queued. It is encoded as soon as the encoder is free.';
    case 'NONE':
      return mobile.automatic === false
        ? 'Not processed for the apps. Automatic mobile processing is switched off on this server.'
        : 'Not processed for the apps yet.';
  }
}

/** Three labelled chips: the whole state of the video at a glance. */
export function PipelineSummary({
  local,
  source,
  gumlet,
  mobile,
}: {
  local: LocalUploadPhase;
  source?: VideoSourceDetail;
  gumlet?: VideoGumletDetail;
  mobile?: VideoMobileDetail;
}) {
  const upload = uploadChip(local, source);
  const web = gumletChip(gumlet);
  const apps = mobileChip(mobile);

  return (
    <dl
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
      data-testid="pipeline-summary"
      aria-label="Video processing status"
    >
      <div className="flex items-center gap-1.5" data-testid="pipeline-upload">
        <dt className="text-muted">Upload</dt>
        <dd>
          <Badge tone={upload.tone}>{upload.label}</Badge>
        </dd>
        {source?.state === 'VERIFIED' && source.sizeBytes ? (
          <dd className="text-muted">{formatBytes(source.sizeBytes)}</dd>
        ) : null}
      </div>
      {web ? (
        <div className="flex items-center gap-1.5" data-testid="pipeline-gumlet">
          <dt className="text-muted">Gumlet</dt>
          <dd>
            <Badge tone={web.tone}>{web.label}</Badge>
          </dd>
        </div>
      ) : null}
      {apps ? (
        <div className="flex items-center gap-1.5" data-testid="pipeline-mobile">
          <dt className="text-muted">Mobile HLS</dt>
          <dd>
            <Badge tone={apps.tone}>{apps.label}</Badge>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * The mobile pipeline's own panel: state, timings and its own retry.
 *
 * Its retry calls the MOBILE endpoint only. Nothing here can reset, restart or
 * fail the Gumlet side, which is why it is a separate control rather than a
 * second meaning for "Try processing again".
 */
export function MobilePipelinePanel({
  mobile,
  canStart,
  retrying,
  onRetry,
}: {
  mobile: VideoMobileDetail;
  /** Whether this reader may start an encode for a video that has never had one. */
  canStart: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const chip = mobileChip(mobile);
  const failed = mobile.status === 'FAILED';
  const offerRetry = mobile.canRetry === true && (failed || canStart);

  const facts = [
    mobile.status === 'QUEUED' && mobile.requestedAt
      ? `Queued ${formatDateTime(mobile.requestedAt)}`
      : null,
    mobile.status === 'PROCESSING' && mobile.processingStartedAt
      ? `Started ${formatDateTime(mobile.processingStartedAt)}`
      : null,
    mobile.status === 'READY' && mobile.processedAt
      ? `Finished ${formatDateTime(mobile.processedAt)}`
      : null,
    mobile.attempts && mobile.attempts > 1 ? `Attempt ${mobile.attempts}` : null,
    mobile.paused && mobile.pauseReason ? `Pause reason: ${mobile.pauseReason}` : null,
    (mobile.status === 'QUEUED' || mobile.status === 'PROCESSING') &&
    mobile.workerOnline === false &&
    mobile.workerLastSeenAt
      ? `Encoder last seen ${formatDateTime(mobile.workerLastSeenAt)}`
      : null,
  ].filter(Boolean);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-border p-2"
      data-testid="mobile-pipeline-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Mobile HLS</Badge>
        {chip ? <Badge tone={chip.tone}>{chip.label}</Badge> : null}
      </div>

      {mobile.status === 'PROCESSING' && typeof mobile.progress === 'number' ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
          role="progressbar"
          aria-valuenow={Math.round(mobile.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mobile encoding progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.max(2, Math.min(100, mobile.progress))}%` }}
          />
        </div>
      ) : null}

      {failed ? (
        <p
          role="alert"
          className="text-xs font-medium text-danger"
          data-testid="mobile-pipeline-message"
        >
          {describeMobile(mobile)}
        </p>
      ) : (
        <p
          className="text-xs text-muted"
          aria-live="polite"
          data-testid="mobile-pipeline-message"
        >
          {describeMobile(mobile)}
        </p>
      )}

      {facts.length > 0 ? <p className="text-[11px] text-muted">{facts.join(' · ')}</p> : null}

      {offerRetry ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={retrying}
            onClick={onRetry}
          >
            {failed ? 'Retry Mobile HLS' : 'Process for mobile'}
          </Button>
          <p className="text-[11px] text-muted">
            Uses the file already in storage. Gumlet and web playback are not affected.
          </p>
        </div>
      ) : null}
    </div>
  );
}

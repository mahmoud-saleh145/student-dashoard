'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '@/lib/api-client';
import { ApiError, messageFor } from '@/lib/errors';

/**
 * Uploading a lecture video.
 *
 * Three steps, and the middle one deliberately does not touch this application:
 *
 *   1. `POST videos/uploads/init`        — creates the Video row, returns a
 *                                          presigned PUT into the private
 *                                          uploads bucket
 *   2. `PUT <uploadUrl>`                 — browser → R2, direct
 *   3. `POST videos/:videoId/complete`   — the API checks the object actually
 *                                          landed, then queues transcoding
 *
 * **Why not through our own origin, when the library document upload is?** A
 * library document is capped at 200 MB; a lecture is capped at 8 GB. Proxying
 * that would hold a socket open on the Next server and on the API behind it for
 * the length of the upload, and one slow uploader would occupy a worker for
 * minutes. `videos.service.ts` says the same thing from the other side: "A 2 GB
 * lecture streamed through Node would pin a worker for minutes and cap
 * concurrent uploads at one per process."
 *
 * The cost of going direct is a CORS policy on the uploads bucket — see
 * `docs/r2-cors.md`. Without it the PUT fails at the preflight, before a byte
 * moves, and `onerror` below is what the person sees.
 *
 * **The file is never read into memory.** `XMLHttpRequest.send(file)` hands the
 * browser a `File`, which it streams from disk. Nothing here calls
 * `arrayBuffer()`, `text()` or `FileReader`, and an 8 GB lecture costs this tab
 * no more than a small one.
 *
 * **The presigned URL is signed over the Content-Type.** The PUT must send
 * exactly the header `init` returned, and must send nothing else — an extra
 * header (`x-dashboard-request`, say) is not part of the signature and R2 will
 * refuse the request. That is also why this is the one place in the dashboard
 * that does not go through `api-client`.
 *
 * WHY A FAILED PUT IS NOT THE END OF THE UPLOAD
 * ----------------------------------------------
 *
 * This used to be the whole story: the PUT failed, the dashboard said
 * "Storage refused the upload (500)" and stopped. That is wrong, and it was
 * wrong in production on 2026-10-21: Cloudflare R2 committed a 522 MB lecture
 * and then answered the same request with `InternalError` (HTTP 500) — a code
 * Cloudflare documents as "retry the request". The object was in the bucket,
 * byte-exact and playable, and the row was left at `UPLOADING` with no job, no
 * provider asset and a `sourceSizeBytes` of NULL, because the client never got
 * to step 3.
 *
 * So a failed PUT is now treated as a QUESTION, not a verdict:
 *
 *   1. the PUT failed;
 *   2. the dashboard asks the API whether the object is really there
 *      (`POST videos/:id/complete`, which HEADs the bucket);
 *   3. if it IS there, the upload is finished — no second copy of 522 MB is
 *      asked of the reader's connection;
 *   4. if it is NOT there, the PUT is retried, with a fresh signature if the
 *      old one was rejected.
 *
 * Step 2 costs one HEAD. Step 3 saves the entire upload. That asymmetry is
 * the whole point of the change.
 */

/** Exactly the set `ALLOWED_VIDEO_TYPES` enforces in `videos.service.ts`. */
export const VIDEO_UPLOAD_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
] as const;

/**
 * `MAX_SOURCE_BYTES` in `videos.service.ts`.
 *
 * Cloudflare R2's limit for ONE PUT: 5 GiB minus 5 MiB. The upload below is a
 * single presigned PUT, so a larger file can never be stored; it used to be
 * advertised as 8 GB and a 5-8 GB file failed only after the whole transfer.
 */
export const VIDEO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024 - 5 * 1024 * 1024;

/** How the limit is written for people. */
export const VIDEO_UPLOAD_MAX_LABEL = '4.99 GB';

/**
 * How many times ONE file is PUT before the dashboard gives up.
 *
 * Three: the first attempt, plus two retries for a failure that is documented
 * as transient. The object store is the only component here that can fail
 * after having received hundreds of megabytes, so it is the only one worth
 * retrying — and the retry is bounded because the reader is paying for it in
 * mobile data.
 */
export const MAX_UPLOAD_ATTEMPTS = 3;

/** First retry delay. Doubled each time. */
const RETRY_BASE_DELAY_MS = 1500;

/** The backend's `@Matches` on `filename`, copied rather than approximated. */
const FILENAME_PATTERN = /^[\w .()\-؀-ۿ]+\.[A-Za-z0-9]{2,5}$/;

/** What `POST videos/uploads/init` replies with. */
interface InitResponse {
  videoId: string;
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  requiredHeaders: Record<string, string>;
  completeUrl: string;
}

/** What `POST videos/:videoId/complete` replies with. */
interface CompleteResponse {
  videoId: string;
  status: string;
  jobId: string | null;
  sourceSizeBytes?: number;
  /** True when the video was already queued and no second job was started. */
  alreadyQueued?: boolean;
}

/**
 * A storage PUT that did not succeed.
 *
 * It carries the STATUS as well as a sentence, because the two lead to
 * different actions: a 403 means the signature has to be replaced, a 5xx means
 * the same bytes are worth sending again, and a 4xx that is neither means
 * sending them again would only waste the reader's data.
 */
export class StorageUploadError extends Error {
  /** The HTTP status the store answered with, or null when it never answered. */
  readonly status: number | null;

  /** True when the same request could plausibly succeed unchanged. */
  readonly retryable: boolean;

  /** True when a fresh signature is needed before another attempt. */
  readonly needsFreshSignature: boolean;

  constructor(params: {
    message: string;
    status: number | null;
    retryable: boolean;
    needsFreshSignature?: boolean;
  }) {
    super(params.message);
    this.name = 'StorageUploadError';
    this.status = params.status;
    this.retryable = params.retryable;
    this.needsFreshSignature = params.needsFreshSignature ?? false;
  }
}

/**
 * What a storage status means for the reader.
 *
 * Only the statuses that need a DIFFERENT action get their own sentence.
 * Everything else is one message with the status in it, because inventing a
 * specific explanation for a status nobody has seen before is how an error
 * message ends up confidently wrong.
 */
export function describeStorageFailure(status: number | null): {
  message: string;
  retryable: boolean;
  needsFreshSignature: boolean;
} {
  if (status === null) {
    // No status at all: the request never got an answer. Either the preflight
    // was refused (nothing was sent) or the connection dropped mid-transfer
    // (everything may have been sent). Both are worth another go, and the
    // caller checks with the server before spending the reader's data again.
    return {
      message:
        'The upload could not reach storage. Check the connection, or the bucket’s CORS rule for this site.',
      retryable: true,
      needsFreshSignature: false,
    };
  }

  if (status === 403) {
    // The signature was rejected: expired, or signed over something the
    // request did not repeat. Either way the bytes are not there, and the
    // same URL will be refused again.
    return {
      message:
        'Storage rejected the upload because its signature was no longer valid. Starting the upload again.',
      retryable: true,
      needsFreshSignature: true,
    };
  }

  if (status === 408 || status === 425 || status === 429) {
    return {
      message: `Storage asked the upload to try again shortly (${status}).`,
      retryable: true,
      needsFreshSignature: false,
    };
  }

  if (status >= 500) {
    // The provider's own documentation for this class of error is "retry the
    // request": it is a transient fault at the object store, not a verdict on
    // the file.
    return {
      message: `Storage reported a temporary problem (${status}).`,
      retryable: true,
      needsFreshSignature: false,
    };
  }

  return {
    message: `Storage refused the upload (${status}).`,
    retryable: false,
    needsFreshSignature: false,
  };
}

/**
 * Rejects what the server would reject, before spending an 8 GB round trip on
 * it. Returns a message rather than throwing: every one of these is something
 * the person fixes by choosing a different file.
 */
export function validateVideoFile(file: File): string | null {
  if (!VIDEO_UPLOAD_TYPES.includes(file.type as (typeof VIDEO_UPLOAD_TYPES)[number])) {
    return 'That file type is not accepted. Use MP4, MOV, MKV, WebM or AVI.';
  }

  if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
    return `That file is larger than the ${VIDEO_UPLOAD_MAX_LABEL} upload limit.`;
  }

  if (file.size === 0) {
    return 'That file is empty.';
  }

  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return 'The file name cannot contain path separators.';
  }

  if (!FILENAME_PATTERN.test(file.name)) {
    return 'The file name contains characters the server will not accept. Rename it and try again.';
  }

  return null;
}

/**
 * The direct PUT.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: upload progress. `fetch`
 * gives no way to observe bytes sent, and a multi-gigabyte upload with no
 * feedback is indistinguishable from a hung tab.
 *
 * NO TIMEOUT IS SET, deliberately. A lecture can be 8 GB over a phone's mobile
 * connection and take half an hour; a timeout would fail uploads that are
 * working perfectly. The store's own 5xx is the signal that something is
 * wrong, and the caller has a way to check whether the bytes landed.
 */
function putToStorage(
  file: File,
  init: InitResponse,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', init.uploadUrl, true);

    // Only the headers the signature covers. Anything extra invalidates it.
    for (const [name, value] of Object.entries(init.requiredHeaders)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      // R2 answers with an XML error document. Showing it verbatim would be
      // noise, so the status carries the meaning and the common causes are
      // named instead.
      const described = describeStorageFailure(request.status);
      reject(new StorageUploadError({ ...described, status: request.status }));
    };

    // A failed CORS preflight arrives here with no status at all, which is the
    // single most likely cause, so it is named.
    request.onerror = () => {
      const described = describeStorageFailure(null);
      reject(new StorageUploadError({ ...described, status: null }));
    };
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    request.ontimeout = () => {
      const described = describeStorageFailure(null);
      reject(new StorageUploadError({ ...described, status: null }));
    };

    signal.addEventListener('abort', () => request.abort(), { once: true });

    // The browser streams the File from disk. It is never held in JS memory.
    request.send(file);
  });
}

/**
 * The API statuses that are a DEFINITE answer about the file.
 *
 * A 400 (`UPLOAD_FAILED` — the object is not in the bucket), a 409
 * (`INVALID_STATE` — there is no upload to confirm), a 410 or a 422 all say
 * the same thing: the file is not usable as it stands, and the upload has to
 * be sent again.
 *
 * Everything else — a 401, a 403, a 404, a 5xx, and above all a network
 * failure, which the client reports as status 0 — is NOT an answer about the
 * file. Treating "I could not ask" as "the answer is no" is what turns a lost
 * acknowledgement into a second 522 MB upload.
 */
const DEFINITE_MISSING = new Set([400, 409, 410, 422]);

/**
 * Asks the API whether the object is really in the bucket.
 *
 * `POST videos/:id/complete` verifies the object with a HEAD and, when it is
 * there, queues the processing job. So this one call answers BOTH questions
 * that matter after a failed PUT — "did the bytes land?" and "can we finish
 * without sending them again?" — and it never re-uploads anything.
 *
 * `sizeBytes` is the number of bytes the client sent. When the API has it,
 * a truncated object is refused instead of being processed into a lecture that
 * ends mid-sentence.
 *
 * @returns whether the file is stored. `null` means the API could not be
 * asked, which is different from "the file is not there".
 */
async function probeStored(
  videoId: string,
  sizeBytes: number | null,
  signal: AbortSignal,
): Promise<{ stored: true } | { stored: false } | { stored: null }> {
  try {
    await api.post<CompleteResponse>(
      `videos/${videoId}/complete`,
      sizeBytes === null ? undefined : { sizeBytes },
      { signal },
    );
    return { stored: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;

    if (error instanceof ApiError && DEFINITE_MISSING.has(error.status)) {
      return { stored: false };
    }

    // The API could not be reached, or answered with its own failure. That is
    // NOT an answer about the file, and it must not be treated as one.
    return { stored: null };
  }
}

/** Waits, so a retry does not hit the store as fast as the failure did. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type VideoUploadPhase =
  | 'idle'
  /** Asking the API for a signature. */
  | 'preparing'
  /** Bytes moving, browser → R2. */
  | 'uploading'
  /** Told the API the object landed; it is verifying and enqueueing. */
  | 'finishing'
  /**
   * The PUT failed and the API is being asked whether the bytes landed
   * anyway. This is the state a reader sees while the dashboard decides
   * whether they have to send the file again.
   */
  | 'checking'
  /** Handed off. From here the Video row's own status takes over. */
  | 'queued'
  | 'error';

export interface VideoUploadState {
  phase: VideoUploadPhase;
  /** 0–100, from bytes actually sent rather than an animation. */
  progress: number;
  fileName: string | null;
  sizeBytes: number | null;
  /** Set from `init`, so the status panel can poll even if `complete` fails. */
  videoId: string | null;
  error: string | null;
  /**
   * True when the store reported a problem but the file was found there
   * anyway. The dashboard says so, because "it failed" and "it actually
   * worked" are both true and only one of them is useful to the reader.
   */
  recovered: boolean;
}

const IDLE: VideoUploadState = {
  phase: 'idle',
  progress: 0,
  fileName: null,
  sizeBytes: null,
  videoId: null,
  error: null,
  recovered: false,
};

export interface UseVideoUploadResult extends VideoUploadState {
  /** Resolves to the video id once processing is queued, else null. */
  upload: (file: File) => Promise<string | null>;
  cancel: () => void;
  reset: () => void;
  isBusy: boolean;
}

export function useVideoUpload(
  lessonId: string,
  options: { onQueued?: (videoId: string) => void } = {},
): UseVideoUploadResult {
  const [state, setState] = useState<VideoUploadState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  // Held in a ref so a caller passing a fresh arrow every render does not
  // change `upload`'s identity — the same mistake that re-armed the focus trap
  // on every keystroke in `overlay.tsx`.
  const onQueued = useRef(options.onQueued);
  onQueued.current = options.onQueued;

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState(IDLE);
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState((current) => ({ ...current, phase: 'idle', progress: 0 }));
  }, []);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      const problem = validateVideoFile(file);
      if (problem) {
        setState({ ...IDLE, phase: 'error', fileName: file.name, error: problem });
        return null;
      }

      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;

      setState({
        phase: 'preparing',
        progress: 0,
        fileName: file.name,
        sizeBytes: file.size,
        videoId: null,
        error: null,
        recovered: false,
      });

      const initBody = {
        lessonId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      };

      try {
        let init = await api.post<InitResponse>('videos/uploads/init', initBody, {
          signal: abort.signal,
        });

        // Kept even if a later step fails: the Video row exists from here on,
        // so the panel can still show what became of it.
        setState((current) => ({
          ...current,
          phase: 'uploading',
          videoId: init.videoId,
        }));

        let attempt = 0;
        let lastFailure: StorageUploadError | null = null;

        // The PUT, and the recovery around it.
        for (;;) {
          attempt += 1;

          let failure: StorageUploadError | null = null;
          try {
            await putToStorage(
              file,
              init,
              (progress) => setState((current) => ({ ...current, progress })),
              abort.signal,
            );
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            if (error instanceof StorageUploadError) failure = error;
            else throw error;
          }

          if (!failure) break;

          lastFailure = failure;

          // THE IMPORTANT QUESTION. The store may have committed the object and
          // then failed to answer - that is what Cloudflare R2's documented
          // `InternalError` looks like from here, and it is what happened in
          // production. Ask the API before asking the reader to send the file
          // again.
          setState((current) => ({ ...current, phase: 'checking', progress: 100 }));
          const probe = await probeStored(init.videoId, file.size, abort.signal);

          if (probe.stored === true) {
            // The bytes are there and the API has queued them. Nothing else to
            // do, and nobody has to send the file twice.
            setState((current) => ({ ...current, phase: 'queued', recovered: true }));
            onQueued.current?.(init.videoId);
            return init.videoId;
          }

          if (probe.stored === null) {
            // The API could not be reached, so nobody knows whether the file
            // landed. Guessing would either duplicate a 522 MB upload or lose
            // it, so the reader is told the truth and the file is not re-sent.
            throw new Error(
              'The upload did not finish and the server could not confirm whether the file arrived. ' +
                'Check the file, then use “Check whether the file arrived” before uploading again.',
            );
          }

          // The API says the file is NOT there. The upload genuinely failed.
          if (attempt >= MAX_UPLOAD_ATTEMPTS || !failure.retryable) break;

          if (failure.needsFreshSignature) {
            // The old signature was refused. A new one is required before the
            // next attempt, and it names a new object key, so the old one is
            // cleaned up when the upload finally completes.
            init = await api.post<InitResponse>('videos/uploads/init', initBody, {
              signal: abort.signal,
            });
          }

          setState((current) => ({ ...current, phase: 'uploading', progress: 0 }));
          await delay(RETRY_BASE_DELAY_MS * attempt);
        }

        // Every attempt failed and the API confirmed, each time, that nothing
        // was stored. Saying so is the difference between "try again" and
        // "try again, and this time it will work".
        if (lastFailure) {
          throw new StorageUploadError({
            message:
              `${lastFailure.message} The file was not saved, so it has to be uploaded again.`,
            status: lastFailure.status,
            retryable: false,
          });
        }

        setState((current) => ({ ...current, phase: 'finishing', progress: 100 }));

        // The API verifies the object is really in the bucket before queueing,
        // so a "successful" PUT that stored nothing fails here rather than
        // minutes later in the worker.
        await api.post<CompleteResponse>(
          `videos/${init.videoId}/complete`,
          { sizeBytes: file.size },
          { signal: abort.signal },
        );

        setState((current) => ({ ...current, phase: 'queued' }));
        onQueued.current?.(init.videoId);

        return init.videoId;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState(IDLE);
          return null;
        }

        setState((current) => ({
          ...current,
          phase: 'error',
          // An ApiError came from our own backend and `messageFor` knows how
          // to present it. Anything else came from `putToStorage`, which
          // writes its own readable messages — `messageFor` would flatten
          // those to "Something went wrong" and lose the CORS hint.
          error:
            error instanceof ApiError
              ? messageFor(error)
              : error instanceof Error
                ? error.message
                : messageFor(error),
        }));
        return null;
      } finally {
        controller.current = null;
      }
    },
    [lessonId],
  );

  return {
    ...state,
    upload,
    cancel,
    reset,
    isBusy:
      state.phase === 'preparing' ||
      state.phase === 'uploading' ||
      state.phase === 'finishing' ||
      state.phase === 'checking',
  };
}

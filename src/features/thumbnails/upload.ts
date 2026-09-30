'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Uploading a thumbnail.
 *
 * Deliberately a near-sibling of `features/library/upload.ts` rather than a
 * generalisation of it: that module encodes the library document's own
 * allow-list, its 200 MB ceiling and its filename rule, none of which apply to
 * a 10 MB image. Merging the two would have produced one hook with two sets of
 * validation and a flag to pick between them.
 *
 * What IS shared is the route shape. `POST /api/upload/<kind>-thumbnail`
 * attaches the session's token, streams the body to the API and returns the
 * object key the SERVER chose. A client never names a key.
 *
 * **Why not browser→R2 with a presigned PUT?** Thumbnails live in the media
 * bucket, which students read from and which has no CORS policy. A presigned
 * PUT is cross-origin, so it would need one — and opening up that bucket to
 * save a 200 KB image is a worse trade than streaming it through our own
 * origin. The backend's presigned routes still exist for anyone who configures
 * CORS later; this module does not depend on them.
 */

/** Exactly the allow-list the backend's `@IsIn(IMAGE_TYPES)` enforces. */
export const THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** The backend's `@Max(10 * 1024 * 1024)`. */
export const THUMBNAIL_MAX_BYTES = 10 * 1024 * 1024;

export type ThumbnailTarget =
  | { kind: 'course-part'; courseId: string; partId: string }
  | { kind: 'library-part'; materialId: string; partId: string }
  | { kind: 'library-default' };

/** The envelope the upload route replies with, success or failure. */
interface UploadResponse {
  success?: boolean;
  data?: { objectKey?: string; sizeBytes?: number };
  message?: string;
}

export type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';

export interface ThumbnailUploadState {
  phase: UploadPhase;
  progress: number;
  objectKey: string | null;
  fileName: string | null;
  error: string | null;
}

const IDLE: ThumbnailUploadState = {
  phase: 'idle',
  progress: 0,
  objectKey: null,
  fileName: null,
  error: null,
};

/** Rejects what the server would reject, before spending a round trip on it. */
export function validateThumbnail(file: File): string | null {
  if (!THUMBNAIL_TYPES.includes(file.type as (typeof THUMBNAIL_TYPES)[number])) {
    return 'Use a JPEG, PNG or WebP image.';
  }
  if (file.size > THUMBNAIL_MAX_BYTES) {
    return 'That image is larger than the 10 MB limit.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  return null;
}

function routeFor(target: ThumbnailTarget): { path: string; query: URLSearchParams } {
  switch (target.kind) {
    case 'course-part':
      return {
        path: '/api/upload/course-part-thumbnail',
        query: new URLSearchParams({ courseId: target.courseId, partId: target.partId }),
      };
    case 'library-part':
      return {
        path: '/api/upload/library-part-thumbnail',
        query: new URLSearchParams({
          materialId: target.materialId,
          partId: target.partId,
        }),
      };
    case 'library-default':
      return { path: '/api/upload/library-default-thumbnail', query: new URLSearchParams() };
  }
}

/**
 * `XMLHttpRequest` rather than `fetch`, for upload progress: `fetch` gives no
 * way to observe bytes sent. An image is quick, but on a slow connection
 * silence is indistinguishable from a hung tab.
 */
function postWithProgress(
  file: File,
  target: ThumbnailTarget,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<{ objectKey: string; sizeBytes: number }> {
  const { path, query } = routeFor(target);
  query.set('contentType', file.type);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${path}?${query.toString()}`, true);
    // The same header every mutating call through the proxy carries. The route
    // refuses without it, which is what stops a cross-site form posting here
    // on a signed-in admin's behalf.
    request.setRequestHeader('x-dashboard-request', '1');
    request.setRequestHeader('content-type', file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      // Named rather than `as typeof payload`: that narrows to the
      // initialiser's `null` and every field access below becomes an error.
      // features/library/upload.ts documents the same trap.
      let payload: UploadResponse | null = null;
      try {
        payload = JSON.parse(request.responseText) as UploadResponse;
      } catch {
        payload = null;
      }

      if (request.status >= 200 && request.status < 300 && payload?.data?.objectKey) {
        resolve({
          objectKey: payload.data.objectKey,
          sizeBytes: payload.data.sizeBytes ?? file.size,
        });
        return;
      }

      reject(new Error(payload?.message ?? `The upload was refused (${request.status}).`));
    };

    request.onerror = () =>
      reject(new Error('The upload could not reach the server. Check the connection.'));
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    request.ontimeout = () => reject(new Error('The upload timed out.'));

    signal.addEventListener('abort', () => request.abort(), { once: true });

    request.send(file);
  });
}

export interface UseThumbnailUploadResult extends ThumbnailUploadState {
  upload: (file: File) => Promise<void>;
  reset: () => void;
}

export function useThumbnailUpload(target: ThumbnailTarget): UseThumbnailUploadResult {
  const [state, setState] = useState<ThumbnailUploadState>(IDLE);
  const abort = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState(IDLE);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      const problem = validateThumbnail(file);
      if (problem) {
        setState({ ...IDLE, phase: 'error', fileName: file.name, error: problem });
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setState({ ...IDLE, phase: 'uploading', fileName: file.name });

      try {
        const stored = await postWithProgress(
          file,
          target,
          (progress) => setState((prev) => ({ ...prev, progress })),
          controller.signal,
        );
        setState({
          phase: 'done',
          progress: 100,
          objectKey: stored.objectKey,
          fileName: file.name,
          error: null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          ...IDLE,
          phase: 'error',
          fileName: file.name,
          error: error instanceof Error ? error.message : 'The upload failed.',
        });
      }
    },
    [target],
  );

  return { ...state, upload, reset };
}

'use client';

import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@/lib/errors';

/**
 * Uploading a library document.
 *
 * One step: `POST /api/upload/library-document` with the raw bytes. That route
 * attaches the session's access token and streams the body to the API, which
 * streams it on to the Library bucket. The server still chooses the object
 * key — a client cannot name one — and the key is the only thing that comes
 * back into the application, to be handed to
 * `POST /library/materials/:id/parts` as `objectKey`.
 *
 * **Why not browser→R2 with a presigned PUT?** That upload is cross-origin, so
 * it requires a CORS policy on the bucket; without one the preflight fails
 * before a byte moves, which is what produced "The upload could not reach
 * storage" on every attempt. Going through our own origin needs no CORS. The
 * backend's presigned route still exists and still works for anyone who
 * configures CORS later; this module simply does not depend on it.
 *
 * Nothing is buffered end to end — Next pipes to the API, the API pipes to
 * storage — so a large document costs a held connection rather than memory.
 *
 * **No permanent or public URL is ever produced:** the bucket is private and
 * students read a document through a separate viewer-bound signed URL.
 */

/** Exactly the allow-list the backend's `@IsIn` enforces. */
export const LIBRARY_UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** `@Max(200 * 1024 * 1024)` on `sizeBytes`. */
export const LIBRARY_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

/** The backend's `@Matches` on `filename`, copied rather than approximated. */
const FILENAME_PATTERN = /^[\w .()\-؀-ۿ]+\.[A-Za-z0-9]{1,8}$/;

/** What the upload route returns once the bytes are stored. */
export interface StoredUpload {
  objectKey: string;
  sizeBytes: number;
}

/** The envelope the upload route replies with, success or failure. */
interface UploadResponse {
  success?: boolean;
  data?: StoredUpload;
  message?: string;
}

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

export interface UploadState {
  phase: UploadPhase;
  /** 0–100, from real bytes sent rather than a fake animation. */
  progress: number;
  objectKey: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
}

const IDLE: UploadState = {
  phase: 'idle',
  progress: 0,
  objectKey: null,
  fileName: null,
  sizeBytes: null,
  error: null,
};

/**
 * Rejects what the server would reject, before spending a round trip on it.
 *
 * Returns a message rather than throwing, because every one of these is a
 * thing the person can fix by choosing a different file.
 */
export function validateLibraryFile(file: File): string | null {
  if (!LIBRARY_UPLOAD_TYPES.includes(file.type as (typeof LIBRARY_UPLOAD_TYPES)[number])) {
    return 'That file type is not accepted. Use a PDF, a Word or Excel document, or an image.';
  }

  if (file.size > LIBRARY_UPLOAD_MAX_BYTES) {
    return 'That file is larger than the 200 MB limit.';
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
 * Sends the bytes to our own upload route and reports progress.
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: upload progress. A
 * `fetch` gives no way to observe bytes sent, and a 200 MB upload with no
 * feedback is indistinguishable from a hung tab.
 *
 * `x-dashboard-request` is the same header every mutating call through the
 * proxy carries; the route refuses the request without it, which is what stops
 * a cross-site form from posting here on a signed-in admin's behalf.
 */
function postWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<StoredUpload> {
  const query = new URLSearchParams({
    filename: file.name,
    contentType: file.type,
  });

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/upload/library-document?${query.toString()}`, true);
    request.setRequestHeader('x-dashboard-request', '1');
    request.setRequestHeader('content-type', file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      // `typeof payload` here would narrow to the initialiser's `null`, so the
      // response shape is named once and referred to by name.
      let payload: UploadResponse | null = null;

      try {
        payload = JSON.parse(request.responseText) as UploadResponse;
      } catch {
        payload = null;
      }

      if (request.status >= 200 && request.status < 300 && payload?.data?.objectKey) {
        resolve(payload.data);
        return;
      }

      // The route returns the API's own message where it has one, so a
      // rejected file type or an oversized document reads as itself rather
      // than as a status code.
      reject(
        new Error(
          payload?.message ?? `The upload was refused (${request.status}).`,
        ),
      );
    };

    request.onerror = () =>
      reject(new Error('The upload could not reach the server. Check the connection.'));
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    request.ontimeout = () => reject(new Error('The upload timed out.'));

    signal.addEventListener('abort', () => request.abort(), { once: true });

    request.send(file);
  });
}

export interface UseLibraryUploadResult extends UploadState {
  upload: (file: File) => Promise<string | null>;
  cancel: () => void;
  reset: () => void;
  isBusy: boolean;
}

export function useLibraryUpload(): UseLibraryUploadResult {
  const [state, setState] = useState<UploadState>(IDLE);
  const controller = useRef<AbortController | null>(null);

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

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const problem = validateLibraryFile(file);
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
      objectKey: null,
      fileName: file.name,
      sizeBytes: file.size,
      error: null,
    });

    try {
      setState((current) => ({ ...current, phase: 'uploading' }));

      const stored = await postWithProgress(
        file,
        (progress) => setState((current) => ({ ...current, progress })),
        abort.signal,
      );

      setState((current) => ({
        ...current,
        phase: 'done',
        progress: 100,
        objectKey: stored.objectKey,
      }));

      return stored.objectKey;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState(IDLE);
        return null;
      }

      // An ApiError came from our own backend and carries a usable message;
      // anything else is a transport failure and does not.
      const message =
        error instanceof ApiError
          ? (error.fields
              ? Object.values(error.fields).flat().join(' ')
              : error.message)
          : error instanceof Error
            ? error.message
            : 'The upload failed.';

      setState((current) => ({
        ...current,
        phase: 'error',
        error: message,
      }));
      return null;
    } finally {
      controller.current = null;
    }
  }, []);

  return {
    ...state,
    upload,
    cancel,
    reset,
    isBusy: state.phase === 'preparing' || state.phase === 'uploading',
  };
}

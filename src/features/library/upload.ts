'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';

/**
 * Uploading a library document.
 *
 * Two steps, and the shape of them is the backend's, not this module's:
 *
 *   1. `POST storage/uploads/library-document` → `{ uploadUrl, objectKey,
 *      expiresIn, requiredHeaders }`. The server chooses the key; a client
 *      cannot name one.
 *   2. `PUT` the bytes straight to `uploadUrl`, replaying `requiredHeaders`
 *      exactly. A single presigned PUT — there is no multipart API, and no
 *      confirm step for this bucket.
 *
 * **Step 2 does not go through the dashboard proxy.** It is a cross-origin PUT
 * to object storage against a signature that covers the method, the key and
 * the Content-Type. Routing a 200 MB file through Next would tie up a worker
 * for the duration and gains nothing.
 *
 * The object key is the only thing that comes back into the application, and
 * it is handed to `POST /admin/library/materials/:id/parts` (or a PATCH) as
 * `objectKey`. **No permanent or public URL is ever produced:** the bucket is
 * private, `uploadUrl` is a short-lived write-only signature, and students
 * read a document through a separate viewer-bound signed URL.
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

export interface SignedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  requiredHeaders: Record<string, string>;
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
 * Puts the bytes on storage and reports progress.
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: upload progress. A
 * `fetch` gives no way to observe bytes sent, and a 200 MB upload with no
 * feedback is indistinguishable from a hung tab.
 */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url, true);

    // Replayed exactly. The signature covers them, so an extra or a missing
    // header is a 403 from storage rather than a validation message.
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Storage refused the upload (${request.status}).`));
    };

    request.onerror = () =>
      reject(new Error('The upload could not reach storage. Check the connection.'));
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
      const signed = await api.post<SignedUpload>('storage/uploads/library-document', {
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });

      setState((current) => ({ ...current, phase: 'uploading' }));

      await putWithProgress(
        signed.uploadUrl,
        file,
        signed.requiredHeaders,
        (progress) => setState((current) => ({ ...current, progress })),
        abort.signal,
      );

      setState((current) => ({
        ...current,
        phase: 'done',
        progress: 100,
        objectKey: signed.objectKey,
      }));

      return signed.objectKey;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState(IDLE);
        return null;
      }

      // An ApiError came from our own backend and carries a usable message;
      // anything else came from storage and does not.
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

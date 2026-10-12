'use client';

import { useCallback, useRef, useState } from 'react';

import { putToStorage, unwrapUpload } from '@/features/uploads/direct-upload';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';

/**
 * Uploading a library document.
 *
 * Three steps: ask the API to authorise the upload (`POST
 * storage/uploads/library-document`), PUT the bytes straight at the presigned
 * URL it returns, then hand the returned key to
 * `POST /library/materials/:id/parts`. The server chooses the object key — a
 * client cannot name one — and only the key crosses back into the application.
 *
 * **These bytes used to be POSTed to `/api/upload/library-document`.** That
 * route is a Vercel Function, and Vercel caps a Function request body at 4.5 MB
 * and answers `413 FUNCTION_PAYLOAD_TOO_LARGE`. Any Library document above that
 * failed without the API ever seeing it, which is why the 200 MB limit did not
 * help. Going direct removes the Function from the data path entirely; only
 * JSON still crosses it, and JSON is small.
 *
 * This module previously documented why browser→storage was *not* used: the
 * cross-origin preflight needs a CORS rule on the Library bucket, and without
 * one every attempt failed with "The upload could not reach storage". That is
 * still true — the route is only correct once **the CORS rule exists** (see
 * `edu-backend/docs/r2-cors.json`, which must be applied to the Library
 * bucket). The code is now in place for it; the bucket configuration is the
 * remaining deployment step, not a code change.
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

/**
 * What the upload yields once the bytes are stored.
 *
 * Only the object key: the size that gets registered is measured by the API
 * from the stored object, so carrying one here would imply it is trusted.
 */
export interface StoredUpload {
  objectKey: string;
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
      // Authorise the upload. JSON only, so the 4.5 MB Function limit does not
      // apply, and the key that comes back is the server's.
      const signed = unwrapUpload(
        await api.post(
          'storage/uploads/library-document',
          {
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          },
          { signal: abort.signal },
        ),
      );

      if (!signed) {
        throw new Error('The upload could not be authorised. Please try again.');
      }

      setState((current) => ({ ...current, phase: 'uploading' }));

      // The bytes, straight to storage.
      await putToStorage(
        file,
        signed,
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

/**
 * Direct-to-storage document upload.
 *
 * WHY THIS EXISTS
 * ---------------
 * Documents used to be POSTed to `/api/upload/attachment` (and
 * `/api/upload/library-document`), which streamed them through a Vercel
 * Function to the API. Vercel caps a Function request body at 4.5 MB and
 * answers `413 FUNCTION_PAYLOAD_TOO_LARGE`, so a 9 MB lecture PDF failed before
 * a single byte reached the backend — raising the API's 200 MB limit could not
 * help, because the request never arrived.
 *
 * So the bytes go browser -> R2 directly, over a short-lived presigned PUT that
 * the API issues. Only JSON crosses the Vercel Function, and JSON is small.
 * This is the same shape `features/videos/upload.ts` already uses for 8 GB
 * videos, so the code follows a path that is known to work against this R2
 * account rather than inventing a second one.
 *
 * The flow is the same three steps the API already documents:
 *
 *   1. `presignPath` — POST the declared size, get `{uploadUrl, objectKey,
 *      requiredHeaders}` back. The key is the SERVER's, never the client's.
 *   2. `putToStorage` — PUT the bytes at that URL with exactly the headers the
 *      signature covers, and nothing else.
 *   3. Register, via the caller's own endpoint. The API measures the stored
 *      object and enforces the 200 MB ceiling; the declared size above is only
 *      used to refuse hopeless requests early.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not enforce the size limit at upload time. R2 ignores
 * `x-amz-content-length-range`, so a client can still PUT an oversized object
 * using a signature it was honestly issued. Step 3 is what rejects it, and it
 * is the same check that was already added to registration.
 */

/** The shape `presignUpload()` returns on every storage endpoint. */
export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  /** Replayed verbatim; anything extra is outside the signature and is refused. */
  requiredHeaders: Record<string, string>;
}

/**
 * The PUT itself.
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: upload progress. A
 * `fetch` gives no way to observe bytes sent, and a multi-hundred-megabyte
 * upload with no feedback is indistinguishable from a hung tab.
 *
 * The `File` is streamed from disk by the browser and never held in JS memory.
 */
export function putToStorage(
  file: File,
  upload: PresignedUpload,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', upload.uploadUrl, true);

    // Only the headers the signature covers. An extra header invalidates it.
    for (const [name, value] of Object.entries(upload.requiredHeaders)) {
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

      // R2 answers with an XML error document; showing it verbatim is noise, so
      // the status carries the meaning and the likely causes are named.
      reject(
        new Error(
          request.status === 403
            ? 'Storage refused the upload. The signature may have expired — try again.'
            : `Storage refused the upload (${request.status}).`,
        ),
      );
    };

    // A failed CORS preflight arrives here with no status at all, which is the
    // single most likely cause, so it is named explicitly.
    request.onerror = () =>
      reject(
        new Error(
          'The upload could not reach storage. Check the connection, or the bucket’s CORS rule for this site.',
        ),
      );
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    request.ontimeout = () => reject(new Error('The upload timed out.'));

    signal.addEventListener('abort', () => request.abort(), { once: true });

    request.send(file);
  });
}

/** Unwraps the API's `{ success, data }` envelope from the JSON proxy. */
export function unwrapUpload(data: unknown): PresignedUpload | null {
  const payload = data as PresignedUpload | null;
  return payload && typeof payload.uploadUrl === 'string' ? payload : null;
}
'use client';

import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { formatBytes } from '@/lib/format';

import { LIBRARY_UPLOAD_TYPES, type UseLibraryUploadResult } from './upload';

/**
 * Choosing the file a library document is sold as.
 *
 * Replaces the object key an administrator used to paste in by hand — which
 * was never something anyone would get right twice, since the key is generated
 * by the server and only ever appears in a response nobody reads.
 *
 * The control reports four states, because a 200 MB upload spends real time in
 * three of them: choosing, preparing the signature, sending bytes, and done.
 * Progress is measured from bytes actually sent, so it stalls when the network
 * stalls rather than reassuring the reader with an animation.
 */
export function DocumentUploadField({
  upload,
  required,
  hasExistingDocument,
  error,
}: {
  upload: UseLibraryUploadResult;
  required?: boolean;
  /** Editing a part that already has a file attached. */
  hasExistingDocument?: boolean;
  error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);

  const pick = () => input.current?.click();

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice after a failure still fires.
    event.target.value = '';
    if (file) void upload.upload(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-foreground">
        Document
        {required ? (
          <>
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </p>

      <input
        ref={input}
        type="file"
        className="sr-only"
        accept={LIBRARY_UPLOAD_TYPES.join(',')}
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="rounded-lg border border-border p-3">
        {upload.phase === 'idle' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {hasExistingDocument
                  ? 'A file is already attached.'
                  : 'No file chosen yet.'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {hasExistingDocument
                  ? 'Choosing a new one replaces it for everyone who opens this document.'
                  : 'PDF, Word, Excel or an image. Up to 200 MB.'}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={pick}>
              {hasExistingDocument ? 'Replace file' : 'Choose file'}
            </Button>
          </div>
        ) : null}

        {upload.phase === 'preparing' || upload.phase === 'uploading' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-foreground">{upload.fileName}</p>
              <Button type="button" variant="ghost" size="sm" onClick={upload.cancel}>
                Cancel
              </Button>
            </div>

            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
              role="progressbar"
              aria-valuenow={upload.phase === 'uploading' ? upload.progress : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{
                  width:
                    upload.phase === 'preparing' ? '4%' : `${Math.max(upload.progress, 2)}%`,
                }}
              />
            </div>

            <p className="text-xs text-muted" aria-live="polite">
              {upload.phase === 'preparing'
                ? 'Preparing the upload…'
                : `Uploading — ${upload.progress}%${
                    upload.sizeBytes ? ` of ${formatBytes(upload.sizeBytes)}` : ''
                  }`}
            </p>
          </div>
        ) : null}

        {upload.phase === 'done' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="success">Uploaded</Badge>
                <p className="min-w-0 truncate text-sm text-foreground">
                  {upload.fileName}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {upload.sizeBytes ? formatBytes(upload.sizeBytes) : null}
                {upload.sizeBytes ? ' · ' : ''}
                Saved when you save the document.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={pick}>
              Choose another
            </Button>
          </div>
        ) : null}

        {upload.phase === 'error' ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-medium text-danger">
              {upload.error}
            </p>
            {upload.fileName ? (
              <p className="truncate text-xs text-muted">{upload.fileName}</p>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={pick}>
              Choose another file
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

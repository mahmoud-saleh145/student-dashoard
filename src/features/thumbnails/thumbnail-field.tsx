'use client';

import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';

import {
  THUMBNAIL_TYPES,
  type UseThumbnailUploadResult,
} from './upload';

/**
 * Choosing a thumbnail.
 *
 * The control has to make one distinction unmistakable, because getting it
 * wrong is how an administrator loses work: an image chosen HERE is this
 * item's own, and an item with none INHERITS one rather than having none. So
 * the empty state names what will be shown instead — the course's thumbnail,
 * the material's cover, the library default — rather than saying "none".
 *
 * `inheritedFrom` is that label. It is the caller's job to know it, because
 * only the caller knows where in the fallback chain this field sits.
 */
export function ThumbnailField({
  upload,
  label = 'Thumbnail',
  currentUrl,
  inheritedFrom,
  onClear,
  disabledReason,
}: {
  upload: UseThumbnailUploadResult;
  label?: string;
  /** The image in force today, own or inherited. */
  currentUrl?: string | null;
  /** What is shown when this item has no thumbnail of its own. */
  inheritedFrom?: string;
  /** Omitted when clearing makes no sense (the platform default itself). */
  onClear?: () => void;
  /** Set when the target does not exist yet, e.g. an unsaved part. */
  disabledReason?: string;
}) {
  const chosen = upload.phase === 'done' && upload.objectKey !== null;

  /**
   * The picker is created on demand rather than rendered as a hidden input.
   *
   * Two reasons, and the second is the load-bearing one. A hidden input that
   * is only ever clicked programmatically contributes nothing to the rendered
   * document but its own presence — and its presence is not free: this field
   * sits inside dialogs that already contain a file input of their own (the
   * library document, for one). A second persistent `input[type="file"]` makes
   * "the file input in this dialog" ambiguous for anything selecting by role
   * or type, which is exactly how a test that was precise yesterday starts
   * matching two elements today. Creating the element for the duration of the
   * pick keeps the DOM honest: at rest there is one file input in the dialog,
   * because there is one file the dialog is about.
   */
  const pick = useCallback(() => {
    const element = document.createElement('input');
    element.type = 'file';
    element.accept = THUMBNAIL_TYPES.join(',');
    element.addEventListener(
      'change',
      () => {
        const file = element.files?.[0];
        if (file) void upload.upload(file);
      },
      { once: true },
    );
    element.click();
  }, [upload]);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>

      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-alt">
          {currentUrl ? (
            /* A signed storage URL is not a statically known asset, so
               next/image's optimiser cannot be pointed at it without
               proxying every thumbnail through this app. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xs text-subtle">No image</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {upload.phase === 'uploading' ? (
            <>
              <p className="text-sm text-foreground">Uploading {upload.fileName}…</p>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-alt"
                role="progressbar"
                aria-valuenow={upload.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </>
          ) : upload.phase === 'error' ? (
            <p className="text-sm text-danger" role="alert">
              {upload.error}
            </p>
          ) : chosen ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Uploaded</Badge>
              <span className="truncate text-sm text-muted">{upload.fileName}</span>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {inheritedFrom
                ? `Using ${inheritedFrom}. Upload an image to give this one its own.`
                : 'No image set.'}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(disabledReason) || upload.phase === 'uploading'}
              onClick={pick}
            >
              {chosen || currentUrl ? 'Replace image' : 'Upload image'}
            </Button>

            {onClear && !chosen && currentUrl ? (
              <Button size="sm" variant="ghost" onClick={onClear}>
                Clear
              </Button>
            ) : null}

            {chosen ? (
              <Button size="sm" variant="ghost" onClick={upload.reset}>
                Undo
              </Button>
            ) : null}
          </div>

          {disabledReason ? (
            <p className="mt-1.5 text-xs text-muted">{disabledReason}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

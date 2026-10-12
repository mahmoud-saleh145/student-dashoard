'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Switch, TextInput } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCreateAttachment,
  useDeleteAttachment,
  useLessonAttachments,
  useSectionAttachments,
  useUpdateAttachment,
} from '@/features/courses/hooks';
import { putToStorage, unwrapUpload } from '@/features/uploads/direct-upload';
import { api } from '@/lib/api-client';
import { formatBytes } from '@/lib/format';
import type { AttachmentKind, AttachmentRow } from '@/types/domain';

/**
 * Documents on a lecture, or on a section as a whole.
 *
 * One component for both scopes, because the management is identical and the
 * only difference is which id the row is created with — duplicating it would
 * have meant fixing the "protected files are never downloadable" rule twice.
 *
 * The bytes go browser → storage directly, over a presigned PUT the API issues
 * (see `features/uploads/direct-upload.ts`). They used to be POSTed to
 * `/api/upload/attachment`, which Vercel rejects above 4.5 MB with
 * `413 FUNCTION_PAYLOAD_TOO_LARGE` — a 9 MB PDF never reached the API at all.
 *
 * The dashboard still never sees a storage URL and offers nowhere to type one:
 * the key it registers is the server's, minted when the upload was authorised.
 */

const ACCEPT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
].join(',');

const MAX_BYTES = 200 * 1024 * 1024;

function kindFor(mimeType: string): AttachmentKind {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.includes('spreadsheet') || mimeType.includes('ms-excel')) return 'SHEET';
  if (mimeType.includes('word')) return 'DOC';
  return 'OTHER';
}

export type AttachmentScope =
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'section'; sectionId: string };

export function AttachmentsPanel({
  courseId,
  scope,
}: {
  courseId: string;
  scope: AttachmentScope;
}) {
  const lessonList = useLessonAttachments(scope.kind === 'lesson' ? scope.lessonId : null);
  const sectionList = useSectionAttachments(scope.kind === 'section' ? scope.sectionId : null);
  const list = scope.kind === 'lesson' ? lessonList : sectionList;

  const create = useCreateAttachment();
  const remove = useDeleteAttachment();
  const update = useUpdateAttachment();
  const toast = useToast();

  const fileInput = useRef<HTMLInputElement>(null);
  // Lets a second attempt cancel the first, so two PUTs cannot race for one
  // panel's UI state.
  const inFlight = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isProtected, setIsProtected] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);

  const rows = list.data ?? [];
  const noun = scope.kind === 'lesson' ? 'lecture' : 'section';

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('File too large', `The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }

    setUploading(true);
    inFlight.current?.abort();
    const abort = new AbortController();
    inFlight.current = abort;
    try {
      // 1. Ask the API to authorise this exact upload. It authenticates and
      //    authorises the caller, validates the filename and content type, and
      //    returns a key it chose itself. Only JSON goes over this request, so
      //    the 4.5 MB Function limit is irrelevant here.
      const signed = unwrapUpload(
        await api.post(
          'storage/uploads/attachment',
          {
            courseId,
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          },
          { signal: abort.signal },
        ),
      );

      if (!signed) {
        throw new Error('The upload could not be authorised. Please try again.');
      }

      // 2. The bytes, straight to storage.
      await putToStorage(
        file,
        signed,
        (percent) => setProgress(percent),
        abort.signal,
      );
      setProgress(100);

      // 3. Register. The API measures what actually landed and enforces the
      //    200 MB ceiling itself, so a successful PUT is not yet a document —
      //    and an oversized one is refused HERE, not silently accepted.
      await create.mutateAsync({
        courseId,
        ...(scope.kind === 'lesson'
          ? { lessonId: scope.lessonId }
          : { sectionId: scope.sectionId }),
        title: title.trim() || file.name,
        kind: kindFor(file.type),
        objectKey: signed.objectKey,
        mimeType: file.type || undefined,
        // Declared only for the early client-side check above. The API measures
        // the stored object and persists that instead, so this is never
        // authoritative — see `AttachmentsService.create`.
        sizeBytes: file.size,
        isProtected,
        isPreview,
      });

      toast.success('Document added');
      setTitle('');
      setIsPreview(false);
      setIsProtected(true);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upload failed');
    } finally {
      inFlight.current = null;
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`attachments-${scope.kind}`}>
      {list.isLoading ? (
        <p className="text-xs text-muted">Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted">
          No documents on this {noun} yet.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{row.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone="neutral">{row.kind}</Badge>
                  {row.sizeBytes === null ? null : <span>{formatBytes(row.sizeBytes)}</span>}
                  {row.isPreview ? <Badge tone="info">Free sample</Badge> : null}
                  {row.isProtected ? (
                    <Badge tone="success">Protected</Badge>
                  ) : row.isDownloadable ? (
                    <Badge tone="warning">Downloadable</Badge>
                  ) : null}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                aria-label={`${row.isPreview ? 'Require access for' : 'Make a free sample of'} ${row.title}`}
                onClick={() => {
                  void update
                    .mutateAsync({ id: row.id, isPreview: !row.isPreview })
                    .catch((error: unknown) => toast.error(error));
                }}
              >
                {row.isPreview ? 'Require access' : 'Free sample'}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${row.title}`}
                onClick={() => setPendingDelete(row)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
        <Field label="Title" hint="Optional — the file name is used if you leave it empty.">
          {({ id }) => (
            <TextInput
              id={id}
              value={title}
              placeholder="e.g. Problem sheet 3"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>

        <Switch
          checked={isProtected}
          onChange={(next) => {
            setIsProtected(next);
            // Protection and downloading contradict each other and the API
            // resolves it in protection's favour. Reflecting that here means
            // the switch never shows a state the server will not honour.
            if (next) setIsPreview(isPreview);
          }}
          label="Protected"
          description={
            isProtected
              ? 'Opened through a signed, per-viewer link and never downloadable. Device-bound, like video.'
              : 'Students can download and keep this file. Use it for handouts you are happy to see shared.'
          }
        />

        <Switch
          checked={isPreview}
          onChange={setIsPreview}
          label="Free sample"
          description={
            isPreview
              ? 'Readable without owning the course or this part.'
              : `Only students who own this ${scope.kind === 'section' ? 'section’s part' : 'course or its part'} can open it.`
          }
        />

        <div>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label={`Choose a document for this ${noun}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            size="sm"
            loading={uploading || create.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? `Uploading… ${progress}%` : 'Add document'}
          </Button>
          {/* Progress from bytes actually sent, not an animation. The previous
              flow streamed through a Function and showed only a spinner, which
              is indistinguishable from a hang across a 200 MB upload. */}
          {uploading ? (
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-28 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this document?"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will be removed from this ${noun} and deleted from storage. Students lose access immediately. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        variant="danger"
        busy={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void remove
            .mutateAsync({ id: pendingDelete.id })
            .then(() => {
              toast.success('Document removed');
              setPendingDelete(null);
            })
            .catch((error: unknown) => toast.error(error));
        }}
      />
    </div>
  );
}

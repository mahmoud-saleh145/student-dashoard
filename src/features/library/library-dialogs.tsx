'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, Switch, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useSubjects } from '@/features/catalog/hooks';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import type {
  LibraryMaterialDetail,
  LibraryPackageRow,
  LibraryPartRow,
} from '@/types/commerce';

import { ThumbnailField } from '@/features/thumbnails/thumbnail-field';
import { useThumbnailUpload } from '@/features/thumbnails/upload';

import {
  EMPTY_AUDIENCE,
  audienceDiff,
  audienceFromMaterial,
  audienceServerErrors,
  checkAudience,
  createMaterialBody,
  describeFieldErrors,
  packageMembership,
  packagePartIds,
  packagePartIdsForUpdate,
  packageRemovals,
  summarizeDraft,
  summarizeSaved,
  updateMaterialBody,
  type AudienceDraft,
  type MaterialScalars,
} from './audience';
import { DocumentUploadField } from './document-upload-field';
import {
  useCreateLibraryPackage,
  useCreateLibraryPart,
  useCreateMaterial,
  useUpdateLibraryPackage,
  useUpdateLibraryPart,
  useLibraryAudienceData,
  useUpdateMaterial,
} from './hooks';
import { LibraryAudienceEditor } from './library-audience-editor';
import { useLibraryUpload } from './upload';

/**
 * Library authoring dialogs.
 *
 * All three share one rule worth stating once: **price is in EGP and is spent
 * as wallet credit**. Nothing in the Library is bought with an access code,
 * and nothing in a course is bought with credit. The two systems meet nowhere,
 * including here.
 */

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

export function MaterialDialog({
  open,
  onClose,
  material,
}: {
  open: boolean;
  onClose: () => void;
  /** Null when creating. */
  material: LibraryMaterialDetail | null;
}) {
  const toast = useToast();
  const create = useCreateMaterial();
  const update = useUpdateMaterial(material?.id ?? '');
  const subjects = useSubjects();

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [audience, setAudience] = useState<AudienceDraft>(EMPTY_AUDIENCE);
  // An audience change on an existing material is applied only after the
  // administrator has seen the old and the new side by side.
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  const saved = useMemo(() => audienceFromMaterial(material), [material]);
  const data = useLibraryAudienceData(audience);

  // The cover. Edit-only, like the course image: the upload route files the
  // object under the material's id, which does not exist until it is saved.
  const cover = useThumbnailUpload({
    kind: 'library-cover',
    materialId: material?.id ?? 'unsaved',
  });
  const [clearCover, setClearCover] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(material?.title ?? '');
    setTitleAr(material?.titleAr ?? '');
    setDescription(material?.description ?? '');
    setSubjectId(material?.subjectId ?? '');
    setAudience(audienceFromMaterial(material));
    setStep('edit');
    cover.reset();
    setClearCover(false);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, material?.id]);

  const pending = create.isPending || update.isPending || cover.phase === 'uploading';
  const mutationError = create.error ?? update.error;
  const errors = fieldErrors(mutationError);

  const scalars = { title, titleAr, description, subjectId };
  const edit = material
    ? updateMaterialBody(scalars, audience, saved, material.subjectId)
    : null;
  // Omitted leaves the cover alone; a new key replaces it; null removes it.
  // The backend deletes the previous object once the row has moved.
  const coverPatch = cover.objectKey
    ? { coverKey: cover.objectKey }
    : clearCover
      ? { coverKey: null }
      : {};
  // Creating always sends the audience; editing sends it only when it moved.
  const sendsAudience = !material || Boolean(edit?.audienceChanged);

  const check = checkAudience(audience, {
    universities: data.universities.data,
    faculties: data.faculties.data,
    departments: data.departments.data,
    ladder: data.ladder,
  });
  // The server's word wins over the form's guess for the field it names.
  const audienceErrors = { ...check.errors, ...audienceServerErrors(errors) };
  const audienceBlocked =
    sendsAudience && (Object.keys(check.errors).length > 0 || check.pending);

  const legacyAudience = Boolean(material) && (!saved.universityId || !saved.facultyId);

  function changeAudience(next: AudienceDraft) {
    setAudience(next);
    // A refusal described the audience that was posted, not this one.
    if (create.error) create.reset();
    if (update.error) update.reset();
  }

  async function save() {
    try {
      if (material && edit) await update.mutateAsync({ ...edit.body, ...coverPatch });
      else await create.mutateAsync(createMaterialBody(scalars, audience));

      toast.success(
        material ? 'Material updated' : 'Material created',
        material && edit?.audienceChanged ? 'The new audience is in force.' : undefined,
      );
      onClose();
    } catch (error) {
      // Back to the form, where the field the server named is highlighted.
      setStep('edit');
      toast.error(error, 'The material was not saved');
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (audienceBlocked) return;
    if (material && edit?.audienceChanged && step === 'edit') {
      setStep('confirm');
      return;
    }
    void save();
  };

  const diff =
    material && step === 'confirm'
      ? audienceDiff(
          material.audience
            ? summarizeSaved(material.audience)
            : summarizeDraft(saved, lookupOf(data)),
          summarizeDraft(audience, lookupOf(data)),
        )
      : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        step === 'confirm'
          ? 'Change who can see this material?'
          : material
            ? 'Edit material'
            : 'New library material'
      }
      description={
        step === 'confirm'
          ? undefined
          : 'A publication — sold as its individual documents, or as packages of them.'
      }
      size="lg"
      busy={pending}
      footer={
        step === 'confirm' ? (
          <>
            <Button variant="secondary" onClick={() => setStep('edit')} disabled={pending}>
              Back
            </Button>
            <Button onClick={() => void save()} loading={pending}>
              Apply audience change
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="material-form"
              loading={pending}
              disabled={title.trim().length < 2 || audienceBlocked}
            >
              {material
                ? edit?.audienceChanged
                  ? 'Review changes'
                  : 'Save changes'
                : 'Create material'}
            </Button>
          </>
        )
      }
    >
      {step === 'confirm' && material ? (
        <AudienceChangeReview
          rows={diff}
          published={material.status === 'PUBLISHED'}
          otherChanges={scalarsChanged(material, scalars)}
        />
      ) : (
        <form id="material-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Physics Revision Papers"
                />
              )}
            </Field>

            <Field label="Title (Arabic)" error={errors.titleAr}>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  dir="rtl"
                  value={titleAr}
                  onChange={(event) => setTitleAr(event.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Description" error={errors.description}>
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Subject"
            hint={material?.subjectId ? 'Choose “No subject” to clear it.' : undefined}
            error={errors.subjectId}
          >
            {({ id }) => (
              <Select
                id={id}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                placeholder="No subject"
                options={[
                  ...(subjects.data ?? []).map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                  // A saved subject that is no longer listed stays visible as
                  // what it is, instead of reading as "No subject".
                  ...(subjectId &&
                  subjects.data &&
                  !subjects.data.some((item) => item.id === subjectId)
                    ? [
                        {
                          value: subjectId,
                          label: 'Current subject (no longer active)',
                          disabled: true,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </Field>

          {/* Cover. Edit-only: the upload route files the image under the
              material's id, which a material being created does not have yet. */}
          <ThumbnailField
            upload={cover}
            label="Cover image"
            currentUrl={clearCover ? null : (material?.coverUrl ?? null)}
            inheritedFrom={
              material?.hasCover || material?.coverUrl
                ? undefined
                : 'the library default for its documents'
            }
            onClear={
              material?.coverUrl && !clearCover
                ? () => {
                    setClearCover(true);
                    cover.reset();
                  }
                : undefined
            }
            disabledReason={
              material ? undefined : 'Create the material first, then add its cover image.'
            }
          />

          {legacyAudience ? (
            <p role="note" className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-warning">
              This material was created before an audience was required. Set its university and
              college — it cannot be published until it has one.
            </p>
          ) : null}

          <LibraryAudienceEditor
            value={audience}
            onChange={changeAudience}
            data={data}
            errors={audienceErrors}
            saved={material?.audience ?? null}
            disabled={pending}
          />

          {material && !edit?.audienceChanged && Object.keys(check.errors).length > 0 ? (
            <p className="text-xs text-muted">
              The saved audience needs attention, but saving other changes leaves it as it is.
              Fix it before publishing.
            </p>
          ) : null}

          {mutationError && Object.keys(errors).length === 0 ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {messageFor(mutationError)}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

function lookupOf(data: ReturnType<typeof useLibraryAudienceData>) {
  return {
    universities: data.universities.data,
    faculties: data.faculties.data,
    departments: data.departments.data,
    ladder: data.ladder,
  };
}

function scalarsChanged(material: LibraryMaterialDetail, scalars: MaterialScalars): boolean {
  return (
    scalars.title !== material.title ||
    scalars.titleAr !== (material.titleAr ?? '') ||
    scalars.description !== (material.description ?? '') ||
    scalars.subjectId !== (material.subjectId ?? '')
  );
}

/**
 * The old-versus-new confirmation.
 *
 * States the one thing an administrator most needs to know before narrowing an
 * audience: it does not take anything away from anyone who already paid.
 * Entitlements are per part and survive any audience change; the backend's
 * audit entry for the update records the previous and the new audience.
 */
function AudienceChangeReview({
  rows,
  published,
  otherChanges,
}: {
  rows: ReturnType<typeof audienceDiff>;
  published: boolean;
  otherChanges: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="audience-change-review">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Audience before and after this change</caption>
          <thead className="bg-surface-alt text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                &nbsp;
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                Now
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                After this change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-t border-border"
                data-changed={row.changed ? 'true' : 'false'}
              >
                <th scope="row" className="px-3 py-2 text-start font-medium text-foreground">
                  {row.label}
                </th>
                <td className="px-3 py-2 text-muted">{row.before}</td>
                <td className="px-3 py-2">
                  <span
                    className={row.changed ? 'font-semibold text-foreground' : 'text-muted'}
                  >
                    {row.after}
                  </span>
                  {row.changed ? (
                    <Badge tone="warning" className="ms-2">
                      changed
                    </Badge>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
        <li>
          <strong className="text-foreground">Existing purchases are not revoked.</strong>{' '}
          Students who already bought a document keep reading it, even if they fall outside the
          new audience. They cannot buy more from this material while outside it.
        </li>
        <li>
          {published
            ? 'This material is published, so the student library changes as soon as you apply this.'
            : 'This material is not published, so no student sees it yet either way.'}
        </li>
        <li>The previous and the new audience are recorded in the admin audit log.</li>
        {otherChanges ? <li>Your other edits to this material are saved with it.</li> : null}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document (library part)
// ---------------------------------------------------------------------------

/**
 * One sellable document.
 *
 * Two things the form is deliberate about:
 *
 *  - **A zero price is not free.** The purchase path refuses it, because a
 *    free-by-accident document is indistinguishable from a pricing mistake.
 *    Free content is published with the preview switch instead, which needs no
 *    purchase at all.
 *  - **The object key is an upload key, never a URL.** The key is never sent
 *    back to any client, so editing a document means supplying a new key.
 */
export function LibraryPartDialog({
  open,
  onClose,
  materialId,
  part,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  part: LibraryPartRow | null;
}) {
  const toast = useToast();
  const create = useCreateLibraryPart(materialId);
  const update = useUpdateLibraryPart();

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [isPreview, setIsPreview] = useState(false);

  // The object key comes from the upload, never from a person typing one.
  const upload = useLibraryUpload();

  // Edit-only, like the course-part thumbnail: the route is keyed on the part
  // id, which does not exist until the part is saved.
  const thumbnail = useThumbnailUpload({
    kind: 'library-part',
    materialId,
    partId: part?.id ?? 'unsaved',
  });
  const [clearThumbnail, setClearThumbnail] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(part?.title ?? '');
    setTitleAr(part?.titleAr ?? '');
    setDescription(part?.description ?? '');
    setPrice(part?.price != null ? String(part.price) : '');
    setPageCount(part?.pageCount != null ? String(part.pageCount) : '');
    setIsPreview(part?.isPreview ?? false);
    upload.reset();
    thumbnail.reset();
    setClearThumbnail(false);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part?.id]);

  const pending = create.isPending || update.isPending || upload.isBusy;
  const errors = fieldErrors(create.error ?? update.error);
  const priceValue = Number(price);
  const zeroPriced = !isPreview && price !== '' && priceValue === 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (part) {
        await update.mutateAsync({
          partId: part.id,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: price !== '' ? priceValue : undefined,
          isPreview,
          // Absent when no new file was chosen, which is what keeps the
          // current file attached on an edit that only changes the price.
          objectKey: upload.objectKey ?? undefined,
          pageCount: pageCount !== '' ? Number(pageCount) : undefined,
          // Omitted leaves the image alone; null clears it back to inheriting
          // the material's cover and then the library default. The default is
          // resolved when the part is read, so clearing here never writes it
          // onto the row.
          ...(thumbnail.objectKey
            ? { thumbnailKey: thumbnail.objectKey }
            : clearThumbnail
              ? { thumbnailKey: null }
              : {}),
        });
      } else {
        await create.mutateAsync({
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          objectKey: upload.objectKey as string,
          sizeBytes: upload.sizeBytes ?? undefined,
          pageCount: pageCount !== '' ? Number(pageCount) : undefined,
          isPreview,
        });
      }

      toast.success(part ? 'Document updated' : 'Document added');
      onClose();
    } catch (error) {
      toast.error(error, 'The document was not saved');
    }
  };

  // Creating needs a file; editing keeps the one already attached unless a
  // new upload replaced it. Either way an upload in flight blocks the save,
  // so a part can never be created pointing at a key that is still uploading.
  const valid =
    title.trim().length >= 2 &&
    !upload.isBusy &&
    (part ? true : Boolean(upload.objectKey) && price !== '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={part ? 'Edit document' : 'Add a document'}
      description="Sold for wallet credit. Students open it through a short-lived signed link, watermarked with their name."
      size="lg"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="part-form" loading={pending} disabled={!valid}>
            {part ? 'Save changes' : 'Add document'}
          </Button>
        </>
      }
    >
      <form id="part-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required error={errors.title}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Part 1 — Before mid"
              />
            )}
          </Field>

          <Field label="Title (Arabic)" error={errors.titleAr}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                dir="rtl"
                value={titleAr}
                onChange={(event) => setTitleAr(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Description" error={errors.description}>
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price"
            required={!part}
            hint="Paid with wallet credit."
            error={errors.price}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid || zeroPriced}
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                trailing={<span className="text-xs">EGP</span>}
              />
            )}
          </Field>

          <Field label="Pages" hint="Shown to the student before they buy.">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="number"
                min="0"
                value={pageCount}
                onChange={(event) => setPageCount(event.target.value)}
              />
            )}
          </Field>
        </div>

        {zeroPriced ? (
          <p role="alert" className="text-sm font-medium text-warning">
            A zero price is refused by the server. To give this away, turn on Free preview
            instead — that needs no purchase at all.
          </p>
        ) : null}

        <div className="rounded-lg border border-border px-4 py-1">
          <Switch
            checked={isPreview}
            onChange={setIsPreview}
            label="Free preview"
            description="Readable without buying anything. The documented way in without paying."
          />
        </div>

        <DocumentUploadField
          upload={upload}
          required={!part}
          hasExistingDocument={part?.hasDocument}
          error={errors.objectKey?.join(' ') ?? null}
        />

        <p className="text-xs text-muted">
          The file goes straight to private storage. Students open it through a
          short-lived link tied to their account — no permanent or public URL is
          ever created, and the storage key is never sent to a student.
        </p>

        {/* Thumbnail. Edit-only, like the course-part one: the upload route is
            keyed on the part id, which does not exist until the part is saved. */}
        <ThumbnailField
          upload={thumbnail}
          label="Cover image"
          currentUrl={part?.thumbnailUrl ?? null}
          inheritedFrom={
            part?.thumbnailKey
              ? undefined
              : "the material's cover, or the library default"
          }
          onClear={
            part?.thumbnailKey
              ? () => {
                  setClearThumbnail(true);
                  thumbnail.reset();
                }
              : undefined
          }
          disabledReason={
            part ? undefined : 'Save the document first, then add its cover image.'
          }
        />

        {(create.error ?? update.error) && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(create.error ?? update.error)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

/**
 * A bundle of documents at one price.
 *
 * Priced independently of its contents, because a bundle discount is the point
 * of a bundle. Buying one writes an entitlement per included part, which is
 * what freezes its membership: editing the package later never reaches
 * backwards into a purchase already made.
 */
export function PackageDialog({
  open,
  onClose,
  materialId,
  parts,
  pkg,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  parts: LibraryPartRow[];
  pkg: LibraryPackageRow | null;
}) {
  const toast = useToast();
  const create = useCreateLibraryPackage();
  const update = useUpdateLibraryPackage();

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [partIds, setPartIds] = useState<string[]>([]);
  // Taking a document out of a package is applied only after the
  // administrator has seen exactly which ones leave.
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  // A package belongs to this material and may hold only this material's
  // documents. Ids in the stored membership whose document has since been
  // withdrawn are kept apart: the backend refuses any id that is not a live
  // part of the material, so they cannot be posted back — and they are never
  // touched unless the contents are changed, and then only after confirmation.
  const membership = useMemo(
    () => packageMembership(pkg?.partIds ?? [], parts),
    [pkg?.partIds, parts],
  );

  useEffect(() => {
    if (!open) return;
    setTitle(pkg?.title ?? '');
    setTitleAr(pkg?.titleAr ?? '');
    setDescription(pkg?.description ?? '');
    setPrice(pkg?.price != null ? String(pkg.price) : '');
    setPartIds(membership.current);
    setStep('edit');
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id]);

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;
  const errors = fieldErrors(mutationError);

  // Undefined while the selection is unchanged: then `partIds` is not sent at
  // all and the stored membership — withdrawn items included — stays exactly
  // as it is.
  const contentsForUpdate = pkg
    ? packagePartIdsForUpdate(membership.current, partIds, parts)
    : undefined;
  const removals = packageRemovals(pkg?.partIds ?? [], contentsForUpdate, parts);
  const removalCount = removals.current.length + removals.withdrawn.length;
  const needsConfirmation = Boolean(pkg) && removalCount > 0;

  const separately = parts
    .filter((part) => partIds.includes(part.id))
    .reduce((sum, part) => sum + part.price, 0);
  const priceValue = Number(price);
  const saving = separately - priceValue;

  async function save() {
    try {
      if (pkg) {
        await update.mutateAsync({
          packageId: pkg.id,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          ...(contentsForUpdate ? { partIds: contentsForUpdate } : {}),
        });
      } else {
        await create.mutateAsync({
          materialId,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          partIds: packagePartIds(partIds, parts),
        });
      }

      toast.success(pkg ? 'Package updated' : 'Package created');
      onClose();
    } catch (error) {
      // Back to the form, where a refusal of the contents is shown in place.
      setStep('edit');
      toast.error(error, 'The package was not saved');
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (needsConfirmation && step === 'edit') {
      setStep('confirm');
      return;
    }
    void save();
  };

  const toggle = (id: string) =>
    setPartIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const valid =
    title.trim().length >= 2 && price !== '' && packagePartIds(partIds, parts).length > 0;
  const shownInline = ['title', 'price', 'description', 'partIds'].some((key) => errors[key]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        step === 'confirm'
          ? 'Remove documents from this package?'
          : pkg
            ? 'Edit package'
            : 'New package'
      }
      description={step === 'confirm' ? undefined : 'Several documents at one price.'}
      size="lg"
      busy={pending}
      footer={
        step === 'confirm' ? (
          <>
            <Button variant="secondary" onClick={() => setStep('edit')} disabled={pending}>
              Back
            </Button>
            <Button variant="danger" onClick={() => void save()} loading={pending}>
              {`Remove ${removalCount} and save`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="package-form" loading={pending} disabled={!valid}>
              {pkg ? (needsConfirmation ? 'Review removal' : 'Save changes') : 'Create package'}
            </Button>
          </>
        )
      }
    >
      {step === 'confirm' ? (
        <PackageRemovalReview removals={removals} />
      ) : (
        <form id="package-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Full year bundle"
                />
              )}
            </Field>

            <Field label="Price" required error={errors.price}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  trailing={<span className="text-xs">EGP</span>}
                />
              )}
            </Field>
          </div>

          <Field label="Description" error={errors.description}>
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>

          <fieldset className="space-y-2" aria-describedby="package-parts-hint">
            <legend className="text-sm font-medium text-foreground">Documents included</legend>
            <p id="package-parts-hint" className="text-xs text-muted">
              Only this material&apos;s documents. A package never mixes materials, and one
              document that is not on sale stops the whole package from being bought.
            </p>

            {parts.length === 0 ? (
              <p className="text-sm text-muted">Add documents to this material first.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
                {parts.map((part) => (
                  <div key={part.id} className="flex items-center justify-between gap-3">
                    <Checkbox
                      label={part.title}
                      checked={partIds.includes(part.id)}
                      onChange={() => toggle(part.id)}
                    />
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {formatMoney(part.price)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {errors.partIds ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {errors.partIds.join(' ')}
              </p>
            ) : null}

            {pkg && membership.withdrawn.length > 0 ? (
              <div
                className="space-y-1 rounded-lg border border-warning/40 px-3 py-2 text-sm"
                data-testid="package-withdrawn-note"
              >
                <p className="font-medium text-warning">
                  {membership.withdrawn.length === 1
                    ? 'This package still lists 1 document withdrawn from the material:'
                    : `This package still lists ${membership.withdrawn.length} documents withdrawn from the material:`}
                </p>
                <ul className="list-disc ps-5 text-muted">
                  {membership.withdrawn.map((id) => (
                    <li key={id}>
                      Withdrawn document <span className="font-mono text-xs">{id}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">
                  {contentsForUpdate
                    ? 'Changing the contents removes them: the server accepts only documents the material still has. You will be asked to confirm.'
                    : 'Editing the title, description or price leaves them exactly as they are.'}
                </p>
              </div>
            ) : null}

            {removals.current.length > 0 ? (
              <p className="text-sm text-warning" data-testid="package-removal-warning">
                Leaving this package: {removals.current.map((part) => part.title).join(', ')}.
                You will be asked to confirm.
              </p>
            ) : null}
          </fieldset>

          {partIds.length > 0 && price !== '' ? (
            <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Bought separately</span>
                <span className="tabular-nums">{formatMoney(separately)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between font-medium">
                <span>As a package</span>
                <span className="tabular-nums">{formatMoney(priceValue)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <span className="text-muted">Student saves</span>
                {saving > 0 ? (
                  <Badge tone="success">{formatMoney(saving)}</Badge>
                ) : (
                  <Badge tone="warning">
                    {saving === 0 ? 'Nothing' : `${formatMoney(-saving)} more`}
                  </Badge>
                )}
              </div>
            </div>
          ) : null}

          {pkg ? (
            <p className="text-xs text-muted">
              Changing the contents affects future purchases only. Everyone who already bought
              holds entitlements to the documents it contained on that day.
            </p>
          ) : null}

          {mutationError && !shownInline ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {Object.keys(errors).length > 0
                ? describeFieldErrors(errors)
                : messageFor(mutationError)}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

/**
 * Which documents a contents change takes out, and what that does NOT do.
 *
 * A purchase writes one entitlement per document, so nothing here reaches a
 * student who already paid: removing a document from a package only changes
 * what the package includes for the next buyer.
 */
function PackageRemovalReview({ removals }: { removals: ReturnType<typeof packageRemovals> }) {
  return (
    <div className="space-y-4" data-testid="package-removal-review">
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">
          These documents will no longer be part of this package:
        </p>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {removals.current.map((part) => (
            <li key={part.id}>{part.title}</li>
          ))}
          {removals.withdrawn.map((id) => (
            <li key={id} className="text-muted">
              Withdrawn document <span className="font-mono text-xs">{id}</span> — already
              removed from the material; its title is no longer available
            </li>
          ))}
        </ul>
      </div>

      <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
        <li>
          <strong className="text-foreground">No purchase or entitlement changes.</strong>{' '}
          Students who already bought this package, or any of these documents, keep them — each
          document was granted to them individually.
        </li>
        <li>From now on, buying this package no longer includes them.</li>
        {removals.withdrawn.length > 0 ? (
          <li>
            A withdrawn document cannot stay in a package whose contents change: the server only
            accepts documents the material still has.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

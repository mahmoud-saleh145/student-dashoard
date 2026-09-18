'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, Switch, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAcademicYears, useFaculties, useSubjects, useUniversities } from '@/features/catalog/hooks';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import type {
  LibraryMaterialDetail,
  LibraryPackageRow,
  LibraryPartRow,
} from '@/types/commerce';

import {
  useCreateLibraryPackage,
  useCreateLibraryPart,
  useCreateMaterial,
  useUpdateLibraryPackage,
  useUpdateLibraryPart,
  useUpdateMaterial,
} from './hooks';

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

  const universities = useUniversities();
  const [universityId, setUniversityId] = useState('');
  const faculties = useFaculties(universityId || null);
  const academicYears = useAcademicYears();
  const subjects = useSubjects();

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(material?.title ?? '');
    setTitleAr(material?.titleAr ?? '');
    setDescription(material?.description ?? '');
    setUniversityId(material?.universityId ?? '');
    setFacultyId(material?.facultyId ?? '');
    setAcademicYearId(material?.academicYearId ?? '');
    setSubjectId(material?.subjectId ?? '');
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, material?.id]);

  const pending = create.isPending || update.isPending;
  const errors = fieldErrors(create.error ?? update.error);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const body = {
      title,
      titleAr: titleAr || undefined,
      description: description || undefined,
      universityId: universityId || undefined,
      facultyId: facultyId || undefined,
      academicYearId: academicYearId || undefined,
      subjectId: subjectId || undefined,
    };

    try {
      if (material) await update.mutateAsync(body);
      else await create.mutateAsync(body);

      toast.success(material ? 'Material updated' : 'Material created');
      onClose();
    } catch (error) {
      toast.error(error, 'The material was not saved');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={material ? 'Edit material' : 'New library material'}
      description="A publication — sold as its individual documents, or as packages of them."
      size="lg"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="material-form"
            loading={pending}
            disabled={title.trim().length < 2}
          >
            {material ? 'Save changes' : 'Create material'}
          </Button>
        </>
      }
    >
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="University" hint="Used to filter the student's catalogue.">
            {({ id }) => (
              <Select
                id={id}
                value={universityId}
                onChange={(event) => {
                  setUniversityId(event.target.value);
                  setFacultyId('');
                }}
                placeholder="Any university"
                options={(universities.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            )}
          </Field>

          <Field label="Faculty">
            {({ id }) => (
              <Select
                id={id}
                value={facultyId}
                onChange={(event) => setFacultyId(event.target.value)}
                placeholder={universityId ? 'Any faculty' : 'Choose a university first'}
                disabled={!universityId}
                options={(faculties.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            )}
          </Field>

          <Field label="Academic year">
            {({ id }) => (
              <Select
                id={id}
                value={academicYearId}
                onChange={(event) => setAcademicYearId(event.target.value)}
                placeholder="Any year"
                options={(academicYears.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            )}
          </Field>

          <Field label="Subject">
            {({ id }) => (
              <Select
                id={id}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                placeholder="No subject"
                options={(subjects.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            )}
          </Field>
        </div>

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
  const [objectKey, setObjectKey] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(part?.title ?? '');
    setTitleAr(part?.titleAr ?? '');
    setDescription(part?.description ?? '');
    setPrice(part?.price != null ? String(part.price) : '');
    setObjectKey('');
    setPageCount(part?.pageCount != null ? String(part.pageCount) : '');
    setIsPreview(part?.isPreview ?? false);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part?.id]);

  const pending = create.isPending || update.isPending;
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
          objectKey: objectKey || undefined,
          pageCount: pageCount !== '' ? Number(pageCount) : undefined,
        });
      } else {
        await create.mutateAsync({
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          objectKey,
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

  const valid =
    title.trim().length >= 2 && (part ? true : objectKey.trim().length > 0 && price !== '');

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

        <Field
          label={part ? 'Replace file (object key)' : 'File (object key)'}
          required={!part}
          hint={
            part
              ? 'Leave empty to keep the current file. Replacing a document that students already hold is allowed but logged.'
              : 'The storage key returned by the presigned upload — never a public URL.'
          }
          error={errors.objectKey}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={objectKey}
              onChange={(event) => setObjectKey(event.target.value)}
              placeholder="library/physics/part-1.pdf"
              className="font-mono text-xs"
            />
          )}
        </Field>

        {part?.hasDocument ? (
          <p className="text-xs text-muted">
            A file is attached. Its key is never sent to any client, including this one.
          </p>
        ) : null}

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

  useEffect(() => {
    if (!open) return;
    setTitle(pkg?.title ?? '');
    setTitleAr(pkg?.titleAr ?? '');
    setDescription(pkg?.description ?? '');
    setPrice(pkg?.price != null ? String(pkg.price) : '');
    setPartIds(pkg?.partIds ?? []);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id]);

  const pending = create.isPending || update.isPending;
  const errors = fieldErrors(create.error ?? update.error);

  const separately = parts
    .filter((part) => partIds.includes(part.id))
    .reduce((sum, part) => sum + part.price, 0);
  const priceValue = Number(price);
  const saving = separately - priceValue;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (pkg) {
        await update.mutateAsync({
          packageId: pkg.id,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          partIds,
        });
      } else {
        await create.mutateAsync({
          materialId,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          price: priceValue,
          partIds,
        });
      }

      toast.success(pkg ? 'Package updated' : 'Package created');
      onClose();
    } catch (error) {
      toast.error(error, 'The package was not saved');
    }
  };

  const toggle = (id: string) =>
    setPartIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const valid = title.trim().length >= 2 && price !== '' && partIds.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pkg ? 'Edit package' : 'New package'}
      description="Several documents at one price."
      size="lg"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="package-form" loading={pending} disabled={!valid}>
            {pkg ? 'Save changes' : 'Create package'}
          </Button>
        </>
      }
    >
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

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Documents included</legend>

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
            Changing the contents affects future purchases only. Everyone who already
            bought holds entitlements to the documents it contained on that day.
          </p>
        ) : null}

        {(create.error ?? update.error) && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(create.error ?? update.error)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { PART_PRICING_MODELS, PART_PRICING_MODEL_LABEL } from '@/types/commerce';
import type { CoursePartRow, PartPricingModel } from '@/types/commerce';
import type { SectionRow } from '@/types/domain';

import { useCreateCoursePart, useUpdateCoursePart, useSetPartSections } from './hooks';

/**
 * Creating and editing a part.
 *
 * Pricing is either a percentage of the course price or a fixed amount, and
 * the two cannot be mixed in a way that stops adding up: the backend requires
 * the active parts to total exactly 100% or exactly the course price, and
 * refuses the save otherwise. The hint below the field says what the remaining
 * headroom is, so the refusal is rare rather than routine.
 *
 * **No wallet anywhere.** A part is unlocked with an access card, like the
 * course it belongs to.
 */
export function PartDialog({
  open,
  onClose,
  courseId,
  coursePrice,
  part,
  sections,
  otherPartsPercent,
  otherPartsAmount,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  coursePrice: number | null;
  /** Null when creating. */
  part: CoursePartRow | null;
  sections: SectionRow[];
  /** Percentage already allocated to the other active parts. */
  otherPartsPercent: number;
  /** Fixed amount already allocated to the other active parts. */
  otherPartsAmount: number;
}) {
  const toast = useToast();
  const editing = Boolean(part);

  const create = useCreateCoursePart(courseId);
  const update = useUpdateCoursePart(courseId);
  const setSections = useSetPartSections(courseId);

  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [description, setDescription] = useState('');
  const [pricingModel, setPricingModel] = useState<PartPricingModel>('PERCENTAGE');
  const [pricePercent, setPricePercent] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [sectionIds, setSectionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    setTitle(part?.title ?? '');
    setTitleAr(part?.titleAr ?? '');
    setDescription(part?.description ?? '');
    setPricingModel(part?.pricingModel ?? 'PERCENTAGE');
    setPricePercent(part?.pricePercent != null ? String(part.pricePercent) : '');
    setPriceAmount(part?.priceAmount != null ? String(part.priceAmount) : '');
    setSectionIds(part?.sections.map((section) => section.id) ?? []);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part?.id]);

  const pending = create.isPending || update.isPending || setSections.isPending;
  const errors = fieldErrors(create.error ?? update.error);

  const percentRemaining = Math.max(0, 100 - otherPartsPercent);
  const amountRemaining =
    coursePrice != null ? Math.max(0, coursePrice - otherPartsAmount) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const pricing =
      pricingModel === 'PERCENTAGE'
        ? { pricingModel, pricePercent: Number(pricePercent) }
        : { pricingModel, priceAmount: Number(priceAmount) };

    try {
      if (part) {
        await update.mutateAsync({
          partId: part.id,
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          ...pricing,
        });

        // Sections are a separate endpoint, so only call it when they moved.
        const before = [...part.sections.map((section) => section.id)].sort().join(',');
        const after = [...sectionIds].sort().join(',');
        if (before !== after) {
          await setSections.mutateAsync({ partId: part.id, sectionIds });
        }

        toast.success('Part updated');
      } else {
        await create.mutateAsync({
          title,
          titleAr: titleAr || undefined,
          description: description || undefined,
          ...pricing,
          sectionIds,
        });
        toast.success('Part created');
      }

      onClose();
    } catch (error) {
      toast.error(error, editing ? 'The part was not updated' : 'The part was not created');
    }
  };

  const toggleSection = (id: string) =>
    setSectionIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const valid =
    title.trim().length >= 2 &&
    (pricingModel === 'PERCENTAGE' ? pricePercent !== '' : priceAmount !== '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit part' : 'Add a part'}
      description="Parts split a course into separately sellable pieces. They are unlocked with access codes, never with wallet credit."
      size="lg"
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="part-form" loading={pending} disabled={!valid}>
            {editing ? 'Save changes' : 'Create part'}
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
          <Field label="Pricing" required>
            {({ id }) => (
              <Select
                id={id}
                value={pricingModel}
                onChange={(event) =>
                  setPricingModel(event.target.value as PartPricingModel)
                }
                options={PART_PRICING_MODELS.map((model) => ({
                  value: model,
                  label: PART_PRICING_MODEL_LABEL[model],
                }))}
              />
            )}
          </Field>

          {pricingModel === 'PERCENTAGE' ? (
            <Field
              label="Share of course price"
              required
              hint={`${percentRemaining}% not yet allocated. All active parts must total exactly 100%.`}
              error={errors.pricePercent}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pricePercent}
                  onChange={(event) => setPricePercent(event.target.value)}
                  trailing={<span className="text-xs">%</span>}
                />
              )}
            </Field>
          ) : (
            <Field
              label="Fixed price"
              required
              hint={
                amountRemaining != null
                  ? `${formatMoney(amountRemaining)} not yet allocated. All active parts must total the course price.`
                  : 'This course has no price yet, so a fixed part price cannot be validated.'
              }
              error={errors.priceAmount}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceAmount}
                  onChange={(event) => setPriceAmount(event.target.value)}
                  trailing={<span className="text-xs">EGP</span>}
                />
              )}
            </Field>
          )}
        </div>

        {pricingModel === 'PERCENTAGE' && coursePrice != null && pricePercent !== '' ? (
          <p className="text-sm text-muted">
            At the current course price of {formatMoney(coursePrice)}, this part costs{' '}
            <strong className="font-medium text-foreground">
              {formatMoney((coursePrice * Number(pricePercent)) / 100)}
            </strong>
            . The server recomputes this on save.
          </p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            Sections this part unlocks
          </legend>
          <p className="text-xs text-muted">
            A part with no sections is priced but unlocks nothing — a valid half-built
            state, not an error.
          </p>

          {sections.length === 0 ? (
            <p className="text-sm text-muted">This course has no sections yet.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
              {sections.map((section) => (
                <Checkbox
                  key={section.id}
                  label={section.title}
                  checked={sectionIds.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                />
              ))}
            </div>
          )}
        </fieldset>

        {(create.error ?? update.error) && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(create.error ?? update.error)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

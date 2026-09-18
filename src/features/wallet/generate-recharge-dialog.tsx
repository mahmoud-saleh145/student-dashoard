'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge, DescriptionList } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { DISCOUNT_TYPE_LABEL, DISCOUNT_TYPES } from '@/types/commerce';
import type {
  DiscountType,
  GeneratedRechargeBatch,
  RechargePreview,
} from '@/types/commerce';

import { useGenerateRecharge, usePreviewRecharge } from './hooks';

/**
 * Printing recharge cards.
 *
 * Three amounts travel with every card and they are routinely confused, so the
 * form names all three and shows them side by side before anything is created:
 *
 *   face value        what is printed on the card
 *   actually paid     what the shop hands over — **this is the revenue**
 *   credit            what lands in the student's wallet
 *
 * A discount makes "paid" smaller than "face value" while "credit" stays at
 * face value: that is the entire point of a discount, and it is also why
 * summing credit as if it were income overstates revenue.
 *
 * **Every one of those numbers comes from the server.** The browser sends the
 * face value and the discount and renders what comes back. It does not compute
 * `faceValue − discount` itself, because the server's rounding is what gets
 * frozen onto the card, and an admin approving a figure that differs by a
 * piastre from the stored one is worse than showing no preview.
 */

const EMPTY = {
  faceValue: '',
  discountType: 'NONE' as DiscountType,
  discountPercent: '',
  discountAmount: '',
  count: '50',
  batchName: '',
  expiresAt: '',
  prefix: '',
  note: '',
};

export function GenerateRechargeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState<GeneratedRechargeBatch | null>(null);
  const [preview, setPreview] = useState<RechargePreview | null>(null);
  const [overrideMinimum, setOverrideMinimum] = useState(false);

  const previewMutation = usePreviewRecharge();
  const generate = useGenerateRecharge();

  const errors = fieldErrors(generate.error);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setResult(null);
      setPreview(null);
      setOverrideMinimum(false);
      generate.reset();
      previewMutation.reset();
    }
    // Resetting on close only; the mutations are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const faceValue = Number(form.faceValue);
  const count = Number(form.count);
  const canPrice = Number.isFinite(faceValue) && faceValue > 0;

  /**
   * Re-prices whenever the inputs settle.
   *
   * Debounced because it is a round trip per keystroke otherwise, and the
   * preview is advisory — it must never block typing.
   */
  useEffect(() => {
    if (!open || !canPrice) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(() => {
      previewMutation.mutate(
        {
          faceValue,
          discountType: form.discountType,
          discountPercent: form.discountPercent ? Number(form.discountPercent) : undefined,
          discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
          count: Number.isFinite(count) && count > 0 ? count : 1,
        },
        { onSuccess: setPreview, onError: () => setPreview(null) },
      );
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    canPrice,
    faceValue,
    count,
    form.discountType,
    form.discountPercent,
    form.discountAmount,
  ]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    generate.mutate(
      {
        faceValue,
        discountType: form.discountType,
        discountPercent:
          form.discountType === 'PERCENTAGE' && form.discountPercent
            ? Number(form.discountPercent)
            : undefined,
        discountAmount:
          form.discountType === 'FIXED' && form.discountAmount
            ? Number(form.discountAmount)
            : undefined,
        count,
        batchName: form.batchName || undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        prefix: form.prefix || undefined,
        note: form.note || undefined,
        overrideMinimum: overrideMinimum || undefined,
      },
      {
        onSuccess: (batch) => {
          setResult(batch);
          toast.success(
            `${batch.created} card${batch.created === 1 ? '' : 's'} created`,
            'Copy them now — they cannot be shown again.',
          );
        },
        onError: (error) => toast.error(error, 'The cards were not created'),
      },
    );
  };

  if (result) {
    return (
      <GeneratedCards result={result} open={open} onClose={onClose} />
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate recharge cards"
      description="Cards are sold for cash. Redeeming one adds credit to a student's wallet, which buys library material only."
      size="lg"
      busy={generate.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="generate-recharge"
            loading={generate.isPending}
            disabled={!canPrice || !count}
          >
            Create {count > 0 ? count : ''} card{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <form id="generate-recharge" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Face value"
            required
            hint="Printed on the card."
            error={errors.faceValue}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.faceValue}
                onChange={(event) => set('faceValue', event.target.value)}
                trailing={<span className="text-xs">EGP</span>}
              />
            )}
          </Field>

          <Field label="How many" required error={errors.count}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="number"
                min="1"
                max="5000"
                value={form.count}
                onChange={(event) => set('count', event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount" error={errors.discountType}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.discountType}
                onChange={(event) => set('discountType', event.target.value as DiscountType)}
                options={DISCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: DISCOUNT_TYPE_LABEL[type],
                }))}
              />
            )}
          </Field>

          {form.discountType === 'PERCENTAGE' ? (
            <Field
              label="Percentage off"
              required
              hint="100% is allowed — a free card."
              error={errors.discountPercent}
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
                  value={form.discountPercent}
                  onChange={(event) => set('discountPercent', event.target.value)}
                  trailing={<span className="text-xs">%</span>}
                />
              )}
            </Field>
          ) : null}

          {form.discountType === 'FIXED' ? (
            <Field
              label="Amount off"
              required
              hint="Never more than the face value."
              error={errors.discountAmount}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountAmount}
                  onChange={(event) => set('discountAmount', event.target.value)}
                  trailing={<span className="text-xs">EGP</span>}
                />
              )}
            </Field>
          ) : null}
        </div>

        <PricingPreview
          preview={preview}
          loading={previewMutation.isPending}
          count={count}
          overrideMinimum={overrideMinimum}
          onOverrideChange={setOverrideMinimum}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch name" hint="Shown in reports." error={errors.batchName}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={form.batchName}
                onChange={(event) => set('batchName', event.target.value)}
                placeholder="e.g. Term 2 — Pharmacy kiosk"
              />
            )}
          </Field>

          <Field label="Expires on" hint="Optional." error={errors.expiresAt}>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="date"
                value={form.expiresAt}
                onChange={(event) => set('expiresAt', event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code prefix"
            hint="Up to 6 letters or digits, to tell batches apart at a glance."
            error={errors.prefix}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                maxLength={6}
                value={form.prefix}
                onChange={(event) =>
                  set('prefix', event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
                }
                placeholder="PH2"
              />
            )}
          </Field>

          <Field label="Note" error={errors.note}>
            {({ id, describedBy }) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                value={form.note}
                onChange={(event) => set('note', event.target.value)}
              />
            )}
          </Field>
        </div>

        {generate.error && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(generate.error)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/**
 * The three amounts, as the server computed them.
 *
 * Laid out in the order money moves — printed, paid, credited — so the
 * relationship is readable rather than something to work out.
 */
function PricingPreview({
  preview,
  loading,
  count,
  overrideMinimum,
  onOverrideChange,
}: {
  preview: RechargePreview | null;
  loading: boolean;
  count: number;
  overrideMinimum: boolean;
  onOverrideChange: (value: boolean) => void;
}) {
  if (!preview && !loading) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
        Enter a face value to price the batch.
      </div>
    );
  }

  if (loading || !preview) {
    return (
      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
        <div className="skeleton h-14 w-full rounded" />
      </div>
    );
  }

  const discounted = preview.discountAmount > 0;

  return (
    <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Amount label="Face value" value={preview.faceValue} tone="muted" />
        <Amount
          label="Student pays"
          value={preview.actualPaidAmount}
          tone="revenue"
          hint={discounted ? `−${formatMoney(preview.discountAmount)}` : undefined}
        />
        <Amount label="Wallet credit" value={preview.creditAmount} tone="credit" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
        <span>
          {count > 0 ? `${count} cards → ` : ''}
          <strong className="font-semibold text-foreground">
            {formatMoney(preview.expectedRevenue)}
          </strong>{' '}
          revenue,{' '}
          <strong className="font-semibold text-foreground">
            {formatMoney(preview.expectedCredits)}
          </strong>{' '}
          credit issued
        </span>
        {discounted ? <Badge tone="warning">Discounted</Badge> : null}
      </div>

      {preview.belowMinimum ? (
        <div
          role="alert"
          className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <p className="font-medium">
            Below the configured minimum of {formatMoney(preview.minimumRecharge)}.
          </p>
          {preview.overrideAllowed ? (
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={overrideMinimum}
                onChange={(event) => onOverrideChange(event.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-[var(--color-primary)]"
              />
              <span>Create anyway</span>
            </label>
          ) : (
            <p className="mt-1">Platform settings do not permit an override.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Amount({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'muted' | 'revenue' | 'credit';
  hint?: string;
}) {
  const colour = {
    muted: 'text-muted',
    revenue: 'text-success',
    credit: 'text-info',
  }[tone];

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${colour}`}>
        {formatMoney(value)}
      </p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * The cards, shown once.
 *
 * The backend returns the plaintext at creation and never again — it stores
 * only a hash — so this screen is the single opportunity to capture them. It
 * says so plainly, and closing requires acknowledging it.
 */
function GeneratedCards({
  result,
  open,
  onClose,
}: {
  result: GeneratedRechargeBatch;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(result.codes.join('\n'));
      setCopied(true);
      toast.success(`${result.codes.length} codes copied`);
    } catch {
      toast.error(new Error('Clipboard unavailable'), 'Select and copy manually');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${result.created} recharge cards created`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={copyAll}>
            {copied ? 'Copied' : 'Copy all codes'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <p className="font-medium">Copy these now.</p>
          <p className="mt-0.5">
            Only a hash is stored. Once this dialog closes the codes cannot be recovered
            from anywhere — the batch would have to be reprinted.
          </p>
        </div>

        <DescriptionList
          columns={3}
          items={[
            { label: 'Face value', value: formatMoney(result.faceValue) },
            {
              label: 'Student pays',
              value: (
                <span className="font-medium text-success">
                  {formatMoney(result.actualPaidAmount)}
                </span>
              ),
            },
            {
              label: 'Wallet credit',
              value: (
                <span className="font-medium text-info">
                  {formatMoney(result.creditAmount)}
                </span>
              ),
            },
            { label: 'Expected revenue', value: formatMoney(result.expectedRevenue) },
            { label: 'Credit issued', value: formatMoney(result.expectedCredits) },
            {
              label: 'Requested / created',
              value: `${result.requested} / ${result.created}`,
            },
          ]}
        />

        {result.created < result.requested ? (
          <p className="text-xs text-warning">
            {result.requested - result.created} card(s) collided with existing codes and
            were skipped.
          </p>
        ) : null}

        <div>
          <label
            htmlFor="generated-codes"
            className="text-xs font-medium tracking-wide text-muted uppercase"
          >
            Codes
          </label>
          <textarea
            id="generated-codes"
            readOnly
            rows={10}
            value={result.codes.join('\n')}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 font-mono text-xs text-foreground"
          />
        </div>
      </div>
    </Modal>
  );
}

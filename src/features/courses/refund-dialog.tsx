'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Switch, TextArea, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/primitives';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useRefundPayment,
  useRefundSummary,
  useResolveRefund,
  type CompletionMethod,
  type RefundSummary,
  type RefundView,
} from '@/features/courses/hooks';
import { formatDateTime, formatMoney } from '@/lib/format';

/**
 * Refunding one course payment.
 *
 * Two ways to record it:
 *
 *  - Immediate (the default): the refund is recorded as COMPLETED and
 *    deducted from net revenue now. Only for money that has ALREADY been
 *    returned — the platform never sends money, and no Paymob/Stripe refund
 *    API is integrated, so for those payments this is an admin-confirmed
 *    external refund, never a provider-confirmed one.
 *  - Pending: the money has not been returned yet. The amount is reserved;
 *    nothing is deducted until it is marked completed (or failed).
 *
 * Either way, by the platform's rule, every refund revokes the student's
 * access to this course at once. A final confirmation step shows the exact
 * amount and that warning before anything is sent.
 *
 * Numbers are read fresh from `GET /admin/payments/:id/refunds` and the API
 * re-checks everything; amounts are compared as whole piastres. One
 * idempotency key per intended refund, so a retry cannot refund twice.
 */

/** "179.50" → 17950. Null when the text is not a 2-decimal amount. */
function toPiastres(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function piastresText(piastres: number): string {
  return `${Math.floor(piastres / 100)}.${String(piastres % 100).padStart(2, '0')}`;
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `refund-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const STATUS_TONE = { SUCCEEDED: 'success', PENDING: 'warning', FAILED: 'danger' } as const;
const STATUS_LABEL = {
  SUCCEEDED: 'Completed',
  PENDING: 'Pending — not refunded yet',
  FAILED: 'Failed — reservation released',
} as const;

const METHOD_LABEL: Record<CompletionMethod, string> = {
  ADMIN_CONFIRMED_MANUAL: 'Admin-confirmed manual refund',
  ADMIN_CONFIRMED_EXTERNAL: 'Admin-confirmed external refund',
  PROVIDER_CONFIRMED: 'Confirmed by the payment provider',
  UNRECORDED: 'Older refund — method not recorded',
};

const isProviderPayment = (provider: string) => provider === 'PAYMOB' || provider === 'STRIPE';

export function RefundDialog({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  // Keyed by payment, so a new dialog never inherits another's amount or key.
  return paymentId ? <RefundForm key={paymentId} paymentId={paymentId} onClose={onClose} /> : null;
}

function RefundForm({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const toast = useToast();
  const summary = useRefundSummary(paymentId);
  const refund = useRefundPayment(paymentId);

  const [type, setType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Immediate completion is the default.
  const [immediate, setImmediateCompletion] = useState(true);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [moneyReturned, setMoneyReturned] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  const data = summary.data;
  const payment = data?.payment;
  const currency = payment?.currency ?? 'EGP';
  const refundable = payment ? (toPiastres(payment.refundableAmountText) ?? 0) : 0;
  const partial = toPiastres(amount);
  const external = payment ? isProviderPayment(payment.provider) : false;

  const amountError =
    type !== 'PARTIAL' || amount === ''
      ? undefined
      : partial === null
        ? 'Use a positive amount with at most 2 decimal places.'
        : partial <= 0
          ? 'The amount must be greater than 0.'
          : partial > refundable
            ? `At most ${formatMoney(refundable / 100, currency)} can be refunded.`
            : undefined;

  const refundPiastres = type === 'FULL' ? refundable : (partial ?? 0);
  const formValid =
    Boolean(payment?.eligible) &&
    refundPiastres > 0 &&
    !amountError &&
    (type === 'FULL' || amount !== '');
  const canSubmit = formValid && (!immediate || moneyReturned) && !refund.isPending;

  const money = (piastres: number) => formatMoney(piastres / 100, currency);

  async function submit() {
    if (!canSubmit || !data) return;
    try {
      const result = await refund.mutateAsync({
        type,
        ...(type === 'PARTIAL' ? { amount: piastresText(refundPiastres) } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        idempotencyKey,
        completion: immediate ? 'IMMEDIATE' : 'PENDING',
        ...(immediate ? { confirmMoneyReturned: true } : {}),
      });
      const shown = formatMoney(result.refund.amount, result.refund.currency);
      toast.success(
        result.refund.status === 'SUCCEEDED'
          ? `Refund of ${shown} completed`
          : `Pending refund of ${shown} recorded`,
        `${data.student.fullName} no longer has access to ${data.course.title}.` +
          (result.refund.status === 'PENDING'
            ? ' Mark it completed once the money has been returned.'
            : ''),
      );
      setIdempotencyKey(newKey());
      onClose();
    } catch (error) {
      // The key is kept: retrying the same refund after an error the server
      // may have committed replays it rather than refunding twice.
      toast.error(error, 'The refund was not recorded');
    }
  }

  const footer =
    step === 'form' ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!formValid}
          onClick={() => {
            setMoneyReturned(false);
            setStep('confirm');
          }}
        >
          Review refund
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setStep('form')} disabled={refund.isPending}>
          Back
        </Button>
        <Button
          variant="danger"
          onClick={() => void submit()}
          loading={refund.isPending}
          disabled={!canSubmit}
        >
          {immediate
            ? `Confirm completed refund of ${money(refundPiastres)}`
            : `Record pending refund of ${money(refundPiastres)}`}
        </Button>
      </>
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={step === 'form' ? 'Refund payment' : 'Confirm refund'}
      description={
        data ? `${data.student.fullName} · ${data.course.title}` : 'Loading the payment…'
      }
      busy={refund.isPending}
      footer={data && payment?.eligible ? footer : (
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      )}
    >
      {summary.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : summary.isError || !data || !payment ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : step === 'confirm' ? (
        <FinalConfirmation
          data={data}
          amount={money(refundPiastres)}
          immediate={immediate}
          external={external}
          moneyReturned={moneyReturned}
          onMoneyReturned={setMoneyReturned}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-sm sm:grid-cols-3"
            data-testid="refund-balance"
          >
            <Amount label="Paid" value={formatMoney(payment.amount, currency)} hint={formatDateTime(payment.paidAt)} />
            <Amount label="Refunded (completed)" value={formatMoney(payment.refundedAmount, currency)} />
            <Amount
              label="Pending (reserved)"
              value={formatMoney(payment.pendingRefundAmount, currency)}
            />
            <Amount label="Remaining refundable" value={money(refundable)} strong />
            <Amount
              label="Payment method"
              value={external ? payment.provider : 'Manual (offline)'}
            />
            <Amount label="Course access" value={(data.enrollment?.state ?? 'none').toLowerCase()} />
          </dl>

          {payment.eligible ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Refund type</legend>
                <TypeOption
                  checked={type === 'FULL'}
                  onSelect={() => setType('FULL')}
                  title="Full refund"
                  detail={`The whole remaining balance: ${money(refundable)}.`}
                />
                <TypeOption
                  checked={type === 'PARTIAL'}
                  onSelect={() => setType('PARTIAL')}
                  title="Partial refund"
                  detail={`Any amount up to ${money(refundable)}.`}
                />
              </fieldset>

              {type === 'PARTIAL' ? (
                <Field label={`Refund amount (${currency})`} required error={amountError}>
                  {({ id, describedBy, invalid }) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      value={amount}
                      invalid={invalid}
                      aria-describedby={describedBy}
                      placeholder={`e.g. ${payment.refundableAmountText}`}
                      onChange={(event) => setAmount(event.target.value)}
                      autoFocus
                    />
                  )}
                </Field>
              ) : null}

              <Field label="Reason" hint="Optional. Recorded in the audit log.">
                {({ id }) => (
                  <TextArea
                    id={id}
                    value={reason}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>

              <div className="rounded-md border border-border px-3" data-testid="refund-immediate">
                <Switch
                  checked={immediate}
                  onChange={setImmediateCompletion}
                  label="Confirm refund immediately — record the refund as completed and deduct it from net revenue immediately."
                  description={
                    immediate
                      ? external
                        ? `Only if the money has already been returned to the student, e.g. refunded in the ${payment.provider} dashboard. This is recorded as an admin-confirmed external refund — nothing is sent through ${payment.provider} from here.`
                        : 'Only if the money has already been returned to the student outside the platform (cash or transfer). The platform does not send money.'
                      : 'Turned off: a pending refund is recorded. The amount is reserved but nothing is deducted from revenue until you mark it completed — or failed, which releases it.'
                  }
                />
              </div>

              <Consequences data={data} amount={money(refundPiastres)} immediate={immediate} />
            </>
          ) : (
            <p className="rounded-md border border-border bg-surface-alt p-3 text-sm text-muted">
              {payment.pendingRefundAmount > 0
                ? 'Nothing more can be refunded until the pending refund below is completed or marked failed.'
                : 'This payment has been fully refunded. Nothing remains to refund.'}
            </p>
          )}

          {data.refunds.length > 0 ? (
            <RefundHistory paymentId={paymentId} refunds={data.refunds} external={external} provider={payment.provider} />
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function FinalConfirmation({
  data,
  amount,
  immediate,
  external,
  moneyReturned,
  onMoneyReturned,
}: {
  data: RefundSummary;
  amount: string;
  immediate: boolean;
  external: boolean;
  moneyReturned: boolean;
  onMoneyReturned: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="refund-final-confirmation">
      <p className="text-base font-semibold text-foreground">
        {immediate ? `Completed refund of ${amount}` : `Pending refund of ${amount}`}
      </p>
      <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm text-muted">
        <li>
          <strong className="text-danger">
            {data.student.fullName} loses access to {data.course.title} immediately.
          </strong>{' '}
          Their other courses and their account are not affected. A failed or cancelled refund
          does not give it back — that is a separate grant.
        </li>
        {immediate ? (
          <>
            <li>
              The refund is recorded as <strong className="text-foreground">completed</strong>, and
              net revenue for this course drops by {amount} now. The teacher’s share is reduced in
              proportion.
            </li>
            <li>
              {external
                ? `Recorded as an admin-confirmed external refund. No money is sent through ${data.payment.provider} from here.`
                : 'Recorded as an admin-confirmed manual refund. The platform does not send money.'}
            </li>
          </>
        ) : (
          <li>
            The refund is recorded as <strong className="text-foreground">pending</strong>:{' '}
            {amount} is reserved, and nothing is deducted from revenue until you mark it completed.
          </li>
        )}
      </ul>
      {immediate ? (
        <Checkbox
          checked={moneyReturned}
          onChange={(event) => onMoneyReturned(event.target.checked)}
          label={`I confirm ${amount} has actually been returned to ${data.student.fullName}.`}
        />
      ) : null}
    </div>
  );
}

function Amount({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'font-semibold text-foreground' : 'text-foreground'}>{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

function TypeOption({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-xs">
      <input type="radio" name="refund-type" className="mt-0.5" checked={checked} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="text-muted">{detail}</span>
      </span>
    </label>
  );
}

/** What confirming will do, in the order the reader cares about. */
function Consequences({
  data,
  amount,
  immediate,
}: {
  data: RefundSummary;
  amount: string;
  immediate: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-muted"
      data-testid="refund-consequences"
    >
      <p>
        <strong className="text-foreground">Access:</strong> {data.student.fullName} loses access to{' '}
        {data.course.title} immediately — every refund, full or partial, completed or pending,
        revokes it. Their other courses and their account are not affected.
      </p>
      <p>
        <strong className="text-foreground">Revenue:</strong>{' '}
        {immediate
          ? `net revenue drops by ${amount} as soon as you confirm.`
          : `nothing changes until the pending refund is marked completed; ${amount} is reserved meanwhile.`}{' '}
        Gross revenue and the original payment stay on record. A redeemed code, if any, stays used.
      </p>
      <p>
        <strong className="text-foreground">Money:</strong> the platform does not send money; no
        Paymob or Stripe refund is made from here.
      </p>
    </div>
  );
}

function RefundHistory({
  paymentId,
  refunds,
  external,
  provider,
}: {
  paymentId: string;
  refunds: RefundView[];
  external: boolean;
  provider: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">Refund history</h3>
      <ul className="divide-y divide-border rounded-md border border-border" data-testid="refund-history">
        {refunds.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {formatMoney(row.amount, row.currency)}
              </span>
              <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              {row.completionMethod ? (
                <span className="text-xs text-muted">{METHOD_LABEL[row.completionMethod]}</span>
              ) : null}
              <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span>
              {row.reference ? (
                <span className="text-xs text-muted" dir="ltr">
                  Ref {row.reference}
                </span>
              ) : null}
            </div>
            {row.reason ? <p className="text-xs text-muted">{row.reason}</p> : null}
            {row.status === 'PENDING' ? (
              <ResolvePending paymentId={paymentId} refund={row} external={external} provider={provider} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Completing or failing a pending refund. */
function ResolvePending({
  paymentId,
  refund,
  external,
  provider,
}: {
  paymentId: string;
  refund: RefundView;
  external: boolean;
  provider: string;
}) {
  const toast = useToast();
  const resolve = useResolveRefund(paymentId);
  const [reference, setReference] = useState('');
  const [returned, setReturned] = useState(false);
  const [failReason, setFailReason] = useState('');
  const amount = formatMoney(refund.amount, refund.currency);

  async function complete() {
    try {
      await resolve.mutateAsync({
        refundId: refund.id,
        outcome: 'complete',
        confirmMoneyReturned: true,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      toast.success('Refund marked completed', `${amount} now counts as refunded and is deducted from net revenue.`);
    } catch (error) {
      toast.error(error);
    }
  }

  async function fail() {
    try {
      await resolve.mutateAsync({ refundId: refund.id, outcome: 'fail', reason: failReason.trim() });
      toast.success('Refund marked failed', `${amount} is refundable again. Course access stays revoked.`);
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="grid gap-3 rounded-md bg-surface-alt p-2.5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Field label="Reference" hint={external ? `Optional, e.g. the ${provider} refund id.` : 'Optional, e.g. a transfer id.'}>
          {({ id }) => (
            <TextInput id={id} value={reference} onChange={(e) => setReference(e.target.value)} />
          )}
        </Field>
        <Checkbox
          checked={returned}
          onChange={(event) => setReturned(event.target.checked)}
          label={`${amount} has actually been returned to the student.`}
        />
        <Button
          size="sm"
          disabled={!returned || resolve.isPending}
          loading={resolve.isPending}
          onClick={() => void complete()}
        >
          Mark completed
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Field label="Why it failed" hint="The reservation is released; access stays revoked.">
          {({ id }) => (
            <TextInput id={id} value={failReason} onChange={(e) => setFailReason(e.target.value)} />
          )}
        </Field>
        <Button
          size="sm"
          variant="secondary"
          disabled={failReason.trim().length < 3 || resolve.isPending}
          onClick={() => void fail()}
        >
          Mark failed
        </Button>
      </div>
    </div>
  );
}

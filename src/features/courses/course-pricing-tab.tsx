'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useChangeCoursePrice, useCoursePriceHistory } from '@/features/courses/hooks';
import { useTeacherCapabilities } from '@/features/settings/hooks';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useSession } from '@/lib/session-context';

interface PriceVersion {
  id: string;
  amount: number | string;
  currency: string;
  version: number;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  changedBy: { id: string; fullName: string } | null;
}

/**
 * Pricing.
 *
 * Prices are append-only versions. Changing one writes a new row and closes
 * the previous one; it never edits history, and every payment stores both the
 * amount charged and a pointer to the exact version it was charged under. So
 * repricing a course from 200 to 250 leaves last term's revenue reported at
 * 200 — which is the whole reason the ledger exists.
 *
 * Whether a teacher may do this at all is a platform setting an admin owns.
 * The control is hidden when it is off, and the backend refuses the request
 * regardless of what the browser renders.
 */
export function CoursePricingTab({
  courseId,
  currentPrice,
  currency,
  isFree,
}: {
  courseId: string;
  currentPrice: number;
  currency: string;
  isFree: boolean;
}) {
  const toast = useToast();
  const { isAdmin } = useSession();
  const capabilities = useTeacherCapabilities();

  const canEdit = isAdmin || capabilities.canEditCoursePrices;

  const history = useCoursePriceHistory(courseId, true);
  const changePrice = useChangeCoursePrice(courseId);

  const [amount, setAmount] = useState(String(currentPrice || ''));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  async function submit() {
    try {
      await changePrice.mutateAsync({
        amount: parsed,
        currency,
        reason: reason.trim() || undefined,
      });
      toast.success('Price updated', 'Existing purchases and revenue are unchanged.');
      setReason('');
      await history.refetch();
    } catch (error) {
      toast.error(error, 'The price was not changed');
    } finally {
      setConfirming(false);
    }
  }

  const columns: Column<PriceVersion>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <span className="flex items-center gap-2 tabular-nums">
          v{row.version}
          {row.isCurrent ? <Badge tone="success">Current</Badge> : null}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (row) => (
        <span className="tabular-nums font-medium">
          {formatMoney(Number(row.amount), row.currency)}
        </span>
      ),
    },
    {
      key: 'effectiveFrom',
      header: 'In force from',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.effectiveFrom)}</span>
      ),
    },
    {
      key: 'effectiveTo',
      header: 'Until',
      secondary: true,
      render: (row) => (
        <span className="whitespace-nowrap text-muted">
          {row.effectiveTo ? formatDateTime(row.effectiveTo) : '—'}
        </span>
      ),
    },
    {
      key: 'changedBy',
      header: 'Changed by',
      secondary: true,
      render: (row) => (
        <span className="text-muted">{row.changedBy?.fullName ?? 'System'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      secondary: true,
      render: (row) => <span className="text-muted">{row.reason ?? '—'}</span>,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader
          title="Current price"
          description={isFree ? 'This course is free to join.' : undefined}
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {isFree ? 'Free' : formatMoney(currentPrice, currency)}
          </p>

          {canEdit ? (
            <>
              <Field
                label="New price"
                hint="Applies to future purchases and codes only. Historical revenue is never recalculated."
              >
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Reason" hint="Optional. Recorded in the price history and the audit log.">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                  />
                )}
              </Field>

              <Button
                onClick={() => setConfirming(true)}
                disabled={!valid || parsed === currentPrice}
              >
                Change price
              </Button>
            </>
          ) : (
            <p className="rounded-lg border border-border bg-surface-alt p-3 text-sm text-muted">
              Changing course prices is switched off for teachers on this platform. An
              administrator can enable it in Settings.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="lg:col-span-2">
        <DataTable
          columns={columns}
          rows={(history.data ?? []) as PriceVersion[]}
          rowKey={(row) => row.id}
          isLoading={history.isLoading}
          error={history.error}
          onRetry={() => void history.refetch()}
          caption="Price history"
          emptyTitle="No price versions recorded"
          emptyDescription="A version is written the first time a price is set."
        />
      </div>

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
        title="Change the price?"
        message={
          <>
            New purchases and newly generated codes will use{' '}
            <strong className="text-foreground">{formatMoney(parsed, currency)}</strong>. Every
            purchase already made keeps the amount it was charged, and reported revenue for past
            periods does not move.
          </>
        }
        confirmLabel="Change price"
        variant="primary"
        busy={changePrice.isPending}
      />
    </div>
  );
}

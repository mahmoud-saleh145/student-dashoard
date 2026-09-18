'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/data/data-table';
import { WalletDirectionBadge, WalletTxTypeBadge } from '@/components/data/status';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Drawer } from '@/components/ui/overlay';
import { Badge, DescriptionList, SectionTitle, StatTile } from '@/components/ui/primitives';
import { QueryState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { fieldErrors, messageFor } from '@/lib/errors';
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import type { WalletTxDirection, WalletTxRow } from '@/types/commerce';
import { WALLET_TX_SOURCE_LABEL } from '@/types/commerce';

import { useAdjustWallet, useWalletDetail, useWalletIntegrity } from './hooks';

/**
 * One student's wallet.
 *
 * Shows the balance, the recent ledger, and — on request — a reconciliation of
 * the two. It does not show what the credit was spent on beyond the ledger's
 * own source column, because that is the Library's report to give.
 */
export function WalletDrawer({
  userId,
  studentName,
  onClose,
}: {
  userId: string | null;
  studentName: string | null;
  onClose: () => void;
}) {
  const [checkIntegrity, setCheckIntegrity] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const detail = useWalletDetail(userId);
  const integrity = useWalletIntegrity(userId, checkIntegrity);

  const wallet = detail.data?.wallet;
  const rows = detail.data?.recent.items ?? [];

  return (
    <Drawer
      open={Boolean(userId)}
      onClose={() => {
        setCheckIntegrity(false);
        setAdjusting(false);
        onClose();
      }}
      title={studentName ?? 'Wallet'}
      description="Credit is spent on library material only. It cannot unlock a course."
      width="xl"
      footer={
        <Button variant="secondary" onClick={() => setAdjusting(true)} disabled={!wallet}>
          Adjust balance
        </Button>
      }
    >
      <QueryState
        isLoading={detail.isLoading}
        error={detail.error}
        isEmpty={!wallet}
        onRetry={() => void detail.refetch()}
      >
        {wallet ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Balance" value={formatMoney(wallet.balance)} tone="primary" />
              <StatTile
                label="Recharged"
                value={formatMoney(wallet.totalRecharged)}
                tone="success"
              />
              <StatTile label="Spent" value={formatMoney(wallet.totalSpent)} tone="info" />
            </div>

            <div>
              <SectionTitle
                actions={
                  !checkIntegrity ? (
                    <Button variant="ghost" size="sm" onClick={() => setCheckIntegrity(true)}>
                      Check integrity
                    </Button>
                  ) : null
                }
              >
                Reconciliation
              </SectionTitle>

              {checkIntegrity ? (
                <div className="pt-3">
                  <QueryState
                    isLoading={integrity.isLoading}
                    error={integrity.error}
                    isEmpty={!integrity.data}
                    onRetry={() => void integrity.refetch()}
                    loadingFallback={<div className="skeleton h-16 w-full rounded" />}
                  >
                    {integrity.data ? (
                      <div
                        className={
                          integrity.data.consistent
                            ? 'rounded-lg border border-success/30 bg-success-soft px-4 py-3'
                            : 'rounded-lg border border-danger/30 bg-danger-soft px-4 py-3'
                        }
                      >
                        <p
                          className={
                            integrity.data.consistent
                              ? 'text-sm font-medium text-success'
                              : 'text-sm font-medium text-danger'
                          }
                        >
                          {integrity.data.consistent
                            ? 'The ledger and the cached balance agree.'
                            : `Mismatch of ${formatMoney(integrity.data.difference)} — the cached balance disagrees with the sum of the entries.`}
                        </p>
                        <DescriptionList
                          className="mt-3"
                          columns={2}
                          items={[
                            {
                              label: 'From the ledger',
                              value: formatMoney(integrity.data.ledgerBalance),
                            },
                            {
                              label: 'Cached',
                              value: formatMoney(integrity.data.cachedBalance),
                            },
                            {
                              label: 'Total credited',
                              value: formatMoney(integrity.data.totalCredited),
                            },
                            {
                              label: 'Total debited',
                              value: formatMoney(integrity.data.totalDebited),
                            },
                          ]}
                        />
                      </div>
                    ) : null}
                  </QueryState>
                </div>
              ) : (
                <p className="pt-3 text-sm text-muted">
                  Re-adds every ledger entry and compares the result with the stored
                  balance. Run it when a figure looks wrong.
                </p>
              )}
            </div>

            <div>
              <SectionTitle>Recent activity</SectionTitle>
              <div className="pt-3">
                <LedgerTable rows={rows} />
              </div>
            </div>
          </div>
        ) : null}
      </QueryState>

      {userId ? (
        <AdjustDialog
          open={adjusting}
          userId={userId}
          studentName={studentName}
          currentBalance={wallet?.balance ?? 0}
          onClose={() => setAdjusting(false)}
        />
      ) : null}
    </Drawer>
  );
}

function LedgerTable({ rows }: { rows: WalletTxRow[] }) {
  const columns: Column<WalletTxRow>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <WalletTxTypeBadge type={row.type} />,
    },
    {
      key: 'source',
      header: 'Source',
      secondary: true,
      render: (row) => (
        <span className="text-muted">{WALLET_TX_SOURCE_LABEL[row.source]}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (row) => (
        <WalletDirectionBadge direction={row.direction}>
          {formatMoney(row.amount)}
        </WalletDirectionBadge>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Balance after',
      align: 'end',
      secondary: true,
      render: (row) => (
        <span className="tabular-nums">{formatMoney(row.balanceAfter)}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption="Wallet ledger"
      emptyTitle="No activity yet"
      emptyDescription="This wallet has never been credited or debited."
    />
  );
}

/**
 * A manual credit or debit.
 *
 * The reason is required by the backend and required here, because an
 * adjustment without one is a number in a ledger that nobody can explain a
 * month later. The direction is explicit rather than a signed amount: "−200"
 * typed into a box is too easy to get the wrong way round.
 */
function AdjustDialog({
  open,
  userId,
  studentName,
  currentBalance,
  onClose,
}: {
  open: boolean;
  userId: string;
  studentName: string | null;
  currentBalance: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const adjust = useAdjustWallet();

  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<WalletTxDirection>('CREDIT');
  const [reason, setReason] = useState('');

  const errors = fieldErrors(adjust.error);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 0.01 && reason.trim().length >= 5;

  const projected = direction === 'CREDIT' ? currentBalance + value : currentBalance - value;
  const wouldOverdraw = direction === 'DEBIT' && Number.isFinite(value) && projected < 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    adjust.mutate(
      { userId, amount: value, direction, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Wallet adjusted', `${studentName ?? 'The student'}’s balance changed.`);
          setAmount('');
          setReason('');
          onClose();
        },
        onError: (error) => toast.error(error, 'The adjustment was not applied'),
      },
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Adjust wallet balance"
      description="Writes an entry to the ledger carrying your name and your reason."
      width="md"
      busy={adjust.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="adjust-wallet"
            loading={adjust.isPending}
            disabled={!valid}
          >
            Apply adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-wallet" onSubmit={submit} className="space-y-4">
        <Field label="Direction" required>
          {({ id }) => (
            <Select
              id={id}
              value={direction}
              onChange={(event) => setDirection(event.target.value as WalletTxDirection)}
              options={[
                { value: 'CREDIT', label: 'Add credit' },
                { value: 'DEBIT', label: 'Remove credit' },
              ]}
            />
          )}
        </Field>

        <Field label="Amount" required error={errors.amount}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              trailing={<span className="text-xs">EGP</span>}
            />
          )}
        </Field>

        <Field
          label="Reason"
          required
          hint="At least five characters. Stored on the ledger entry."
          error={errors.reason}
        >
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Refund for a duplicate purchase reported in ticket #412"
            />
          )}
        </Field>

        <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Balance now</span>
            <span className="tabular-nums">{formatMoney(currentBalance)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-medium">
            <span>After this adjustment</span>
            <span className="tabular-nums">
              {Number.isFinite(value) ? formatMoney(projected) : '—'}
            </span>
          </div>
        </div>

        {wouldOverdraw ? (
          <p role="alert" className="text-sm font-medium text-danger">
            That would take the balance below zero. The backend will refuse it.
          </p>
        ) : null}

        {adjust.error && Object.keys(errors).length === 0 ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageFor(adjust.error)}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}

/** Small helper reused by the wallet tables for a student cell. */
export function StudentCell({
  student,
}: {
  student: { fullName: string; phone: string } | null | undefined;
}) {
  if (!student) return <span className="text-subtle">—</span>;

  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground">{student.fullName}</p>
      <p className="truncate text-xs text-muted">{formatPhone(student.phone)}</p>
    </div>
  );
}

export function EmptyCell() {
  return <Badge tone="neutral">—</Badge>;
}

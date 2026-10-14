import { formatMoney } from '@/lib/format';

/**
 * What one access card collected, as the code and batch screens show it.
 *
 * `0` is a free card. `null` means no amount was ever recorded — cards issued
 * before the amount was required — and it is shown as exactly that. It is
 * never replaced by the printed card price: a price is not a record of what a
 * student paid, and revenue never counts it.
 */
export function collectedLabel(amount: number | null | undefined, currency = 'EGP'): string {
  if (amount === null || amount === undefined) return 'Not recorded';
  if (amount === 0) return 'Free';
  return formatMoney(amount, currency);
}

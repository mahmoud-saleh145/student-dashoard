import { formatMoney } from '@/lib/format';

/**
 * An access card's issued price, as the code and batch screens show it.
 *
 * This is the price the card was sold for — the figure revenue reporting
 * counts when the card is first redeemed. It is not the course or part
 * catalogue price, and it never decides whether the card unlocks anything.
 *
 * `0` is a free card. `null` means the card was issued without a price, and it
 * is shown as exactly that — never filled in from a catalogue price.
 */
export function cardPriceLabel(amount: number | null | undefined, currency = 'EGP'): string {
  if (amount === null || amount === undefined) return 'Not recorded';
  if (amount === 0) return 'Free';
  return formatMoney(amount, currency);
}

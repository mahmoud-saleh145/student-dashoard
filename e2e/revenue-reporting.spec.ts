import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Revenue from the issued card price.
 *
 *   code sales = each paid card's issued price (`priceAmount`), once, at its
 *                first redemption — never the catalogue price
 *   revenue    = code sales + wallet top-ups + online payments (net)
 *   profit     = revenue
 *   purchases  = paid card sales only
 *
 * The stub's figures are all different numbers (see DASHBOARD_STATS in the
 * stub), so a tile that showed one field under another's label fails here.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

/** A StatTile: its label, value and hint, by the label's exact text. */
const tile = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('..');
const tileValue = (page: Page, label: string) => tile(page, label).locator('p').nth(1);

test.describe('Statistics: revenue', () => {
  test.beforeEach(async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
  });

  test('total revenue is code sales plus wallet top-ups plus online payments', async ({ page }) => {
    const total = tile(page, 'Total revenue');
    await expect(total).toContainText('52,500');
    await expect(total).toContainText(/Codes.+18,000.+Wallet top-ups.+5,000.+Online.+29,500/);
  });

  test('shows each source for the period, and profit equal to revenue', async ({ page }) => {
    await expect(tileValue(page, 'Revenue in period')).toContainText('12,400');
    await expect(tileValue(page, 'Code sales')).toContainText('4,200');
    await expect(tile(page, 'Code sales')).toContainText('7 paid cards redeemed');
    await expect(tileValue(page, 'Wallet top-ups')).toContainText('1,000');
    await expect(tile(page, 'Wallet top-ups')).toContainText('2 recharge cards redeemed');
    await expect(tileValue(page, 'Profit')).toContainText('12,400');
    await expect(tile(page, 'Profit')).toContainText('no expenses');
  });

  test('purchases are paid card sales only — not top-ups, not online payments', async ({ page }) => {
    // 7 paid cards. Not 9 (with the 2 top-ups) and not 120 (online payments).
    await expect(tileValue(page, 'Paid purchases')).toHaveText('7');
    await expect(tile(page, 'Paid purchases')).toContainText('36 all time');
  });

  test('free and unrecorded redemptions are shown apart from revenue', async ({ page }) => {
    await expect(tileValue(page, 'Free activations')).toHaveText('3');
    await expect(tile(page, 'Free activations')).toContainText('12 all time');
    await expect(tile(page, 'Free activations')).toContainText('not revenue');

    await expect(tileValue(page, 'Amount not recorded')).toHaveText('2');
    await expect(tile(page, 'Amount not recorded')).toContainText('30 all time');
  });

  test('the revenue chart draws the series the API returns', async ({ page }) => {
    // The API returns a bare array of days. The chart used to read it as
    // `{ points }` and so always said there was no revenue.
    await expect(page.getByText('No revenue recorded in this period.')).toHaveCount(0);
    // Code sales, wallet top-ups and online payments: one stacked area each.
    await expect(page.locator('.recharts-area')).toHaveCount(3);
  });
});

async function openGenerate(page: Page) {
  await page.goto('/codes');
  await page.getByRole('button', { name: /generate codes/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Course').selectOption('course-1');
  return dialog;
}

test.describe('Generate codes: the card price', () => {
  test('will not generate until a whole-EGP price is entered or the cards are marked free', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerate(page);
    const generate = dialog.getByRole('button', { name: /^Generate \d* ?codes$/ });
    const price = dialog.getByLabel('Card price');

    // No default: cards issued without a price are what left sales unreportable.
    await expect(generate).toBeDisabled();

    // The API takes whole EGP; 0 is spelled "Free cards", not typed.
    for (const bad of ['0', '10.5']) {
      await price.fill(bad);
      await expect(dialog.getByRole('alert')).toContainText('whole number of EGP');
      await expect(generate).toBeDisabled();
    }

    await price.fill('600');
    await expect(generate).toBeEnabled();

    await price.fill('');
    await expect(generate).toBeDisabled();
    await dialog.getByRole('switch', { name: 'Free cards' }).click();
    await expect(price).toBeDisabled();
    await expect(generate).toBeEnabled();
  });

  test('sends the price as priceAmount — nothing else — and shows it on the result', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerate(page);

    // Below the course's catalogue price (250): the card's own price is sent,
    // and nothing in the request is derived from the catalogue.
    await dialog.getByLabel('Card price').fill('200');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/proxy/admin/codes/generate')),
      dialog.getByRole('button', { name: /^Generate \d* ?codes$/ }).click(),
    ]);

    const sent = await (
      await page.request.get(`${STUB_API}/api/v1/__test__/last-generate-codes`)
    ).json();
    expect(sent.data.priceAmount).toBe(200);
    expect(sent.data).not.toHaveProperty('amountCollected');
    expect(sent.data).not.toHaveProperty('free');

    await expect(dialog).toContainText(/200 per card/);
  });

  test('free cards are sent as a price of 0 and say so on the result', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerate(page);

    await dialog.getByRole('switch', { name: 'Free cards' }).click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/proxy/admin/codes/generate')),
      dialog.getByRole('button', { name: /^Generate \d* ?codes$/ }).click(),
    ]);

    const sent = await (
      await page.request.get(`${STUB_API}/api/v1/__test__/last-generate-codes`)
    ).json();
    expect(sent.data.priceAmount).toBe(0);
    expect(sent.data).not.toHaveProperty('free');

    await expect(dialog).toContainText('Free cards');
  });
});

test.describe('Codes and batches: the card price', () => {
  test('the code list shows each card’s issued price, Free, or Not recorded', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/codes');

    const row = (prefix: string) => page.getByRole('row').filter({ hasText: prefix });

    // Issued at 200 for a course whose catalogue price is 250: the card's
    // own price is shown, not the catalogue's.
    await expect(row('ABCD')).toContainText(/EGP.200/);
    await expect(row('ABCD')).not.toContainText(/EGP.250/);
    await expect(row('FREE')).toContainText('Free');
    // Issued without a price: unknown, never filled in from the catalogue.
    await expect(row('OLDC')).toContainText('Not recorded');
    await expect(row('OLDC')).not.toContainText(/EGP.250/);
  });

  test('the batch list shows the same per-card price', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/code-batches');

    const row = (text: string) => page.getByRole('row').filter({ hasText: text });

    await expect(row('Term 1 cards')).toContainText(/EGP.200/);
    await expect(row('Scholarship cards')).toContainText('Free');
    await expect(row('batch-3')).toContainText('Not recorded');
  });
});

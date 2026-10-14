import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Revenue as money actually collected.
 *
 *   revenue   = code sales + wallet top-ups + online payments (net)
 *   profit    = revenue
 *   purchases = paid card sales only
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

test.describe('Generate codes: the amount collected', () => {
  test('will not generate until an amount is entered or the cards are marked free', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerate(page);
    const generate = dialog.getByRole('button', { name: /^Generate \d* ?codes$/ });
    const amount = dialog.getByLabel('Amount collected per card');

    // No default: an empty amount is how earlier cards ended up unrecorded.
    await expect(generate).toBeDisabled();

    for (const bad of ['0', '10.005']) {
      await amount.fill(bad);
      await expect(dialog.getByRole('alert')).toContainText('at most 2 decimals');
      await expect(generate).toBeDisabled();
    }

    await amount.fill('600');
    await expect(generate).toBeEnabled();

    await amount.fill('');
    await expect(generate).toBeDisabled();
    await dialog.getByRole('switch', { name: 'Free cards' }).click();
    await expect(amount).toBeDisabled();
    await expect(generate).toBeEnabled();
  });

  test('sends the amount, never a card price, and shows it on the result', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerate(page);

    await dialog.getByLabel('Amount collected per card').fill('600');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/proxy/admin/codes/generate')),
      dialog.getByRole('button', { name: /^Generate \d* ?codes$/ }).click(),
    ]);

    const sent = await (
      await page.request.get(`${STUB_API}/api/v1/__test__/last-generate-codes`)
    ).json();
    expect(sent.data.amountCollected).toBe(600);
    expect(sent.data.free).toBeUndefined();
    expect(sent.data.priceAmount).toBeUndefined();

    await expect(dialog).toContainText(/600 collected per card/);
  });

  test('free cards send free: true and say so on the result', async ({ page, signIn }) => {
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
    expect(sent.data.free).toBe(true);
    expect(sent.data.amountCollected).toBeUndefined();

    await expect(dialog).toContainText('Free cards');
  });
});

test.describe('Codes and batches: what was collected', () => {
  test('the code list shows the amount collected, Free, or Not recorded', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/codes');

    const row = (prefix: string) => page.getByRole('row').filter({ hasText: prefix });

    // Collected 200 on a card printed at 250: the collected amount is shown.
    await expect(row('ABCD')).toContainText(/EGP.200/);
    await expect(row('ABCD')).not.toContainText(/EGP.250/);
    await expect(row('FREE')).toContainText('Free');
    // A legacy card printed at 1,000: unknown, not 1,000.
    await expect(row('OLDC')).toContainText('Not recorded');
    await expect(row('OLDC')).not.toContainText('1,000');
  });

  test('the batch list shows the collected amount beside the card price', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/code-batches');

    const row = (text: string) => page.getByRole('row').filter({ hasText: text });

    await expect(row('Term 1 cards')).toContainText(/EGP.200/);
    await expect(row('Term 1 cards')).toContainText(/EGP.250/);
    await expect(row('Scholarship cards')).toContainText('Free');
    await expect(row('batch-3')).toContainText('Not recorded');
  });
});

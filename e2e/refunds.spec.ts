import type { Page } from '@playwright/test';

import { expect, forbidPath, resetStub, test } from './fixtures';

/**
 * Refunding a course payment from the course's Students tab.
 *
 * The stub models the API's rules: an immediate refund (the default) is
 * recorded as completed only with the admin's explicit confirmation that the
 * money was returned; a pending refund reserves the amount until it is
 * completed or failed; amounts are exact to the piastre; every refund request
 * revokes the student's access; and nothing claims money was sent.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

async function openRefund(page: Page, student: string, item = 'Refund') {
  await page.goto('/courses/course-1?tab=students');
  await page.getByRole('button', { name: `Actions for ${student}` }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Refund payment' });
  await expect(dialog.getByTestId('refund-balance')).toBeVisible();
  return dialog;
}

const finalStep = (page: Page) => page.getByRole('dialog', { name: 'Confirm refund' });

function row(page: Page, student: string) {
  return page.getByRole('row').filter({ hasText: student });
}

test('is not offered for a code enrollment, which has no payment', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto('/courses/course-1?tab=students');
  await page.getByRole('button', { name: 'Actions for Sara Student' }).click();

  await expect(page.getByRole('menuitem', { name: 'Remove from course' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Refund/ })).toHaveCount(0);
});

test('immediate is the default and needs a final confirmation that the money was returned', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  const dialog = await openRefund(page, 'Omar Hassan');

  const immediate = dialog.getByRole('switch', { name: /Confirm refund immediately/ });
  await expect(immediate).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByTestId('refund-consequences')).toContainText('loses access');
  await expect(dialog.getByTestId('refund-consequences')).toContainText('does not send money');

  let sent = false;
  page.on('request', (r) => {
    if (r.url().endsWith('/refund')) sent = true;
  });

  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const confirm = finalStep(page);
  const summary = confirm.getByTestId('refund-final-confirmation');
  await expect(summary).toContainText('Completed refund of EGP');
  await expect(summary).toContainText('300');
  await expect(summary).toContainText('Omar Hassan loses access to Anatomy I immediately');
  await expect(summary).toContainText('admin-confirmed manual refund');

  // Back leaves without sending; the final button waits for the attestation.
  await confirm.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const submit = confirm.getByRole('button', { name: /Confirm completed refund of EGP.300/ });
  await expect(submit).toBeDisabled();
  expect(sent).toBe(false);

  await confirm.getByRole('checkbox', { name: /I confirm EGP.300 has actually been returned to Omar Hassan/ }).check();
  const request = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/admin/payments/pay-manual/refund'),
  );
  await submit.click();
  const body = (await request).postDataJSON();
  expect(body).toMatchObject({ type: 'FULL', completion: 'IMMEDIATE', confirmMoneyReturned: true });
  expect(body.amount).toBeUndefined();
  expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,100}$/);

  await expect(page.getByText('Refund of EGP 300 completed')).toBeVisible();
  await expect(row(page, 'Omar Hassan')).toContainText(/revoked/i);

  const history = await openRefund(page, 'Omar Hassan', 'Refund history');
  await expect(history.getByText('This payment has been fully refunded')).toBeVisible();
  await expect(history.getByTestId('refund-history')).toContainText('Completed');
  await expect(history.getByTestId('refund-history')).toContainText('Admin-confirmed manual refund');
});

test('a partial immediate refund validates the amount exactly and leaves the rest refundable', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  const dialog = await openRefund(page, 'Omar Hassan');

  await dialog.getByLabel('Partial refund').check();
  const amount = dialog.getByRole('textbox', { name: /Refund amount/ });

  for (const [value, message] of [
    ['0', 'greater than 0'],
    ['10.005', 'at most 2 decimal places'],
    ['300.01', 'At most EGP.300'],
    ['abc', 'at most 2 decimal places'],
  ] as const) {
    await amount.fill(value);
    await expect(dialog.getByText(new RegExp(message))).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Review refund' })).toBeDisabled();
  }

  await amount.fill('120.5');
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Missed the second half');
  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const confirm = finalStep(page);
  await confirm.getByRole('checkbox', { name: /I confirm EGP.120.50 has actually been returned/ }).check();

  const request = page.waitForRequest((r) => r.url().endsWith('/refund'));
  await confirm.getByRole('button', { name: /Confirm completed refund of EGP.120.50/ }).click();
  expect((await request).postDataJSON()).toMatchObject({
    type: 'PARTIAL',
    amount: '120.50',
    reason: 'Missed the second half',
    completion: 'IMMEDIATE',
    confirmMoneyReturned: true,
  });
  await expect(page.getByText('Refund of EGP 120.50 completed')).toBeVisible();
  // A partial refund revokes access too.
  await expect(row(page, 'Omar Hassan')).toContainText(/revoked/i);

  const again = await openRefund(page, 'Omar Hassan');
  await expect(again.getByTestId('refund-balance')).toContainText('179.50');
});

test('pending mode: no attestation, reserves the amount, then completes with one', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  const dialog = await openRefund(page, 'Omar Hassan');

  await dialog.getByRole('switch', { name: /Confirm refund immediately/ }).click();
  await expect(dialog.getByRole('switch', { name: /Confirm refund immediately/ })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByTestId('refund-consequences')).toContainText('nothing changes until the pending refund is marked completed');

  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const confirm = finalStep(page);
  await expect(confirm.getByTestId('refund-final-confirmation')).toContainText('Pending refund of EGP');
  await expect(confirm.getByTestId('refund-final-confirmation')).toContainText('loses access');
  await expect(confirm.getByRole('checkbox')).toHaveCount(0);

  const request = page.waitForRequest((r) => r.url().endsWith('/refund'));
  await confirm.getByRole('button', { name: /Record pending refund of EGP.300/ }).click();
  const body = (await request).postDataJSON();
  expect(body).toMatchObject({ type: 'FULL', completion: 'PENDING' });
  expect(body.confirmMoneyReturned).toBeUndefined();

  await expect(page.getByText('Pending refund of EGP 300 recorded')).toBeVisible();
  await expect(row(page, 'Omar Hassan')).toContainText(/revoked/i);
  // The list says the refund is pending — and does not call the payment
  // refunded, because no money has gone back yet.
  await expect(row(page, 'Omar Hassan')).toContainText('Refund pending');
  await expect(row(page, 'Omar Hassan').getByText('Refunded', { exact: true })).toHaveCount(0);

  const pending = await openRefund(page, 'Omar Hassan');
  await expect(pending.getByTestId('refund-balance')).toContainText('Pending (reserved)');
  await expect(pending.getByText(/Nothing more can be refunded until the pending refund/)).toBeVisible();
  const history = pending.getByTestId('refund-history');
  await expect(history).toContainText('Pending — not refunded yet');

  const markCompleted = history.getByRole('button', { name: 'Mark completed' });
  await expect(markCompleted).toBeDisabled();
  await history.getByRole('checkbox', { name: /has actually been returned to the student/ }).check();
  const complete = page.waitForRequest((r) => r.url().endsWith('/complete'));
  await markCompleted.click();
  expect((await complete).postDataJSON()).toEqual({ confirmMoneyReturned: true });

  await expect(page.getByText('Refund marked completed')).toBeVisible();
  await expect(history).toContainText('Completed');
  await expect(history).toContainText('Admin-confirmed manual refund');

  await pending.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(row(page, 'Omar Hassan').getByText('Refunded', { exact: true })).toBeVisible();
  await expect(row(page, 'Omar Hassan')).not.toContainText('Refund pending');
});

test('a provider payment is labelled an admin-confirmed external refund, never sent through the provider', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  const dialog = await openRefund(page, 'Laila Online');

  await expect(dialog.getByTestId('refund-immediate')).toContainText('admin-confirmed external refund');
  await expect(dialog.getByTestId('refund-immediate')).toContainText('nothing is sent through PAYMOB');

  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const confirm = finalStep(page);
  await expect(confirm.getByTestId('refund-final-confirmation')).toContainText(
    'No money is sent through PAYMOB from here',
  );
  await confirm.getByRole('checkbox', { name: /I confirm EGP.450 has actually been returned/ }).check();
  await confirm.getByRole('button', { name: /Confirm completed refund of EGP.450/ }).click();
  await expect(page.getByText('Refund of EGP 450 completed')).toBeVisible();

  const history = await openRefund(page, 'Laila Online', 'Refund history');
  await expect(history.getByTestId('refund-history')).toContainText('Admin-confirmed external refund');
});

test('a failed pending refund frees the amount but keeps access revoked', async ({ page, signIn }) => {
  await signIn('admin');
  const dialog = await openRefund(page, 'Laila Online');
  await dialog.getByRole('switch', { name: /Confirm refund immediately/ }).click();
  await dialog.getByRole('button', { name: 'Review refund' }).click();
  await finalStep(page).getByRole('button', { name: /Record pending refund of EGP.450/ }).click();
  await expect(page.getByText('Pending refund of EGP 450 recorded')).toBeVisible();

  const pending = await openRefund(page, 'Laila Online');
  const history = pending.getByTestId('refund-history');
  await history.getByRole('textbox', { name: 'Why it failed' }).fill('Card account closed');
  await history.getByRole('button', { name: 'Mark failed' }).click();

  await expect(page.getByText('Refund marked failed')).toBeVisible();
  await expect(history).toContainText('Failed — reservation released');
  await expect(pending.getByRole('button', { name: 'Review refund' })).toBeEnabled();
  await pending.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Laila Online')).toContainText(/revoked/i);
});

test('an API refusal is reported and changes nothing', async ({ page, signIn }) => {
  await signIn('admin');
  await forbidPath(page, '/admin/payments/pay-manual/refund');
  const dialog = await openRefund(page, 'Omar Hassan');

  await dialog.getByRole('button', { name: 'Review refund' }).click();
  const confirm = finalStep(page);
  await confirm.getByRole('checkbox', { name: /I confirm/ }).check();
  await confirm.getByRole('button', { name: /Confirm completed refund/ }).click();

  await expect(page.getByText('The refund was not recorded')).toBeVisible();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Back' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Omar Hassan')).not.toContainText(/revoked/i);
});

test('Statistics shows revenue in the period net of completed refunds', async ({ page, signIn }) => {
  await signIn('admin');
  await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();

  // The stub's period: 7,500 of online sales and 300 of completed refunds.
  // Refunds live in the online-payment ledger, so that is the tile they move.
  const online = page.getByText('Online payments', { exact: true }).locator('..');
  await expect(online).toContainText('7,200');
  await expect(online).toContainText(/7,500.*sales.*300.*refunded/);

  // And the period's revenue counts the net, never the gross:
  // 4,200 code sales + 1,000 wallet top-ups + 7,200 online = 12,400.
  const revenue = page.getByText('Revenue in period', { exact: true }).locator('..');
  await expect(revenue).toContainText('12,400');
});

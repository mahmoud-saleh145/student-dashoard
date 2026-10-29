import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Resetting a student's password from the student drawer.
 *
 * Students cannot change or recover their own password; a MASTER or ADMIN
 * sets a new one here after the student contacts support. These journeys run
 * the real dashboard (production build, real proxy) against the stub API,
 * which enforces the same role gate as the backend's @AdminOnly().
 *
 * The request is asserted at the stub, so "it worked" means the dashboard
 * really sent `PUT /admin/users/:id/password` with `{ newPassword, note }` —
 * not that a mock in the page said so.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;
const DASHBOARD_PUT = { 'x-dashboard-request': '1', 'content-type': 'application/json' } as const;

const STRONG = 'Granite7Harbor';

async function lastReset(page: Page) {
  const response = await page.request.get(`${STUB_API}/__test__/student-password/last`);
  const body = (await response.json()) as {
    data: { userId: string; body: Record<string, unknown>; actorId: string } | null;
  };
  return body.data;
}

async function arm(page: Page, control: 'fail-server' | 'reject-policy') {
  await page.request.get(`${STUB_API}/__test__/student-password/${control}`);
}

async function openResetDialog(page: Page) {
  await page.goto('/students');
  await page.getByRole('button', { name: 'Sara Student' }).first().click();

  const drawer = page.getByRole('dialog', { name: 'Sara Student' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Reset password' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset password' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await resetStub(page);
  await page.request.get(`${STUB_API}/__test__/student-password/reset`);
});

test.describe('an administrator', () => {
  test('resets a student password: enter, confirm, done', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openResetDialog(page);

    await dialog.getByLabel(/^New password/).fill(STRONG);
    await dialog.getByLabel(/^Confirm new password/).fill(STRONG);
    await dialog.getByLabel(/^Note for the audit log/).fill('Verified by phone call');
    await dialog.getByRole('button', { name: 'Continue' }).click();

    // An explicit second step before anything is sent.
    const confirm = page.getByRole('dialog', { name: 'Reset this student’s password?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('signed out of every device');
    expect(await lastReset(page)).toBeNull();

    await confirm.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByText('Password reset', { exact: true })).toBeVisible();
    await expect(confirm).toBeHidden();

    // The real endpoint, the documented body, nothing else — the confirmation
    // stays in the browser.
    const sent = await lastReset(page);
    expect(sent).toEqual({
      userId: 'stu-1',
      actorId: 'user-admin',
      body: { newPassword: STRONG, note: 'Verified by phone call' },
    });

    // The audit trail shows who did it.
    const drawer = page.getByRole('dialog', { name: 'Sara Student' });
    await drawer.getByRole('tab', { name: 'Admin history' }).click();
    await expect(drawer.getByText('password reset', { exact: true })).toBeVisible();
    await expect(drawer.getByText(/by Amira Admin — Verified by phone call/)).toBeVisible();
  });

  test('is told what is wrong with a password before anything is sent', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openResetDialog(page);

    const password = dialog.getByLabel(/^New password/);
    const confirm = dialog.getByLabel(/^Confirm new password/);

    await password.fill('short1A');
    await expect(dialog.getByText('Use between 8 and 128 characters.')).toBeVisible();

    await password.fill('Aa123456');
    await expect(dialog.getByText(/too easy to guess/)).toBeVisible();

    await password.fill('granite7harbor');
    await expect(dialog.getByText(/Include an uppercase and a lowercase letter/)).toBeVisible();

    await password.fill(STRONG);
    await confirm.fill(`${STRONG}x`);
    await expect(dialog.getByText('The passwords do not match.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('dialog', { name: 'Reset this student’s password?' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await confirm.fill(STRONG);
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled();

    expect(await lastReset(page)).toBeNull();
  });

  test('sees a server failure in the dialog, and no success message', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await arm(page, 'fail-server');
    const dialog = await openResetDialog(page);

    await dialog.getByLabel(/^New password/).fill(STRONG);
    await dialog.getByLabel(/^Confirm new password/).fill(STRONG);
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await page
      .getByRole('dialog', { name: 'Reset this student’s password?' })
      .getByRole('button', { name: 'Reset password' })
      .click();

    // Back on the first step, with the failure stated and the input kept.
    await expect(dialog.getByRole('alert')).toContainText('The password was not changed.');
    await expect(dialog.getByLabel(/^New password/)).toHaveValue(STRONG);
    await expect(page.getByText('Password reset', { exact: true })).toHaveCount(0);
  });

  test('sees the API’s own password-policy rejection next to the field', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await arm(page, 'reject-policy');
    const dialog = await openResetDialog(page);

    await dialog.getByLabel(/^New password/).fill(STRONG);
    await dialog.getByLabel(/^Confirm new password/).fill(STRONG);
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await page
      .getByRole('dialog', { name: 'Reset this student’s password?' })
      .getByRole('button', { name: 'Reset password' })
      .click();

    await expect(dialog.getByText(/too easy to guess/)).toBeVisible();
    await expect(page.getByText('Password reset', { exact: true })).toHaveCount(0);
  });

  test('cannot submit twice while the request is in flight', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openResetDialog(page);

    // Hold the request so the in-flight state can be observed.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/proxy/admin/users/stu-1/password', async (route) => {
      await held;
      await route.continue();
    });

    await dialog.getByLabel(/^New password/).fill(STRONG);
    await dialog.getByLabel(/^Confirm new password/).fill(STRONG);
    await dialog.getByRole('button', { name: 'Continue' }).click();

    const confirm = page.getByRole('dialog', { name: 'Reset this student’s password?' });
    const submit = confirm.getByRole('button', { name: 'Reset password' });
    await submit.click();

    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(confirm.getByRole('button', { name: 'Back' })).toBeDisabled();

    release();
    await expect(page.getByText('Password reset', { exact: true })).toBeVisible();
  });
});

test.describe('the master', () => {
  test('resets a student password too', async ({ page, signIn }) => {
    await signIn('master');
    const dialog = await openResetDialog(page);

    await dialog.getByLabel(/^New password/).fill(STRONG);
    await dialog.getByLabel(/^Confirm new password/).fill(STRONG);
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await page
      .getByRole('dialog', { name: 'Reset this student’s password?' })
      .getByRole('button', { name: 'Reset password' })
      .click();

    await expect(page.getByText('Password reset', { exact: true })).toBeVisible();
    expect((await lastReset(page))?.actorId).toBe('user-master');
  });
});

test.describe('a teacher', () => {
  test('is offered no way to reset a student password', async ({ page, signIn }) => {
    await signIn('teacher');
    await page.goto('/students');
    await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
  });

  test('is refused by the API when calling the reset directly', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    // Called through the dashboard proxy, exactly as a hostile client would.
    const response = await page.request.put('/api/proxy/admin/users/stu-1/password', {
      headers: DASHBOARD_PUT,
      data: { newPassword: STRONG },
    });

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INSUFFICIENT_ROLE');
  });
});

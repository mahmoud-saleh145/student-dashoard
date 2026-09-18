import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared fixtures.
 *
 * `signIn` goes through the real login form rather than seeding a cookie: the
 * cookie is set by the application's own route handler, and a test that
 * bypassed it would stop covering the thing most likely to break.
 */

export const ACCOUNTS = {
  master: { phone: '01000000001', password: 'master-pass', name: 'Master Owner' },
  admin: { phone: '01000000002', password: 'admin-pass', name: 'Amira Admin' },
  teacher: { phone: '01000000003', password: 'teacher-pass', name: 'Tarek Teacher' },
  student: { phone: '01000000004', password: 'student-pass', name: 'Sara Student' },
  disabled: { phone: '01000000005', password: 'disabled-pass', name: 'Dalia Disabled' },
} as const;

export type AccountName = keyof typeof ACCOUNTS;

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

export const test = base.extend<{ signIn: (account: AccountName) => Promise<void> }>({
  signIn: async ({ page }, use) => {
    await use(async (account: AccountName) => {
      const { phone, password } = ACCOUNTS[account];

      await page.goto('/login');
      await page.getByLabel('Phone number').fill(phone);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for the sign-in attempt to settle before handing control back.
      // Without this a test that navigates immediately races the login
      // redirect, and its own `goto` is cancelled — which looks like a broken
      // page rather than a test that moved too early.
      //
      // Accounts that are meant to be refused stay on /login, so this waits
      // for either outcome rather than assuming success.
      await page
        .waitForFunction(
          () =>
            !window.location.pathname.startsWith('/login') ||
            document.querySelector('form [role="alert"]') !== null,
          undefined,
          { timeout: 15_000 },
        )
        .catch(() => undefined);
    });
  },
});

export { expect };

/** Resets the stub API's control flags between tests. */
export async function resetStub(page: Page): Promise<void> {
  await page.request.get(`${STUB_API}/__test__/reset`);
}

export async function armExpiredToken(page: Page): Promise<void> {
  await page.request.get(`${STUB_API}/__test__/expire-access-token`);
}

export async function forbidPath(page: Page, path: string): Promise<void> {
  await page.request.get(`${STUB_API}/__test__/forbid?path=${encodeURIComponent(path)}`);
}

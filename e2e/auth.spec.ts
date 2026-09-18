import { ACCOUNTS, expect, resetStub, test } from './fixtures';

/**
 * Authentication.
 *
 * The property under test is not "login works" — it is **who is let in**. The
 * stub API authenticates a student perfectly happily; the dashboard is what
 * refuses them, and if that refusal ever regresses these tests fail rather
 * than a student quietly reaching a staff interface.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

test.describe('sign in', () => {
  for (const role of ['master', 'admin', 'teacher'] as const) {
    test(`a ${role} can sign in and reach the dashboard`, async ({ page, signIn }) => {
      await signIn(role);

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText(ACCOUNTS[role].name).first()).toBeVisible();
    });
  }

  test('a student is refused, with a reason', async ({ page, signIn }) => {
    await signIn('student');

    // Still on the login screen — not on the dashboard with empty panels.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('form').getByRole('alert')).toContainText(/staff accounts only/i);
  });

  test('a suspended staff account is refused', async ({ page, signIn }) => {
    await signIn('disabled');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('form').getByRole('alert')).toContainText(/not active/i);
  });

  test('wrong credentials give a clear error and no session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Phone number').fill(ACCOUNTS.admin.phone);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText(/incorrect/i);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'edu_at')).toBeUndefined();
  });

  test('an invalid phone number is caught before the request is sent', async ({ page }) => {
    let requested = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/login')) requested = true;
    });

    await page.goto('/login');
    await page.getByLabel('Phone number').fill('12345');
    await page.getByLabel('Password').fill('whatever');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/valid Egyptian mobile/i)).toBeVisible();
    expect(requested).toBe(false);
  });
});

test.describe('session cookies', () => {
  test('tokens are stored HTTP-only and are unreadable from the page', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const cookies = await page.context().cookies();
    const access = cookies.find((cookie) => cookie.name === 'edu_at');
    const refresh = cookies.find((cookie) => cookie.name === 'edu_rt');

    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
    expect(access?.sameSite).toBe('Lax');

    // The decisive check: script on the page cannot see them at all.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('edu_at');
    expect(visible).not.toContain('edu_rt');
  });

  test('no access token is exposed anywhere in the page payload', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const html = await page.content();
    expect(html).not.toContain('stub.user-admin');
    expect(html).not.toContain('refresh.user-admin');
  });
});

test.describe('sign out', () => {
  test('clears the session and returns to the login screen', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: new RegExp(ACCOUNTS.admin.name, 'i') }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'edu_at')).toBeUndefined();
    expect(cookies.find((cookie) => cookie.name === 'edu_pf')).toBeUndefined();
  });
});

test.describe('unauthenticated access', () => {
  const guarded = ['/', '/courses', '/students', '/codes', '/settings', '/admins', '/logs'];

  for (const path of guarded) {
    test(`${path} redirects to the login screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

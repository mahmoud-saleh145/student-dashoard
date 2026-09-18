import { armExpiredToken, expect, resetStub, test } from './fixtures';

/**
 * The API proxy.
 *
 * Everything the browser can reach goes through this one route, so its
 * behaviour is worth pinning down: which upstream paths it will not forward,
 * what it demands of a mutating request, and what it does when the access
 * token has expired underneath a user who is still working.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

test.describe('CSRF defences', () => {
  test('a mutating request without the dashboard header is refused', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    // A cross-site form post carries cookies but cannot set a custom header.
    const response = await page.request.put('/api/proxy/admin/settings', {
      data: { settings: { 'student.deviceLimit': 5 } },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/dashboard request header/i);
  });

  test('the same request succeeds with the header', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.put('/api/proxy/admin/settings', {
      data: { settings: { 'student.deviceLimit': 2 } },
      headers: { 'content-type': 'application/json', 'x-dashboard-request': '1' },
    });

    expect(response.ok()).toBe(true);
  });

  test('a mutating request from another origin is refused', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.put('/api/proxy/admin/settings', {
      data: { settings: {} },
      headers: {
        'content-type': 'application/json',
        'x-dashboard-request': '1',
        origin: 'https://not-this-dashboard.example',
      },
    });

    expect(response.status()).toBe(403);
  });

  test('reads are not blocked by the header rule', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get('/api/proxy/analytics/dashboard');
    expect(response.ok()).toBe(true);
  });
});

test.describe('blocked upstream paths', () => {
  // These exist for the mobile app and the login route. Reaching them with a
  // staff session would either bypass the cookie design or hand an
  // administrator a playback ticket, which is the one thing the content
  // protection is built to prevent.
  const blocked = [
    'auth/login',
    'auth/refresh',
    'auth/logout',
    'playback/videos/abc/ticket',
    'media/anything',
    'payments/webhooks/paymob',
  ];

  for (const path of blocked) {
    test(`${path} is not reachable through the proxy`, async ({ page, signIn }) => {
      await signIn('admin');
      await expect(page).toHaveURL(/\/$/);

      const response = await page.request.post(`/api/proxy/${path}`, {
        data: {},
        headers: { 'content-type': 'application/json', 'x-dashboard-request': '1' },
      });

      expect(response.status()).toBe(403);
    });
  }

  test('a path traversal attempt is rejected', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get('/api/proxy/admin/..%2F..%2Fsecret');
    expect(response.ok()).toBe(false);
  });
});

test.describe('token expiry', () => {
  test('an expired access token is refreshed and the request retried', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    // The next upstream call answers 401 once, exactly as an expired token
    // would. The proxy should refresh and retry without the caller noticing.
    await armExpiredToken(page);

    const response = await page.request.get('/api/proxy/analytics/dashboard');

    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { data: { users: { students: number } } };
    expect(body.data.users.students).toBeGreaterThan(0);
  });

  test('a request with no session at all is refused', async ({ page }) => {
    await page.context().clearCookies();

    const response = await page.request.get('/api/proxy/analytics/dashboard');
    expect(response.status()).toBe(401);
  });
});

test.describe('unsupported methods', () => {
  test('an unsupported verb is refused', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.fetch('/api/proxy/admin/settings', {
      method: 'HEAD',
    });

    // Next answers 405 for a verb with no exported handler.
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

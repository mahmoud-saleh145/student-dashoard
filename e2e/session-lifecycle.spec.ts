import {
  ACCOUNTS,
  breakRefreshTransport,
  disableAccount,
  expect,
  forbidPath,
  rejectRefresh,
  resetStub,
  restoreRefreshTransport,
  staleAccessToken,
  revokeSession,
  stubRequests,
  test,
} from './fixtures';

/**
 * What happens to a session that stops being valid.
 *
 * Signing in is covered in `auth.spec.ts`. This file covers the other end: the
 * cases where a session that was good a moment ago is no longer accepted, and
 * the one case that looks identical from the outside but must be treated
 * completely differently — a legitimate 403.
 *
 * These run against a real build with real cookies and the real proxy. The
 * only thing standing in for production is the upstream API, which is what
 * lets a test *demand* a revoked session rather than waiting for one.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

// ---------------------------------------------------------------------------
// No session at all
// ---------------------------------------------------------------------------

test.describe('no session', () => {
  const PROTECTED = [
    '/',
    '/students',
    '/teachers',
    '/courses',
    '/library',
    '/settings',
    '/codes',
    '/support',
  ];

  for (const path of PROTECTED) {
    test(`${path} sends a signed-out visitor to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    });
  }

  test('a deep protected URL is remembered and returned to after signing in', async ({
    page,
  }) => {
    // The case that motivated the middleware: pasting a link while signed out
    // used to land on the home screen, having forgotten where you were going.
    await page.goto('/courses/crs_1?tab=content');

    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/courses/crs_1?tab=content');

    // Signed in on *this* page rather than through the `signIn` fixture: that
    // fixture navigates to a bare /login first, which would throw away the
    // very parameter under test.
    await page.getByLabel('Phone number').fill(ACCOUNTS.admin.phone);
    await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/courses\/crs_1/, { timeout: 15_000 });
  });

  test('an absolute next= is refused rather than followed', async ({ page }) => {
    // An open redirect on a login page is a phishing link that genuinely
    // originates from this domain. Both the middleware and the login page
    // reject anything that is not a same-site path.
    await page.goto('/login?next=https://example.com/phish');
    await page.getByLabel('Phone number').fill(ACCOUNTS.admin.phone);
    await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 15_000 }).catch(() => undefined);

    await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
    expect(page.url()).not.toContain('example.com');
  });

  test('protocol-relative //evil.example is refused too', async ({ page }) => {
    await page.goto('/login?next=//evil.example/phish');
    await page.getByLabel('Phone number').fill(ACCOUNTS.admin.phone);
    await page.getByLabel('Password').fill(ACCOUNTS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 15_000 }).catch(() => undefined);

    expect(page.url()).not.toContain('evil.example');
  });
});

// ---------------------------------------------------------------------------
// An access token that merely lapsed — recoverable
// ---------------------------------------------------------------------------

test.describe('expired access token', () => {
  test('is refreshed once and the original request continues', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await staleAccessToken(page);

    await page.goto('/students');

    // The data arrived, so the retry after the refresh succeeded. The user saw
    // nothing at all, which is the whole point.
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/students/);

    const requests = await stubRequests(page);
    expect(requests.filter((r) => r === 'POST /auth/refresh').length).toBeGreaterThan(0);
  });

  test('a page firing many requests at once refreshes only once', async ({ page, signIn }) => {
    // The refresh tokens are single-use and rotating: presenting one twice
    // reads as theft and revokes the whole family. A dashboard screen issues
    // a dozen queries in parallel, so the serialisation this asserts is what
    // stops an ordinary page load from logging the operator out.
    await signIn('admin');
    await page.request.get(
      `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}/__test__/reset`,
    );
    await staleAccessToken(page);

    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();

    const requests = await stubRequests(page);
    expect(requests.filter((r) => r === 'POST /auth/refresh').length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// A refresh that fails for a reason that is not the token
// ---------------------------------------------------------------------------

test.describe('refresh failing for an unrelated reason', () => {
  test('does NOT sign the administrator out when the API is briefly unreachable', async ({
    page,
    signIn,
  }) => {
    // The regression behind the reported "Session Expired" loop.
    //
    // A refresh that fails in transit — 503, a timeout, a dropped connection —
    // says nothing about whether the token is valid. The proxy used to answer
    // 401 SESSION_EXPIRED regardless of why the refresh failed, and 401 ends
    // the session client-side: cookies cleared, navigate to login. One
    // unreachable moment therefore logged a working administrator out, even
    // though their 30-day refresh token was never touched.
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await breakRefreshTransport(page);

    // Navigate somewhere that forces a proxied data call with a stale token.
    await page.goto('/students').catch(() => undefined);

    // The transport can still be failing, but the operator must still be on the
    // dashboard — not on the login screen with an expired-session notice.
    await expect(page).not.toHaveURL(/\/login/);

    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((c) => c.name === 'edu_rt');
    expect(
      refreshCookie,
      'a transient refresh failure must not discard a valid refresh token',
    ).toBeTruthy();
  });

  test('recovers on the next request once the API answers again', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await breakRefreshTransport(page);
    await page.goto('/students').catch(() => undefined);
    await expect(page).not.toHaveURL(/\/login/);

    await restoreRefreshTransport(page);

    // With the API reachable again the same session keeps working — no
    // re-authentication, because nothing was ever wrong with the token.
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/students/);
  });
});

// ---------------------------------------------------------------------------
// A session that cannot be rescued
// ---------------------------------------------------------------------------

test.describe('revoked session', () => {
  test('signs the browser out and returns to login instead of retrying', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await revokeSession(page);
    await page.goto('/students');

    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText(/session expired/i);
  });

  test('does not loop: the login page stays put', async ({ page, signIn }) => {
    // The defect this covers: the client redirected to /login without clearing
    // the cookies, the login page saw a session and redirected back, and the
    // two bounced off each other indefinitely.
    await signIn('admin');
    await revokeSession(page);
    // Aborted by the client's own navigation to the login page — which is the
    // behaviour under test, not a failure.
    await page.goto('/students').catch(() => undefined);

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    const settled = page.url();
    await page.waitForTimeout(2500);
    expect(page.url()).toBe(settled);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('the session cookies are gone afterwards, so Back restores nothing', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await revokeSession(page);
    await page.goto('/students').catch(() => undefined);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain('edu_at');
    expect(names).not.toContain('edu_rt');
    expect(names).not.toContain('edu_pf');

    await page.goto('/students');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a failed refresh ends the session rather than retrying forever', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await rejectRefresh(page);
    await staleAccessToken(page);

    // The client navigates away mid-flight once it gives up on the session,
    // which aborts this navigation. That abort is the expected outcome.
    await page.goto('/students').catch(() => undefined);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    const requests = await stubRequests(page);
    // One rejected attempt, not a storm.
    expect(requests.filter((r) => r === 'POST /auth/refresh').length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// A disabled account: a 403 that *does* end the session
// ---------------------------------------------------------------------------

test.describe('disabled account', () => {
  test('is signed out and told why', async ({ page, signIn }) => {
    await signIn('admin');
    await disableAccount(page);

    // May be aborted by the client's own redirect; that is the outcome, not an
    // error.
    await page.goto('/students').catch(() => undefined);

    // Whichever layer notices first — the layout's `/auth/me` check on a
    // server render, or a client query through the proxy — the session ends
    // and the browser is at the login screen with an explanation.
    await expect(page).toHaveURL(/\/login\?reason=(expired|forbidden)/, { timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText(
      /session expired|cannot access this dashboard/i,
    );

    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain('edu_at');
  });
});

// ---------------------------------------------------------------------------
// A legitimate 403: the one that must NOT sign anyone out
// ---------------------------------------------------------------------------

test.describe('permission refusal', () => {
  test('a forbidden endpoint leaves the session intact', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await forbidPath(page, '/admin/settings');
    await page.goto('/settings');

    // Still signed in, still on the page, with an error in the panel rather
    // than a login screen. Logging someone out for asking a question they are
    // not allowed to ask is the bug this exists to prevent.
    await expect(page).toHaveURL(/\/settings/);
    await expect(page).not.toHaveURL(/\/login/);

    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).toContain('edu_at');
  });

  test('a teacher refused an admin endpoint stays signed in', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get('/api/proxy/admin/settings', {
      headers: { 'x-dashboard-request': '1' },
    });
    expect(response.status()).toBe(403);

    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// Signing out, and the login page's own behaviour
// ---------------------------------------------------------------------------

test.describe('sign out', () => {
  test('clears the session and a previously visited page cannot be restored', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();

    // The control lives behind the account menu and is a `menuitem`, not a
    // button, so it has to be opened first.
    await page.getByRole('button', { expanded: false }).filter({ hasText: /admin/i }).first().click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Straight back to a page whose data is still in the query cache of the
    // previous document. A fresh navigation must not resurrect it.
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toHaveCount(0);
  });
});

test.describe('login page', () => {
  test('sends an already-signed-in visitor to the dashboard', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('honours next= for an already-signed-in visitor, if it is same-site', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/login?next=%2Fteachers');
    await expect(page).toHaveURL(/\/teachers/);
  });
});

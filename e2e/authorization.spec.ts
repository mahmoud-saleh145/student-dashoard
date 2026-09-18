import { expect, forbidPath, resetStub, test } from './fixtures';

/**
 * Authorization.
 *
 * Two separate claims are checked here, and the second is the one that
 * matters:
 *
 *  1. the interface does not offer a role things it cannot do;
 *  2. **the API refuses them anyway.** A test that only asserted on hidden
 *     navigation would pass just as happily against a dashboard whose entire
 *     security model was CSS.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

test.describe('teacher', () => {
  test('sees only teaching navigation', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'My courses' })).toBeVisible();

    for (const hidden of [
      'Students',
      'Teachers',
      'Codes',
      'Support centre',
      'Logs',
      'Admin accounts',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
  });

  test('is refused platform statistics by the API, not just by the menu', async ({
    page,
    signIn,
  }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    // Called directly through the proxy, exactly as a hostile client would.
    const response = await page.request.get('/api/proxy/analytics/dashboard');

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('is refused platform settings and the audit log', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    for (const path of ['admin/settings', 'audit', 'audit/logins']) {
      const response = await page.request.get(`/api/proxy/${path}`);
      expect(response.status(), `${path} must be refused`).toBe(403);
    }
  });

  test('a course list request returns only their own courses', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get('/api/proxy/admin/courses');
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      data: { items: { teachers: { id: string }[] }[] };
    };

    for (const course of body.data.items) {
      expect(course.teachers.some((teacher) => teacher.id === 'user-teacher')).toBe(true);
    }
  });
});

test.describe('regular admin', () => {
  test('sees operational navigation but not admin accounts', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Codes' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Managing administrators is the master's alone.
    await expect(nav.getByRole('link', { name: 'Admin accounts' })).toHaveCount(0);
  });

  test('reaching /admins directly is refused in the interface too', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/admins');

    await expect(page.getByText(/only the master admin/i)).toBeVisible();
  });
});

test.describe('master admin', () => {
  test('sees admin accounts and can open the page', async ({ page, signIn }) => {
    await signIn('master');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Admin accounts' })).toBeVisible();

    await nav.getByRole('link', { name: 'Admin accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Admin accounts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add admin' })).toBeVisible();
  });
});

test.describe('server-side refusal is authoritative', () => {
  test('an action the API forbids fails even for an admin', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    // The API is told to refuse this path regardless of role — standing in for
    // a permission the dashboard has not been taught about yet.
    await forbidPath(page, '/admin/settings');

    const response = await page.request.get('/api/proxy/admin/settings');
    expect(response.status()).toBe(403);
  });
});

import { expect, resetStub, test } from './fixtures';

/**
 * The screens themselves.
 *
 * Enough to catch a page that stopped rendering, a broken navigation link and
 * — the one with real consequences — an access code printed in full in a
 * table.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

test.describe('statistics', () => {
  test('shows the platform figures from the API', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();

    // 128 students, 7 teachers, 9 courses — the stub's numbers, rendered.
    await expect(page.getByText('128')).toBeVisible();
    await expect(page.getByText('Total students')).toBeVisible();
    await expect(page.getByText('Total teachers')).toBeVisible();
    await expect(page.getByText('Total courses')).toBeVisible();
    await expect(page.getByText('Total revenue')).toBeVisible();
  });

  test('a teacher gets their own home screen instead', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Statistics' })).toHaveCount(0);
  });
});

test.describe('navigation', () => {
  const destinations = [
    { link: 'Courses', heading: 'Courses' },
    { link: 'Students', heading: 'Students' },
    { link: 'Teachers', heading: 'Teachers' },
    { link: 'Codes', heading: 'Codes' },
    { link: 'Batch generation', heading: 'Code batch generation' },
    { link: 'Support centre', heading: 'Support centre' },
    { link: 'Notification centre', heading: 'Notification centre' },
    { link: 'Other data', heading: 'Other data' },
    { link: 'Logs', heading: 'Logs' },
    { link: 'Settings', heading: 'Settings' },
  ];

  for (const destination of destinations) {
    test(`${destination.link} opens without error`, async ({ page, signIn }) => {
      await signIn('admin');
      await expect(page).toHaveURL(/\/$/);

      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: destination.link })
        .click();

      await expect(
        page.getByRole('heading', { name: destination.heading, level: 1 }),
      ).toBeVisible();
    });
  }
});

test.describe('codes', () => {
  test('the table masks code values', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/codes');

    await expect(page.getByRole('heading', { name: 'Codes', level: 1 })).toBeVisible();

    // The stub's only code is ABCD-EFGH-JKMN. Its full value must not appear.
    await expect(page.getByText('ABCD-EFGH-JKMN')).toHaveCount(0);

    // A masked form is shown instead.
    await expect(page.getByRole('button', { name: /ABCD•+/ })).toBeVisible();
  });

  test('opening a code reveals it only on request', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/codes');

    await page.getByRole('button', { name: /ABCD•+/ }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Still masked until the operator asks for it.
    await expect(drawer.getByText('ABCD-EFGH-JKMN')).toHaveCount(0);

    await drawer.getByRole('button', { name: 'Reveal code' }).click();
    await expect(drawer.getByText('ABCD-EFGH-JKMN')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('renders the teacher permission switches with their state', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    const deleteLectures = page.getByRole('switch', { name: 'Delete lectures' });
    await expect(deleteLectures).toBeVisible();
    await expect(deleteLectures).toHaveAttribute('aria-checked', 'false');

    await expect(
      page.getByRole('switch', { name: 'Allow students to change their academic year' }),
    ).toBeVisible();
  });

  test('changing a switch surfaces the unsaved-changes bar', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/settings');

    await page.getByRole('switch', { name: 'Delete lectures' }).click();

    await expect(page.getByText(/unsaved changes/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});

test.describe('accessibility basics', () => {
  test('every page has exactly one h1 and a skip link', async ({ page, signIn }) => {
    await signIn('admin');

    for (const path of ['/', '/courses', '/students', '/codes', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(1);
    }
  });

  test('the sidebar marks the current page', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/students');

    const current = page
      .getByRole('navigation', { name: 'Main' })
      .locator('[aria-current="page"]');

    await expect(current).toHaveText('Students');
  });
});

test.describe('responsive layout', () => {
  test('the sidebar collapses into a drawer on a small screen', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    await page.setViewportSize({ width: 480, height: 900 });

    const openNav = page.getByRole('button', { name: 'Open navigation' });
    await expect(openNav).toBeVisible();

    await openNav.click();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Students' }),
    ).toBeVisible();
  });

  test('the page never scrolls sideways on a narrow viewport', async ({ page, signIn }) => {
    await signIn('admin');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/codes');

    await expect(page.getByRole('heading', { name: 'Codes', level: 1 })).toBeVisible();

    // Polled rather than sampled once: the table's own horizontal scroll
    // container is what keeps the page in check, and reading the width in the
    // same frame the rows first paint can catch it mid-layout.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        { timeout: 5000 },
      )
      .toBeLessThanOrEqual(1);
  });
});

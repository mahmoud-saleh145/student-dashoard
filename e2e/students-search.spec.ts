import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * The Students page search box under rapid typing.
 *
 * The production defect: the box re-synced its text from the URL after every
 * debounced commit, and the commit reached the URL through an asynchronous
 * navigation — so the echo of an earlier commit landed after more characters
 * had been typed and overwrote them. "Sara Student" typed at speed came back
 * as "Sara S". These tests type faster than the debounce, with the list
 * request slowed down so a commit lands mid-sentence, and assert on what
 * matters: the box keeps every character, and the list is asked for the full
 * text exactly once it settles.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

const lastUsersQuery = async (page: Page) =>
  (await (await page.request.get(`${STUB_API}/__test__/last-users-query`)).json()).data as Record<
    string,
    string
  >;

test.beforeEach(async ({ page, signIn }) => {
  await resetStub(page);
  await signIn('admin');
});

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search students' });

test.describe('students search — rapid typing', () => {
  test('keeps every character while commits land mid-sentence', async ({ page }) => {
    // Slow the list down so the first debounced commit's response, and the
    // URL update that follows it, arrive while typing is still going on.
    await page.route('**/api/proxy/admin/users**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fallback();
    });

    await page.goto('/students');
    const box = search(page);
    await box.click();
    // 60 ms a key: well under the 350 ms debounce per key, but the sentence
    // takes ~700 ms, so a commit fires with "Sara S" and then the rest lands.
    await page.keyboard.type('Sara Student', { delay: 60 });

    // Nothing typed is lost, now…
    await expect(box).toHaveValue('Sara Student');
    // …nor after the commits and their echoes have all come back.
    await expect(page).toHaveURL(/[?&]q=Sara\+Student(&|$)/, { timeout: 10_000 });
    await page.waitForTimeout(1_200);
    await expect(box).toHaveValue('Sara Student');

    await expect
      .poll(async () => (await lastUsersQuery(page)).q, { timeout: 10_000 })
      .toBe('Sara Student');
  });

  test('typing is not re-ordered or doubled by its own commits', async ({ page }) => {
    await page.goto('/students');
    const box = search(page);
    await box.click();
    await page.keyboard.type('mahmoud', { delay: 20 });
    await page.waitForTimeout(500);
    await page.keyboard.type(' saleh', { delay: 20 });

    await expect(box).toHaveValue('mahmoud saleh');
    await expect(page).toHaveURL(/q=mahmoud\+saleh/, { timeout: 10_000 });
    await page.waitForTimeout(800);
    await expect(box).toHaveValue('mahmoud saleh');
    await expect.poll(async () => (await lastUsersQuery(page)).q).toBe('mahmoud saleh');
  });

  test('the search survives a reload and is cleared by Clear', async ({ page }) => {
    await page.goto('/students');
    const box = search(page);
    await box.fill('Sara');
    await expect(page).toHaveURL(/q=Sara/, { timeout: 10_000 });

    await page.reload();
    await expect(search(page)).toHaveValue('Sara');

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(search(page)).toHaveValue('');
    await expect(page).not.toHaveURL(/q=/);
    await expect.poll(async () => (await lastUsersQuery(page)).q).toBeUndefined();
  });

  test('a filter change keeps the search text', async ({ page }) => {
    await page.goto('/students');
    const box = search(page);
    await box.fill('Sara');
    await expect(page).toHaveURL(/q=Sara/, { timeout: 10_000 });

    await page.getByRole('combobox', { name: 'Academic year' }).selectOption({ index: 0 });
    await expect(box).toHaveValue('Sara');
    await expect(page).toHaveURL(/q=Sara/);
  });

  test('the committed query never re-fires a stale request after the final text', async ({
    page,
  }) => {
    const queries: string[] = [];
    await page.route('**/api/proxy/admin/users**', async (route) => {
      queries.push(new URL(route.request().url()).searchParams.get('q') ?? '');
      await route.fallback();
    });

    await page.goto('/students');
    await search(page).click();
    await page.keyboard.type('Sara Student', { delay: 40 });
    await expect(page).toHaveURL(/q=Sara\+Student/, { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    // The last request the list made is for the full text; no older,
    // shorter query is sent after it.
    const last = queries[queries.length - 1];
    expect(last).toBe('Sara Student');
  });
});

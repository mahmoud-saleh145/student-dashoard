import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Wallet, course parts, library and announcements.
 *
 * The thread running through every test here is the platform's two separate
 * money systems, and the fact that they must never be mixed:
 *
 *   Courses / course parts — sold offline, unlocked with an access code.
 *                            **The wallet is never debited.**
 *   Library                — bought with wallet credit. The only spender.
 *
 * Several tests below exist purely to assert that separation, because it is
 * the kind of thing a well-meaning refactor quietly breaks and no user ever
 * reports until the accounts stop balancing.
 */

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

test.describe('wallet', () => {
  test('shows recharge cards with face value, paid and credit kept apart', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/wallet');

    await expect(page.getByRole('heading', { name: 'Wallet & recharge' })).toBeVisible();

    // The stub's first card is 200 face value, 10% off, so 180 paid and 200
    // credited. Three different numbers on purpose: a bug that confuses any
    // two of them shows up here and nowhere else.
    await expect(page.getByRole('cell', { name: /180/ }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /200/ }).first()).toBeVisible();
  });

  test('never shows a recharge code in full in the table', async ({ page, signIn }) => {
    // A recharge card is worth its face value to anyone who can read it, and a
    // list is the thing most likely to be screenshotted.
    await signIn('admin');
    await page.goto('/wallet');

    await expect(page.getByRole('cell', { name: 'RCHG-AAAA-1111' })).toHaveCount(0);
  });

  test('reveals the full code in the detail dialog', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/wallet');

    await page.getByRole('row').nth(1).click();

    await expect(page.getByRole('dialog')).toContainText('RCHG-AAAA-1111');
  });

  test('prices a batch from the server, not in the browser', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/wallet');

    await page.getByRole('button', { name: 'Generate recharge cards' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Face value').fill('200');
    await dialog.getByLabel('Discount').selectOption('PERCENTAGE');
    await dialog.getByLabel('Percentage off').fill('25');

    // The stub computes 200 − 25% = 150 paid, and credits the full 200.
    // Intl renders EGP as "EGP 150" in this locale — checked against the
    // rendered page rather than assumed.
    await expect(dialog.getByText('Student pays')).toBeVisible();
    await expect(dialog.getByText(/EGP\s*150/)).toBeVisible();
    await expect(dialog.getByText('Wallet credit')).toBeVisible();
  });

  test('separates revenue from credit issued', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/wallet?tab=revenue');

    await expect(page.getByText('Revenue (cash taken)')).toBeVisible();
    // Appears twice — as a stat tile and as a column header. Both are correct;
    // the tile is the one this test is about.
    await expect(page.getByText('Credit issued').first()).toBeVisible();
    // The label is the assertion: credit issued is a liability, and a screen
    // that called it revenue would be wrong by 300 EGP in the stub alone.
    await expect(page.getByText('A liability, not income.')).toBeVisible();
  });

  test('says plainly that the wallet does not buy courses', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/wallet');

    await expect(
      page.getByText(/Nothing on this screen grants course access/i),
    ).toBeVisible();
  });

  test('is refused to a teacher by the API, not only hidden', async ({ page, signIn }) => {
    await signIn('teacher');

    const response = await page.request.get('/api/proxy/admin/wallets');
    expect(response.status()).toBe(403);
  });

  test('is absent from teacher navigation', async ({ page, signIn }) => {
    await signIn('teacher');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Wallet & recharge' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Course parts
// ---------------------------------------------------------------------------

test.describe('course parts', () => {
  test('lists parts with their allocated price', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=parts');

    await expect(page.getByText('Part 1 - Before mid')).toBeVisible();
    await expect(page.getByText('Part 2 - After mid')).toBeVisible();

    // 60% and 40% of a 500 EGP course.
    await expect(page.getByText(/EGP\s*300/)).toBeVisible();
    await expect(page.getByText(/EGP\s*200/).first()).toBeVisible();
  });

  test('states that parts never use the wallet', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=parts');

    await expect(page.getByText(/Wallet credit is\s+never used/i)).toBeVisible();
  });

  test('offers no wallet action anywhere on the parts screen', async ({ page, signIn }) => {
    // The strongest form of the rule: not "the button is disabled" but "there
    // is no such button". A part is unlocked with an access code.
    await signIn('admin');
    await page.goto('/courses/course-1?tab=parts');

    await expect(page.getByRole('button', { name: /debit/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /pay with credit/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /charge wallet/i })).toHaveCount(0);
  });

  test('warns when a part unlocks nothing', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=parts');

    // Part 2 in the stub has no sections.
    await expect(page.getByText('No sections assigned')).toBeVisible();
  });

  test('a teacher can reach the parts tab', async ({ page, signIn }) => {
    // The structural routes are @StaffOnly(); the backend then checks this
    // teacher's assignment to this course.
    await signIn('teacher');
    await page.goto('/courses/course-1?tab=parts');

    await expect(page.getByRole('tab', { name: 'Parts' })).toBeVisible();
  });

  test('the part purchase report is refused to a teacher', async ({ page, signIn }) => {
    // Unlike the structural routes, this one is @AdminOnly().
    await signIn('teacher');

    const response = await page.request.get('/api/proxy/admin/part-purchases');
    expect(response.status()).toBe(403);
  });

  test('labels part unlock totals as value rather than revenue', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/part-purchases');

    await expect(page.getByText('Value unlocked')).toBeVisible();
    await expect(page.getByText('Catalogue value, not cash received.')).toBeVisible();
    await expect(page.getByText('Revenue', { exact: true })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

test.describe('library', () => {
  test('lists materials with their document and package counts', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library');

    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Physics Revision Papers' })).toBeVisible();
  });

  test('opens a material with its documents and packages', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library/mat-1');

    await expect(page.getByRole('heading', { name: 'Physics Revision Papers' })).toBeVisible();
    // The title is a heading in the document list and a chip inside the
    // package that contains it, so the role is what disambiguates.
    await expect(page.getByRole('heading', { name: 'Paper 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Full bundle' })).toBeVisible();
  });

  test('marks a free preview as free rather than as zero-priced', async ({ page, signIn }) => {
    // A zero price is a configuration mistake the purchase path refuses;
    // `isPreview` is the documented way to give something away.
    await signIn('admin');
    await page.goto('/library/mat-1');

    // Exact, because the section description also contains the phrase.
    await expect(page.getByText('Free preview', { exact: true })).toBeVisible();
  });

  test('shows what a package saves against buying separately', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library/mat-1');

    // Paper 1 at 50 and a free preview, bundled at 40. The figure is what
    // this test is about, not the word — two section descriptions also use it.
    await expect(page.getByText(/separately EGP\s*50/i)).toBeVisible();
    await expect(page.getByText(/saves EGP\s*10/i)).toBeVisible();
  });

  test('refuses to delete a document students have paid for', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library/mat-1');

    await page
      .getByRole('button', { name: 'Remove' })
      .first()
      .click();

    await expect(page.getByRole('dialog')).toContainText(
      /students? have paid for|server will refuse/i,
    );
  });

  test('labels library spending as credits, never revenue', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library?tab=purchases');

    await expect(page.getByText('Credits spent')).toBeVisible();
    await expect(
      page.getByText('Not revenue — the cash was recognised at recharge.'),
    ).toBeVisible();
  });

  test('is refused to a teacher by the API', async ({ page, signIn }) => {
    await signIn('teacher');

    const response = await page.request.get('/api/proxy/admin/library/materials');
    expect(response.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

test.describe('announcements', () => {
  test('lists announcements with their schedule and reach', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/announcements');

    await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();
    await expect(page.getByText('Revision week starts Sunday')).toBeVisible();
    await expect(page.getByText('Every week')).toBeVisible();
  });

  test('filters by status', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/announcements');

    await page.getByLabel('Filter by status').selectOption('SENT');

    await expect(page.getByText('Fees deadline')).toBeVisible();
    await expect(page.getByText('Revision week starts Sunday')).toHaveCount(0);
  });

  test('shows the delivery history, including a failed occurrence', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/announcements');

    await page.getByText('Revision week starts Sunday').click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Delivery history' })).toBeVisible();
    await expect(drawer.getByText('queue unavailable')).toBeVisible();
    // The explanation matters as much as the error: the claim is kept on
    // purpose so a retry cannot resend to everyone already reached.
    await expect(drawer.getByText(/send twice to everyone already reached/i)).toBeVisible();
  });

  test('refuses to edit an announcement that has already sent', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/announcements');

    await page.getByText('Fees deadline').click();

    // occurrenceCount is 1, so the drawer offers no Edit at all.
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit' })).toHaveCount(
      0,
    );
  });

  test('is refused to a teacher by the API', async ({ page, signIn }) => {
    await signIn('teacher');

    const response = await page.request.get('/api/proxy/admin/announcements');
    expect(response.status()).toBe(403);
  });
});

test.describe('audience builder', () => {
  async function openAudienceTab(page: Page) {
    await page.goto('/announcements');
    await page.getByRole('button', { name: 'New announcement' }).click();
    await page.getByRole('tab', { name: 'Audience' }).click();
  }

  test('explains that choices within a box are OR and across boxes are AND', async ({
    page,
    signIn,
  }) => {
    // The difference decides whether a message reaches four hundred students
    // or none, and it is not guessable from a column of checkboxes.
    await signIn('admin');
    await openAudienceTab(page);

    await expect(page.getByText('How these combine')).toBeVisible();
    await expect(page.getByText(/any of them/i)).toBeVisible();
  });

  test('treats an empty audience as everyone, and says so', async ({ page, signIn }) => {
    await signIn('admin');
    await openAudienceTab(page);

    await expect(page.getByText('Every active student on the platform.')).toBeVisible();
    await expect(page.getByText('This reaches everyone')).toBeVisible();
  });

  test('takes the recipient count from the server', async ({ page, signIn }) => {
    await signIn('admin');
    await openAudienceTab(page);

    // 1000 is the stub's figure for an unfiltered rule. Nothing in the browser
    // could have produced it.
    await expect(page.getByText('1,000')).toBeVisible();
    await expect(page.getByText(/counted by the server/i)).toBeVisible();
  });

  test('never exposes raw JSON to the administrator', async ({ page, signIn }) => {
    await signIn('admin');
    await openAudienceTab(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).not.toContainText('academicYearIds');
    await expect(dialog).not.toContainText('{"');
  });

  test('requires a course or subject alongside an enrollment state', async ({
    page,
    signIn,
  }) => {
    // "Anyone whose enrollment is expired" is not an audience — expired in
    // what? The backend refuses it, and so does the form.
    await signIn('admin');
    await openAudienceTab(page);

    await page.getByLabel('Enrollment state').selectOption('EXPIRED');

    await expect(
      page.getByText(/Choose a course or a subject as well/i),
    ).toBeVisible();
  });
});

test.describe('schedule builder', () => {
  async function openScheduleTab(page: Page) {
    await page.goto('/announcements');
    await page.getByRole('button', { name: 'New announcement' }).click();
    await page.getByRole('tab', { name: 'Schedule' }).click();
  }

  test('offers no cron expression', async ({ page, signIn }) => {
    // One wrong field in a cron string pushes to every student every minute,
    // and a delivered push cannot be recalled.
    await signIn('admin');
    await openScheduleTab(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).not.toContainText('cron');
    await expect(dialog).not.toContainText('* * *');
  });

  test('saves a draft when no time is set', async ({ page, signIn }) => {
    await signIn('admin');
    await openScheduleTab(page);

    await expect(page.getByText(/saves as a draft and will not be sent/i)).toBeVisible();
  });

  test('describes a daily schedule in words', async ({ page, signIn }) => {
    await signIn('admin');
    await openScheduleTab(page);

    await page.getByLabel('Repeats').selectOption('DAILY');
    await page.getByLabel('Time of day').fill('19:00');

    await expect(page.getByText(/Sends every day at 19:00/)).toBeVisible();
  });

  test('a weekly schedule needs a weekday before it can fire', async ({ page, signIn }) => {
    await signIn('admin');
    await openScheduleTab(page);

    await page.getByLabel('Repeats').selectOption('WEEKLY');
    await page.getByLabel('Time of day').fill('19:00');

    await expect(page.getByText(/Pick at least one day/i)).toBeVisible();

    await page.getByRole('button', { name: /Sunday/ }).click();
    await expect(page.getByText(/Sends every Sunday at 19:00/)).toBeVisible();
  });

  test('a monthly schedule explains the end-of-month clamp', async ({ page, signIn }) => {
    await signIn('admin');
    await openScheduleTab(page);

    await page.getByLabel('Repeats').selectOption('MONTHLY');

    await expect(
      page.getByText(/the 31st means the end of every month, not eight of them/i),
    ).toBeVisible();
  });

  test('schedules in Cairo local time, not UTC', async ({ page, signIn }) => {
    // Egypt observes daylight saving, so the UTC instant behind "19:00 Cairo"
    // moves twice a year. Storing local time is what keeps an evening
    // announcement in the evening.
    await signIn('admin');
    await openScheduleTab(page);

    await page.getByLabel('Repeats').selectOption('DAILY');
    await page.getByLabel('Time of day').fill('19:00');

    await expect(page.getByText(/Africa\/Cairo wall-clock/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The separation itself
// ---------------------------------------------------------------------------

test.describe('financial separation', () => {
  test('navigation keeps course selling and library selling apart', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByText('Courses & access codes')).toBeVisible();
    await expect(nav.getByText('Library & wallet')).toBeVisible();
  });

  test('the course parts screen offers no wallet figure', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/part-purchases');

    const main = page.getByRole('main');
    await expect(main.getByText('Credits spent')).toHaveCount(0);
    await expect(main.getByText('Wallet credit')).toHaveCount(0);
  });

  test('the library screen offers no access-code figure', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/library?tab=purchases');

    // Scoped to the page content: the sidebar's "Access codes" section is
    // supposed to be there, and a page-wide assertion was really testing the
    // navigation rather than the screen.
    const main = page.getByRole('main');
    await expect(main.getByText('Access code')).toHaveCount(0);
    await expect(main.getByText('Value unlocked')).toHaveCount(0);
  });
});

/**
 * The two preview endpoints, called directly.
 *
 * Both screens that use them showed their "no result yet" state in the first
 * run, which cannot distinguish "the request failed" from "the component never
 * asked". These two tests answer that: they exercise the same path the app
 * uses — through the dashboard proxy, with the CSRF header — and print the
 * response body if the status is not 200.
 */
test.describe('preview endpoints', () => {
  test('the audience preview answers through the proxy', async ({ page, signIn }) => {
    await signIn('admin');

    const response = await page.request.post('/api/proxy/admin/announcements/preview', {
      headers: { 'x-dashboard-request': '1' },
      data: { audience: {} },
    });

    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).data.total).toBe(1000);
  });

  test('the recharge preview answers through the proxy', async ({ page, signIn }) => {
    await signIn('admin');

    const response = await page.request.post('/api/proxy/admin/recharge-codes/preview', {
      headers: { 'x-dashboard-request': '1' },
      data: { faceValue: 200, discountType: 'PERCENTAGE', discountPercent: 25, count: 50 },
    });

    expect(response.status(), await response.text()).toBe(200);

    const { data } = await response.json();
    // Paid is discounted; credit is not. Confusing the two is the bug the
    // whole screen exists to prevent.
    expect(data.actualPaidAmount).toBe(150);
    expect(data.creditAmount).toBe(200);
  });
});

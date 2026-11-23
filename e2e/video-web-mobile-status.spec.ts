import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * The curriculum shows two independent badges per lecture video:
 *   Web     the Gumlet pipeline (`video.status`)
 *   Mobile  the self-hosted HLS pipeline for the apps (`video.mobileStatus`)
 * Neither is ever derived from the other.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;
const LECTURE = 'Skeletal system';

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

async function setVideo(page: Page, status: string, mobile: string) {
  await page.request.get(`${STUB_API}/__test__/lesson-video?lesson=les-1&status=${status}&mobile=${mobile}`);
}

async function badgesOf(page: Page) {
  await page.goto('/courses/course-1?tab=content');
  const row = page.getByRole('listitem').filter({ hasText: LECTURE });
  await expect(row).toBeVisible();
  return {
    row,
    web: row.getByTestId('video-web-status'),
    mobile: row.getByTestId('video-mobile-status'),
  };
}

const CASES: Array<{
  name: string;
  web: string;
  mobile: string;
  webText: string;
  mobileText: string;
  webTone: string;
  mobileTone: string;
}> = [
  { name: 'Web FAILED / Mobile READY', web: 'FAILED', mobile: 'READY', webText: 'Web: Failed', mobileText: 'Mobile: Ready', webTone: 'danger', mobileTone: 'success' },
  { name: 'Web FAILED / Mobile PROCESSING', web: 'FAILED', mobile: 'PROCESSING', webText: 'Web: Failed', mobileText: 'Mobile: Processing', webTone: 'danger', mobileTone: 'info' },
  { name: 'Web READY / Mobile QUEUED', web: 'READY', mobile: 'QUEUED', webText: 'Web: Ready', mobileText: 'Mobile: Queued', webTone: 'success', mobileTone: 'warning' },
  { name: 'Web READY / Mobile READY', web: 'READY', mobile: 'READY', webText: 'Web: Ready', mobileText: 'Mobile: Ready', webTone: 'success', mobileTone: 'success' },
  { name: 'Web FAILED / Mobile NOT PROCESSED', web: 'FAILED', mobile: 'NONE', webText: 'Web: Failed', mobileText: 'Mobile: Not processed', webTone: 'danger', mobileTone: 'neutral' },
  { name: 'Web READY / Mobile FAILED', web: 'READY', mobile: 'FAILED', webText: 'Web: Ready', mobileText: 'Mobile: Failed', webTone: 'success', mobileTone: 'danger' },
];

test.describe('web and mobile status badges in the curriculum', () => {
  for (const c of CASES) {
    test(c.name, async ({ page, signIn }) => {
      await signIn('admin');
      await setVideo(page, c.web, c.mobile);
      const { web, mobile } = await badgesOf(page);
      await expect(web).toHaveText(c.webText);
      await expect(mobile).toHaveText(c.mobileText);
      await expect(web).toHaveAttribute('data-tone', c.webTone);
      await expect(mobile).toHaveAttribute('data-tone', c.mobileTone);
    });
  }

  test('a missing mobile status (older API) is "Unknown", never guessed from the web status', async ({ page, signIn }) => {
    await signIn('admin');
    await setVideo(page, 'READY', 'absent');
    const { web, mobile } = await badgesOf(page);
    await expect(web).toHaveText('Web: Ready');
    await expect(mobile).toHaveText('Mobile: Unknown');
    await expect(mobile).toHaveAttribute('data-tone', 'neutral');
  });

  test('a null mobile status is "Unknown" too', async ({ page, signIn }) => {
    await signIn('admin');
    await setVideo(page, 'FAILED', 'null');
    const { mobile } = await badgesOf(page);
    await expect(mobile).toHaveText('Mobile: Unknown');
  });

  test('a lecture without a video shows no pipeline badges', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');
    const row = page.getByRole('listitem').filter({ hasText: 'Muscles of the forearm' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('video-pipeline-badges')).toHaveCount(0);
  });

  test('a mobile encode finishing changes only the Mobile badge', async ({ page, signIn }) => {
    await signIn('admin');
    await setVideo(page, 'FAILED', 'PROCESSING');
    const first = await badgesOf(page);
    await expect(first.mobile).toHaveText('Mobile: Processing');
    await setVideo(page, 'FAILED', 'READY');
    const second = await badgesOf(page);
    await expect(second.mobile).toHaveText('Mobile: Ready');
    await expect(second.web).toHaveText('Web: Failed');
  });

  test('a mobile failure changes only the Mobile badge', async ({ page, signIn }) => {
    await signIn('admin');
    await setVideo(page, 'READY', 'QUEUED');
    await badgesOf(page);
    await setVideo(page, 'READY', 'FAILED');
    const after = await badgesOf(page);
    await expect(after.web).toHaveText('Web: Ready');
    await expect(after.mobile).toHaveText('Mobile: Failed');
  });

  test('narrow screen: both badges stay visible, unclipped and on screen', async ({ page, signIn }) => {
    await signIn('admin');
    await page.setViewportSize({ width: 375, height: 812 });
    await setVideo(page, 'FAILED', 'READY');
    const { web, mobile } = await badgesOf(page);
    for (const badge of [web, mobile]) {
      await expect(badge).toBeVisible();
      const box = await badge.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    // No horizontal scroll introduced by the pair.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

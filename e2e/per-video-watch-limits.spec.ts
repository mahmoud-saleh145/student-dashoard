import type { WatchLimitVideo } from '../src/features/watch-limits/types';
import { expect, test } from './fixtures';

function video(
  id: string,
  title: string,
  overrides: Partial<WatchLimitVideo> = {},
): WatchLimitVideo {
  return {
    videoId: id,
    lessonId: id,
    title,
    titleAr: null,
    sectionId: 'section-1',
    sectionTitle: 'Section one',
    sectionTitleAr: null,
    isPreview: false,
    accessible: true,
    defaultLimit: 3,
    allowedPlays: 3,
    customLimit: false,
    usedPlays: 3,
    remainingPlays: 0,
    lifetimePlays: 3,
    countFrom: null,
    status: 'EXHAUSTED',
    sharedCourses: 0,
    ...overrides,
  };
}

test('per-video actions stay visible on mobile and update only the selected video', async ({
  page,
  signIn,
}) => {
  await signIn('admin');
  const selected = video('video-5', 'Video five');
  const videos = [
    selected,
    video('video-6', 'Video six', { sectionId: 'section-2', sectionTitle: 'Section two' }),
    video('shared', 'Shared video', { sharedCourses: 1 }),
    video('preview', 'Preview video', { isPreview: true, status: 'UNLIMITED' }),
    video('locked', 'Locked video', { accessible: false, status: 'NO_ACCESS' }),
  ];
  const changes: Array<{ action: string; amount?: number }> = [];
  const base = '**/api/proxy/admin/watch-limits/courses/course-1/students/user-student';
  await page.route(base, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          course: { title: 'Anatomy I', titleAr: null },
          defaultLimit: 3,
          summary: { accessibleVideos: 4, watchedVideos: 3, exhaustedVideos: 3 },
          videos,
        },
      },
    }),
  );
  await page.route(base + '/**', async (route) => {
    expect(new URL(route.request().url()).pathname).toMatch(/\/videos\/video-5$/);
    expect(route.request().method()).toBe('POST');
    const command = route.request().postDataJSON();
    changes.push(command);
    switch (command.action) {
      case 'ADD_PLAYS':
        selected.allowedPlays += command.amount;
        break;
      case 'SET_REMAINING':
        selected.allowedPlays = selected.usedPlays + command.amount;
        break;
      case 'RESET_USED':
        selected.usedPlays = 0;
        break;
      case 'RESTORE_DEFAULT':
        selected.allowedPlays = selected.defaultLimit;
        break;
    }
    selected.customLimit = selected.allowedPlays !== selected.defaultLimit;
    selected.remainingPlays = selected.allowedPlays - selected.usedPlays;
    await route.fulfill({ json: { success: true, data: { video: selected } } });
  });

  await page.goto('/courses/course-1?tab=students');
  await page.getByRole('button', { name: 'Manage Views: Sara Student' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = page.getByRole('dialog');
  const row = (title: string) => dialog.getByRole('listitem').filter({ hasText: title });
  const button = (name: string) => row('Video five').getByRole('button', { name, exact: true });
  const apply = () => dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const counts = (title: string) => row(title).locator('dd').filter({ hasText: /^\d+$/ });
  await expect(
    dialog.getByRole('region', { name: 'Section one' }).getByText('Video five'),
  ).toBeVisible();
  await expect(
    dialog.getByRole('region', { name: 'Section two' }).getByText('Video six'),
  ).toBeVisible();
  await expect(dialog.getByText('Locked video')).toHaveCount(0);
  await expect(row('Preview video').getByRole('button')).toHaveCount(0);
  await expect(row('Shared video').getByRole('button')).toHaveCount(0);
  await expect(button('Restore default limit')).toBeDisabled();
  expect(
    await button('Add plays').evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(390);

  await button('Add plays').click();
  await dialog.getByLabel('Plays to add').fill('2');
  await apply();
  await expect(counts('Video five')).toHaveText(['5', '3', '2']);
  await button('Set remaining plays').click();
  await dialog.getByLabel('Plays remaining afterwards').fill('4');
  await apply();
  await expect(counts('Video five')).toHaveText(['7', '3', '4']);
  await button('Reset used plays to 0').click();
  await apply();
  await expect(counts('Video five')).toHaveText(['7', '0', '7']);
  await button('Restore default limit').click();
  await apply();
  await expect(counts('Video five')).toHaveText(['3', '0', '3']);
  await expect(counts('Video six')).toHaveText(['3', '3', '0']);
  expect(changes).toEqual([
    { action: 'ADD_PLAYS', amount: 2 },
    { action: 'SET_REMAINING', amount: 4 },
    { action: 'RESET_USED' },
    { action: 'RESTORE_DEFAULT' },
  ]);
});

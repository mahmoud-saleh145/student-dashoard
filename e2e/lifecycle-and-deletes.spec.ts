import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Course/lecture lifecycle and the destructive actions.
 *
 * The stub validates these routes the way the real DTOs do (a reason of 3+
 * characters for archive and delete, a status for unpublish). It used to
 * accept any body, which is exactly how the dashboard shipped an Archive that
 * posted `{}` and a Hide that posted nothing — both refused by the real API
 * with 422 while every test here passed.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

async function requestsTo(page: Page, pathPart: string): Promise<string[]> {
  const res = await page.request.get(`${STUB_API}/__test__/requests`);
  const data = (await res.json()) as { data: { requests: string[] } };
  return data.data.requests.filter((r) => r.includes(pathPart));
}

function lectureRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

async function lectureMenu(page: Page, title: string, item: string | RegExp) {
  await page.getByRole('button', { name: `Actions for lecture ${title}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('course lifecycle', () => {
  test('archive asks for a reason and succeeds against the validating API', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/courses/course-1');

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Archive' });

    // Cannot confirm without a reason — the API would refuse it.
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/why is this course being archived/i).fill('End of term');
    await confirm.click();

    await expect(page.getByText('Course archived')).toBeVisible();
    // The header reflects the server's new state, and offers the way back.
    await expect(page.getByRole('button', { name: 'Restore course' })).toBeVisible();

    await page.getByRole('button', { name: 'Restore course' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore course' }).click();
    await expect(page.getByText('Course restored')).toBeVisible();
  });

  test('hide sends the status the API requires', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1');

    await page.getByRole('button', { name: 'Hide course' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hide course' }).click();

    await expect(page.getByText('Course hidden')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make visible' })).toBeVisible();
  });

  test('a published course cannot be deleted; a hidden one can, with a reason', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/courses');

    await page.getByRole('button', { name: 'Actions for Anatomy 101' }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete course' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // Hide it, then delete from the detail page.
    await page.goto('/courses/course-1');
    await page.getByRole('button', { name: 'Hide course' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hide course' }).click();
    await expect(page.getByText('Course hidden')).toBeVisible();

    await page.getByRole('button', { name: 'Delete course' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('soft delete');
    await dialog.getByLabel(/why is this course being deleted/i).fill('Duplicate course');
    await dialog.getByRole('button', { name: 'Delete course' }).click();

    await expect(page).toHaveURL(/\/courses$/);
    await expect(page.getByText('Anatomy 101')).toHaveCount(0);
  });
});

test.describe('lecture lifecycle', () => {
  test('shows each lecture’s status and real video count', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await expect(lectureRow(page, 'Skeletal system')).toContainText('Videos: 1');
    await expect(lectureRow(page, 'Muscles of the forearm')).toContainText('Videos: 0');
    await expect(lectureRow(page, 'Muscles of the forearm')).toContainText(
      'Not visible to students',
    );
  });

  test('archive is reversible: archive, then restore', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await lectureMenu(page, 'Skeletal system', 'Archive');
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Lecture archived')).toBeVisible();
    // Still listed — archived, not gone — with the way back offered.
    await expect(lectureRow(page, 'Skeletal system')).toContainText('Archived');

    await lectureMenu(page, 'Skeletal system', 'Restore');
    await expect(page.getByText('Lecture restored')).toBeVisible();
    await expect(lectureRow(page, 'Skeletal system')).toContainText('Published');

    const calls = await requestsTo(page, '/admin/lessons/les-1');
    expect(calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(2);
  });

  test('publishing a draft lecture makes it visible', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await lectureMenu(page, 'Muscles of the forearm', 'Publish');
    await expect(page.getByText('Lecture published')).toBeVisible();
    await expect(lectureRow(page, 'Muscles of the forearm')).not.toContainText(
      'Not visible to students',
    );
  });

  test('delete is separate from archive and removes the lecture', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await lectureMenu(page, 'Muscles of the forearm', 'Delete lecture');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('cannot be undone');
    await dialog.getByRole('button', { name: 'Delete lecture' }).click();

    await expect(page.getByText('Lecture deleted')).toBeVisible();
    await expect(lectureRow(page, 'Muscles of the forearm')).toHaveCount(0);
  });

  test('deleting a lecture’s video updates the count', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await lectureRow(page, 'Skeletal system')
      .getByRole('button', { name: 'Video', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Lecture video' });
    await dialog.getByRole('button', { name: 'Delete video' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this video?' })
      .getByRole('button', { name: 'Delete video' })
      .click();

    await expect(page.getByText('Video deleted')).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Lecture video' })
      .getByRole('button', { name: 'Done' })
      .click();
    await expect(lectureRow(page, 'Skeletal system')).toContainText('Videos: 0');
  });
});

test.describe('account deletion', () => {
  test('deletes a teacher with a reason', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/teachers');

    await page.getByRole('button', { name: 'Actions for Hany Teacher' }).click();
    await page.getByRole('menuitem', { name: 'Delete teacher' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/reason/i).fill('Left the institution');
    await dialog.getByRole('button', { name: 'Delete teacher' }).click();

    await expect(page.getByText('Teacher deleted')).toBeVisible();
    await expect(page.getByText('Hany Teacher')).toHaveCount(0);
  });

  test('deletes a student with a reason', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/students');

    await page.getByRole('button', { name: 'Actions for Sara Student' }).click();
    await page.getByRole('menuitem', { name: 'Delete student' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('soft delete');
    await dialog.getByLabel(/reason/i).fill('Duplicate account');
    await dialog.getByRole('button', { name: 'Delete student' }).click();

    await expect(page.getByText('Student deleted')).toBeVisible();
  });

  test('reviews a device change request', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/students?tab=devices');

    await expect(page.getByText('Pixel 9')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Device approved')).toBeVisible();
    await expect(page.getByText('No pending requests')).toBeVisible();
  });
});

import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * The course screen's lecture and student administration:
 *
 *  - each lecture shows how many documents it has, and the number follows
 *    adds and deletes without a reload;
 *  - a lecture can be renamed in place;
 *  - the Viewers drawer renders the report (it used to crash on it), pages
 *    and searches on its own state;
 *  - an administrator can remove a student from the course, behind a
 *    confirmation that says what happens to access and money.
 */

const PDF = {
  name: 'handout.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\nstub bytes for the test\n%%EOF'),
};

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

function lectureRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

async function openLectureMenu(page: Page, title: string, item: string) {
  await lectureRow(page, title).getByRole('button', { name: /Actions for lecture/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('lecture document counts', () => {
  test('shows 0 Documents beside the video count', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    const row = lectureRow(page, 'Skeletal system');
    await expect(row.getByTestId('lesson-video-count')).toHaveText('Videos: 1');
    await expect(row.getByTestId('lesson-document-count')).toHaveText('0 Documents');
  });

  test('follows an added and a removed document without a reload', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await openLectureMenu(page, 'Skeletal system', 'Lecture documents');
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(dialog.getByText('handout.pdf')).toBeVisible();

    const count = lectureRow(page, 'Skeletal system').getByTestId('lesson-document-count');
    await expect(count).toHaveText('1 Document');
    // Another lecture's count is not affected.
    await expect(
      lectureRow(page, 'Muscles of the forearm').getByTestId('lesson-document-count'),
    ).toHaveText('0 Documents');

    await dialog.getByRole('button', { name: 'Remove handout.pdf' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(count).toHaveText('0 Documents');
  });
});

test.describe('renaming a lecture', () => {
  test('saves a new title in place and keeps it after a reload', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await openLectureMenu(page, 'Skeletal system', 'Rename lecture');
    const dialog = page.getByRole('dialog', { name: 'Rename lecture' });
    const field = dialog.getByRole('textbox', { name: /Lecture title/ });
    await expect(field).toHaveValue('Skeletal system');

    await field.fill('  The skeletal system  ');
    const patch = page.waitForRequest(
      (r) => r.method() === 'PATCH' && r.url().endsWith('/admin/lessons/les-1'),
    );
    await dialog.getByRole('button', { name: 'Save title' }).click();

    // Only the title is sent, trimmed — nothing about video, access or status.
    expect((await patch).postDataJSON()).toEqual({ title: 'The skeletal system' });
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Lecture renamed')).toBeVisible();

    const row = lectureRow(page, 'The skeletal system');
    await expect(row).toBeVisible();
    // The rest of the row is unchanged.
    await expect(row.getByTestId('lesson-video-count')).toHaveText('Videos: 1');

    await page.reload();
    await expect(lectureRow(page, 'The skeletal system')).toBeVisible();
  });

  test('will not save a blank or unchanged title', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await openLectureMenu(page, 'Skeletal system', 'Rename lecture');
    const dialog = page.getByRole('dialog', { name: 'Rename lecture' });
    const save = dialog.getByRole('button', { name: 'Save title' });

    await expect(save).toBeDisabled();
    await dialog.getByRole('textbox', { name: /Lecture title/ }).fill('   ');
    await expect(dialog.getByText('Enter a title.')).toBeVisible();
    await expect(save).toBeDisabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(lectureRow(page, 'Skeletal system')).toBeVisible();
  });
});

test.describe('lecture viewers', () => {
  test('renders the report with its completion rule and summary', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');
    await openLectureMenu(page, 'Skeletal system', 'Viewers');

    const drawer = page.getByRole('dialog', { name: 'Skeletal system' });
    await expect(drawer.getByText('Completion is counted at 85% watched')).toBeVisible();
    await expect(drawer.getByRole('paragraph').filter({ hasText: /^23$/ })).toBeVisible();
    await expect(drawer.getByRole('cell', { name: /Sara Student/ })).toBeVisible();
  });

  test('pages and searches on its own, without touching the page URL', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');
    await openLectureMenu(page, 'Skeletal system', 'Viewers');
    const drawer = page.getByRole('dialog', { name: 'Skeletal system' });

    await expect(drawer.getByRole('cell', { name: /Viewer 20/ })).toBeVisible();
    await drawer.getByRole('button', { name: /Next/ }).click();
    await expect(drawer.getByRole('cell', { name: /Viewer 21/ })).toBeVisible();

    await drawer.getByRole('searchbox', { name: 'Search viewers' }).fill('nobody-like-this');
    await expect(drawer.getByText('No viewers match this search')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('q')).toBeNull();
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();
  });

  test('shows a clear error when the report is refused', async ({ page, signIn }) => {
    await signIn('admin');
    await page.request.get(
      `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}/__test__/forbid?path=${encodeURIComponent('/analytics/lessons/les-1/students')}`,
    );
    await page.goto('/courses/course-1?tab=content');
    await openLectureMenu(page, 'Skeletal system', 'Viewers');

    const drawer = page.getByRole('dialog', { name: 'Skeletal system' });
    await expect(drawer.getByRole('alert').first()).toBeVisible();
    await expect(drawer.getByText('Viewing activity for this lecture.')).toBeVisible();
  });
});

test.describe('removing a student from a course', () => {
  async function openStudents(page: Page) {
    await page.goto('/courses/course-1?tab=students');
    await expect(page.getByRole('row').filter({ hasText: 'Sara Student' })).toBeVisible();
  }

  test('removes after a confirmation that explains access and money', async ({ page, signIn }) => {
    await signIn('admin');
    await openStudents(page);

    await page.getByRole('button', { name: 'Actions for Sara Student' }).click();
    await page.getByRole('menuitem', { name: 'Remove from course' }).click();

    const dialog = page.getByRole('dialog', { name: 'Remove this student from the course?' });
    await expect(dialog).toContainText('loses access');
    await expect(dialog).toContainText('nothing is refunded');
    await expect(dialog).toContainText('Their other courses and their account are not affected');

    const confirm = dialog.getByRole('button', { name: 'Remove from course' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('Duplicate account');

    const revoke = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/admin/enrollments/enr-1/revoke'),
    );
    await confirm.click();
    expect((await revoke).postDataJSON()).toEqual({
      reason: 'Duplicate account',
      courseId: 'course-1',
    });

    await expect(page.getByText('Sara Student was removed')).toBeVisible();
    await expect(page.getByText(/nothing was refunded/)).toBeVisible();
    await expect(dialog).toBeHidden();

    // The list reflects the backend state: Sara is revoked, Omar untouched.
    const sara = page.getByRole('row').filter({ hasText: 'Sara Student' });
    await expect(sara).toContainText(/revoked/i);
    const omar = page.getByRole('row').filter({ hasText: 'Omar Hassan' });
    await expect(omar).not.toContainText(/revoked/i);

    // And the action is no longer offered for her.
    await page.getByRole('button', { name: 'Actions for Sara Student' }).click();
    await expect(page.getByRole('menuitem', { name: 'Removed from course' })).toBeDisabled();
  });

  test('cancelling sends nothing', async ({ page, signIn }) => {
    await signIn('admin');
    await openStudents(page);

    let sent = false;
    page.on('request', (r) => {
      if (r.url().includes('/revoke')) sent = true;
    });

    await page.getByRole('button', { name: 'Actions for Omar Hassan' }).click();
    await page.getByRole('menuitem', { name: 'Remove from course' }).click();
    await page.getByRole('dialog', { name: 'Remove this student from the course?' }).getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog', { name: 'Remove this student from the course?' })).toBeHidden();
    expect(sent).toBe(false);
  });

  test('reports a refusal from the API instead of claiming success', async ({ page, signIn }) => {
    await signIn('admin');
    await page.request.get(
      `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}/__test__/forbid?path=${encodeURIComponent('/admin/enrollments/enr-2/revoke')}`,
    );
    await openStudents(page);

    await page.getByRole('button', { name: 'Actions for Omar Hassan' }).click();
    await page.getByRole('menuitem', { name: 'Remove from course' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove this student from the course?' });
    await dialog.getByRole('textbox').fill('Testing a refusal');
    await dialog.getByRole('button', { name: 'Remove from course' }).click();

    await expect(page.getByText('The student could not be removed')).toBeVisible();
    await expect(page.getByText('Omar Hassan was removed')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Omar Hassan' })).not.toContainText(
      /revoked/i,
    );
  });

  test('is not offered to a teacher', async ({ page, signIn }) => {
    await signIn('teacher');
    await page.goto('/courses/course-1?tab=students');

    await expect(page.getByRole('button', { name: /Actions for Sara Student/ })).toHaveCount(0);
  });
});

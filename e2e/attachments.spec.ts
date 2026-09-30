import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Lecture and section documents.
 *
 * The two scopes are the point. A document can belong to one lecture or to a
 * section as a whole, never both, and the API gates each by a different
 * entitlement — so a test that only proved "a file can be uploaded" would miss
 * the thing most likely to be wrong.
 *
 * The upload is a real request through the dashboard's own streaming route,
 * not a mocked one, because that route carries the CSRF header and the
 * token refresh. What it returns is an object key the SERVER named; the
 * dashboard offers nowhere to type one, and one test asserts that directly.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

const PDF = {
  name: 'problem-sheet.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\nstub bytes for the test\n%%EOF'),
};

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

async function openLectureDocs(page: Page, lecture = 'Muscles of the forearm') {
  await page.goto('/courses/course-1?tab=content');
  const row = page.getByRole('listitem').filter({ hasText: lecture });
  await row.getByRole('button', { name: /Actions for lecture/ }).click();
  await page.getByRole('menuitem', { name: 'Lecture documents' }).click();
  return page.getByRole('dialog');
}

async function openSectionDocs(page: Page, section: string) {
  await page.goto('/courses/course-1?tab=content');
  await page
    .getByRole('button', { name: new RegExp(`Actions for section ${section}`) })
    .click();
  await page.getByRole('menuitem', { name: 'Section documents' }).click();
  return page.getByRole('dialog');
}

test.describe('lecture documents', () => {
  test('a lecture starts with none, and says so', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);

    await expect(dialog.getByText('No documents on this lecture yet.')).toBeVisible();
  });

  test('uploads a file and lists it', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);

    await dialog.getByRole('textbox', { name: 'Title' }).fill('Problem sheet 3');
    await dialog.locator('input[type="file"]').setInputFiles(PDF);

    // Scoped to the row rather than the dialog: the upload form below also
    // carries a "Protected" switch label, so an unscoped match is ambiguous.
    const row = dialog.getByRole('listitem').filter({ hasText: 'Problem sheet 3' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Protected')).toBeVisible();
  });

  test('falls back to the file name when no title is given', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);

    await dialog.locator('input[type="file"]').setInputFiles(PDF);

    await expect(dialog.getByText('problem-sheet.pdf')).toBeVisible();
  });

  test('offers no place to type a storage key', async ({ page, signIn }) => {
    // The key can only ever come from an upload the server performed. A field
    // for it would be a way to point a row at someone else's object.
    await signIn('admin');
    const dialog = await openLectureDocs(page);

    const boxes = dialog.getByRole('textbox');
    const count = await boxes.count();
    for (let i = 0; i < count; i += 1) {
      const label = (await boxes.nth(i).getAttribute('aria-label')) ?? '';
      const id = (await boxes.nth(i).getAttribute('id')) ?? '';
      expect(`${label} ${id}`.toLowerCase()).not.toContain('key');
    }
  });

  test('never shows a storage URL', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);
    await dialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(dialog.getByText('problem-sheet.pdf')).toBeVisible();

    const text = (await dialog.textContent()) ?? '';
    expect(text).not.toContain('http://');
    expect(text).not.toContain('https://');
    expect(text).not.toContain('attachments/');
  });

  test('reports a refused upload rather than pretending it worked', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload`);

    const dialog = await openLectureDocs(page);
    await dialog.locator('input[type="file"]').setInputFiles(PDF);

    await expect(dialog.getByText('No documents on this lecture yet.')).toBeVisible();
  });

  test('turns a document into a free sample and back', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);
    await dialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(dialog.getByText('problem-sheet.pdf')).toBeVisible();

    const row = dialog.getByRole('listitem').filter({ hasText: 'problem-sheet.pdf' });

    await row.getByRole('button', { name: /Make a free sample of/ }).click();
    // The badge on the row, not the switch label in the form below.
    await expect(row.getByText('Free sample')).toBeVisible();

    await row.getByRole('button', { name: /Require access for/ }).click();
    await expect(row.getByRole('button', { name: /Make a free sample of/ })).toBeVisible();
  });

  test('removes a document after confirming', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openLectureDocs(page);
    await dialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(dialog.getByText('problem-sheet.pdf')).toBeVisible();

    await dialog.getByRole('button', { name: /Remove problem-sheet.pdf/ }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(dialog.getByText('No documents on this lecture yet.')).toBeVisible();
  });
});

test.describe('section documents', () => {
  test('are a separate list from the lecture’s own', async ({ page, signIn }) => {
    // The regression this file exists for. If the two scopes shared a list,
    // a section handout would appear under every lecture inside it — and the
    // access rule that gates them differs.
    await signIn('admin');

    const lectureDialog = await openLectureDocs(page);
    await lectureDialog.getByRole('textbox', { name: 'Title' }).fill('Lecture handout');
    await lectureDialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(lectureDialog.getByText('Lecture handout')).toBeVisible();
    await page.keyboard.press('Escape');

    const sectionDialog = await openSectionDocs(page, 'Week 1');
    await expect(sectionDialog.getByText('No documents on this section yet.')).toBeVisible();
    await expect(sectionDialog.getByText('Lecture handout')).toHaveCount(0);
  });

  test('accept their own upload, scoped to the section', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openSectionDocs(page, 'Week 1');

    await dialog.getByRole('textbox', { name: 'Title' }).fill('Section syllabus');
    await dialog.locator('input[type="file"]').setInputFiles(PDF);

    await expect(dialog.getByText('Section syllabus')).toBeVisible();
  });

  test('and do not leak into the lecture list', async ({ page, signIn }) => {
    await signIn('admin');

    const sectionDialog = await openSectionDocs(page, 'Week 1');
    await sectionDialog.getByRole('textbox', { name: 'Title' }).fill('Section syllabus');
    await sectionDialog.locator('input[type="file"]').setInputFiles(PDF);
    await expect(sectionDialog.getByText('Section syllabus')).toBeVisible();
    await page.keyboard.press('Escape');

    const lectureDialog = await openLectureDocs(page);
    await expect(lectureDialog.getByText('Section syllabus')).toHaveCount(0);
  });
});

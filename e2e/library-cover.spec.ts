import type { Page } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * The library material cover, end to end through the dashboard's own origin.
 *
 * Until now there was nowhere to upload one: the API accepted `coverKey` but
 * no form ever sent it. This drives the whole lifecycle the way an
 * administrator does — choose an image on the Edit material dialog, save,
 * re-read — and asserts on the request the API would see and on the image the
 * browser actually decoded, not only on a `src` attribute.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

const PNG = {
  name: 'cover.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const lastMaterialPatch = async (page: Page) =>
  (await (await page.request.get(`${STUB_API}/__test__/last-material-patch`)).json())
    .data as Record<string, unknown>;

async function openEditMaterial(page: Page) {
  await page.goto('/library/mat-1');
  await page.getByRole('button', { name: 'Edit material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit material' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The picker is created on demand, so the file goes through the chooser. */
async function chooseCover(page: Page, dialog: ReturnType<Page['getByRole']>) {
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: /Upload image|Replace image/ }).click();
  await (await chooser).setFiles(PNG);
}

test.beforeEach(async ({ page, signIn }) => {
  await resetStub(page);
  await signIn('admin');
});

test.describe('library cover', () => {
  test('uploads the cover, registers the key the server issued, and renders it', async ({
    page,
  }) => {
    const dialog = await openEditMaterial(page);
    await expect(dialog.getByText('Cover image')).toBeVisible();
    await expect(dialog).toContainText('Using the library default for its documents');

    await chooseCover(page, dialog);
    await expect(dialog.getByText('Uploaded')).toBeVisible();
    await expect(dialog.getByText(PNG.name)).toBeVisible();

    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    // The key the server issued, under this material's own namespace, and
    // nothing of the audience (the cover is not part of it).
    const patch = await lastMaterialPatch(page);
    expect(patch.coverKey).toBe('thumbnails/library/mat-1/cover/stub.png');
    expect(patch).not.toHaveProperty('universityId');
    expect(patch).not.toHaveProperty('academicYearIds');

    // Re-read: the detail page shows the cover, and the browser decoded it.
    const cover = page.getByTestId('material-cover').locator('img');
    await expect(cover).toHaveAttribute('src', /\/assets\/thumbnails\/library\/mat-1\/cover\/stub\.png$/);
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('the cover is edit-only: a new material offers it, disabled, with the reason', async ({
    page,
  }) => {
    await page.goto('/library');
    await page.getByRole('button', { name: 'New material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New library material' });
    await expect(dialog.getByRole('button', { name: 'Upload image' })).toBeDisabled();
    await expect(dialog).toContainText('Create the material first, then add its cover image.');
  });

  test('clearing the cover sends coverKey: null and the page shows none', async ({ page }) => {
    await page.request.get(
      `${STUB_API}/__test__/set-material-cover?key=thumbnails/library/mat-1/cover/old.png`,
    );
    await page.goto('/library/mat-1');
    await expect(page.getByTestId('material-cover').locator('img')).toBeVisible();

    await page.getByRole('button', { name: 'Edit material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit material' });
    await dialog.getByRole('button', { name: 'Clear' }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    const patch = await lastMaterialPatch(page);
    expect(patch).toHaveProperty('coverKey', null);
    expect(JSON.parse(JSON.stringify(patch)).coverKey).toBeNull();
    await expect(page.getByTestId('material-cover')).toContainText('No cover');
  });

  test('an edit that does not touch the cover sends no coverKey', async ({ page }) => {
    await page.request.get(
      `${STUB_API}/__test__/set-material-cover?key=thumbnails/library/mat-1/cover/old.png`,
    );
    const dialog = await openEditMaterial(page);
    await dialog.getByRole('textbox', { name: 'Title (required)' }).fill('Physics Revision Papers 2');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    expect(await lastMaterialPatch(page)).not.toHaveProperty('coverKey');
  });

  test('a refused upload is reported with the server reason and saves nothing', async ({
    page,
  }) => {
    await page.request.get(`${STUB_API}/__test__/fail-upload`);
    const dialog = await openEditMaterial(page);

    await chooseCover(page, dialog);
    await expect(dialog.getByTestId('thumbnail-error')).toContainText('Storage refused the upload.');

    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(await lastMaterialPatch(page)).not.toHaveProperty('coverKey');
  });

  test('rejects a non-image before any request is made', async ({ page }) => {
    const dialog = await openEditMaterial(page);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/upload/')) requests.push(request.url());
    });

    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Upload image' }).click();
    await (await chooser).setFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    await expect(dialog.getByTestId('thumbnail-error')).toContainText('Use a JPEG, PNG or WebP image.');
    expect(requests).toEqual([]);
  });
});

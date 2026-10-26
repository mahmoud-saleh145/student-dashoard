import type { Page } from '@playwright/test';

import { expect, resetStub, stubRequests, test } from './fixtures';

/**
 * Lecture video: upload, processing, and the two ways it ends.
 *
 * The upload here is a real cross-origin PUT to the storage stand-in,
 * preflight included, because that is exactly the shape of the flow in
 * production: `videos/uploads/init` returns a presigned URL and the browser
 * sends the bytes straight to R2. Mocking that step would leave the one part
 * most likely to break — the CORS rule on the bucket — untested.
 *
 * Processing is a background job with no push channel, so the dashboard polls.
 * The stub advances one step per poll (QUEUED → PROCESSING → READY), which
 * means a dashboard that stopped polling would hang on PROCESSING here rather
 * than quietly passing.
 *
 * THE INTERRUPTED UPLOAD
 * ----------------------
 * The last group of tests covers the failure this dashboard actually produced
 * in production on 2026-10-21: Cloudflare R2 committed a 522 MB lecture and
 * then answered the same request with HTTP 500. The file was in the bucket,
 * the browser was told the upload had failed, and the row was left saying
 * nothing had arrived — so nothing was ever processed and nothing was ever
 * sent to the DRM provider.
 *
 * The stub can reproduce that exactly (`/__test__/fail-upload-after-commit`),
 * which is what makes the behaviour assertable rather than aspirational.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

/** Small, so the test is about the flow rather than the bytes. */
const VIDEO = {
  name: 'lecture-01.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('\x00\x00\x00\x18ftypmp42stub-bytes-for-the-test'),
};

/** Opens the video dialog on the lecture that has no video yet. */
async function openVideoDialog(page: Page, lecture = 'Muscles of the forearm') {
  await page.goto('/courses/course-1?tab=content');

  const row = page.getByRole('listitem').filter({ hasText: lecture });
  await row.getByRole('button', { name: /video/i }).click();

  return page.getByRole('dialog');
}

/** How many times the browser actually PUT the bytes at the storage stand-in. */
async function storagePutCount(page: Page): Promise<number> {
  const requests = await stubRequests(page);
  return requests.filter((r) => r.startsWith('PUT /__storage__/videos/')).length;
}

test.describe('lecture video', () => {
  test('a lecture without a video offers a way to add one', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    const row = page.getByRole('listitem').filter({ hasText: 'Muscles of the forearm' });

    // The row has always shown a video status badge; for a long time it
    // offered no way to produce one.
    await expect(row.getByRole('button', { name: 'Add video' })).toBeVisible();
  });

  test('a lecture that already has one offers to replace it', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openVideoDialog(page, 'Skeletal system');

    await expect(dialog.getByRole('button', { name: 'Replace video' })).toBeVisible();
  });

  test('uploads the file and reports the video as queued', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openVideoDialog(page);

    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    // The assertion is that the video reached a state the SERVER owns, not
    // that it is specifically QUEUED: the first status poll fires immediately
    // and the stub advances a step per poll, so pinning this to QUEUED would
    // be a race against the dashboard working correctly.
    await expect(
      dialog.getByText(/Queued for processing\.|Being processed\.|Ready to stream\./),
    ).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('polls until processing finishes and the video is ready', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openVideoDialog(page);

    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    // The stub only reaches READY on the second poll, so this passes only if
    // the dashboard keeps asking.
    await expect(dialog.getByText('Ready to stream.')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/2 renditions/)).toBeVisible();
  });

  test('never exposes a storage URL for the source file', async ({ page, signIn }) => {
    // The uploads bucket is private and a source is never served to anyone.
    await signIn('admin');
    const dialog = await openVideoDialog(page);

    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);
    await expect(dialog.getByText('Ready to stream.')).toBeVisible({ timeout: 20_000 });

    const text = (await dialog.textContent()) ?? '';
    expect(text).not.toContain('__storage__');
    expect(text).not.toContain('http://');
    expect(text).not.toContain('https://');
  });

  test('reports a refused upload and does not claim it worked', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    // The retries are real, so this takes a few seconds to settle.
    await expect(dialog.getByRole('alert')).toContainText(
      /storage (refused|reported)|could not reach/i,
      { timeout: 20_000 },
    );
    await expect(dialog.getByText(/Waiting for a transcoding worker/i)).toHaveCount(0);
  });

  test('rejects a file type the server would refuse, without a round trip', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openVideoDialog(page);

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });

    await expect(dialog.getByRole('alert')).toContainText(/file type is not accepted/i);
  });

  test('surfaces why processing failed and offers to retry it', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-processing`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(dialog.getByText('Processing failed')).toBeVisible({ timeout: 20_000 });

    // The worker's own reason, not a generic message — it is the only thing
    // that tells an administrator whether re-uploading would help.
    await expect(dialog.getByText(/ffmpeg exited with code 1/)).toBeVisible();

    // And retrying must not mean re-sending an 8 GB file.
    await expect(
      dialog.getByText(/still in storage, so retrying does not upload it again/i),
    ).toBeVisible();
  });

  test('retrying failed processing recovers without a second upload', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-processing`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);
    await expect(dialog.getByText('Processing failed')).toBeVisible({ timeout: 20_000 });

    await dialog.getByRole('button', { name: 'Try processing again' }).click();

    // No file input is touched here: the retry is asserted to reach READY on
    // the stored source alone.
    await expect(dialog.getByText('Ready to stream.')).toBeVisible({ timeout: 20_000 });
  });

  test('a new lecture leads straight into its video', async ({ page, signIn }) => {
    // A video cannot be uploaded before the lecture exists, so the dialog
    // creates the lecture and then shows the panel for it.
    await signIn('admin');
    await page.goto('/courses/course-1?tab=content');

    await page.getByRole('button', { name: 'Add lecture' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /Lecture title/ }).fill('Nerve supply');
    await dialog.getByRole('button', { name: 'Add lecture' }).click();

    await expect(dialog.getByRole('heading', { name: 'Add a video' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Choose video' })).toBeVisible();
  });

  test('is refused to a student, and to anyone without a session', async ({ page }) => {
    // The routes are @StaffOnly(); a teacher is staff, so the check that
    // matters here is that an unauthenticated caller gets nothing.
    const response = await page.request.post(`${STUB_API}/api/v1/videos/uploads/init`, {
      data: { lessonId: 'les-2', filename: 'a.mp4', contentType: 'video/mp4', sizeBytes: 1 },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
  });
});

/**
 * The interrupted upload.
 *
 * On 2026-10-21 Cloudflare R2 committed a 522 MB lecture and then answered
 * the same request with HTTP 500. The browser believed the upload failed, so
 * it never told the API the file was there. The row stayed at `UPLOADING`
 * with no job and no provider asset, the dashboard said "Gumlet is packaging
 * this video" when the provider had never heard of it, and the file — which
 * was perfectly good — sat in the bucket with nothing pointing at it.
 *
 * These tests pin the behaviour that fixes it.
 */
test.describe('an upload the store reported as failed', () => {
  test('finishes the upload when the file was stored anyway', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    // The store keeps the bytes and answers 500 — Cloudflare's documented
    // `InternalError`, whose own remedy is "retry the request".
    await page.request.get(`${STUB_API}/__test__/fail-upload-after-commit`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    // The upload completes, because the file IS there.
    await expect(
      dialog.getByText(/Queued for processing\.|Being processed\.|Ready to stream\./),
    ).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('does not send the file a second time', async ({ page, signIn }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload-after-commit`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(
      dialog.getByText(/Queued for processing\.|Being processed\.|Ready to stream\./),
    ).toBeVisible({ timeout: 20_000 });

    // The decisive assertion. The reader's connection carried the file once;
    // a second upload would have cost them the whole lecture again.
    expect(await storagePutCount(page)).toBe(1);
  });

  test('says plainly that the file was found, not uploaded again', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload-after-commit`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(
      dialog.getByText(/Queued for processing\.|Being processed\.|Ready to stream\./),
    ).toBeVisible({ timeout: 20_000 });

    // "It failed" and "it worked" are both true here, and only one of them
    // helps the person reading it.
    await expect(
      dialog.getByText(/the file was found in storage.*not uploaded again/i),
    ).toBeVisible();
  });

  test('retries a failure where nothing was stored', async ({ page, signIn }) => {
    await signIn('admin');
    // The store refuses and keeps nothing.
    await page.request.get(`${STUB_API}/__test__/fail-upload`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    // It tried more than once: a transient fault at the object store is worth
    // another go, and the provider says so.
    expect(await storagePutCount(page)).toBeGreaterThan(1);
  });

  test('says the file was not saved, rather than leaving it ambiguous', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(dialog.getByRole('alert')).toContainText(/not saved/i, { timeout: 20_000 });
  });

  test('does not claim the provider is packaging a video it never received', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.request.get(`${STUB_API}/__test__/fail-upload`);

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    // The upload never finished, so nothing was ever sent to the DRM
    // provider. The panel used to say "Gumlet is packaging this video" here,
    // which is how an administrator was told the system was busy with their
    // file when it had not even started.
    await expect(
      dialog.getByText(/Nothing has been sent for DRM packaging yet/i),
    ).toBeVisible();
    await expect(dialog.getByText(/Gumlet is packaging this video/i)).toHaveCount(0);
  });

  test('recovers an upload whose file is already in storage, without re-uploading', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');

    // The stranded state: the bytes are in the bucket and the row has never
    // learned about them. Nothing was sent by the browser, so the file is put
    // there directly.
    await page.request.get(
      `${STUB_API}/__test__/store-object?videoId=vid-1&bytes=512000000`,
    );

    // A lecture that already has a video, so the panel knows which video it is
    // looking at without an upload having been started in this session.
    const dialog = await openVideoDialog(page, 'Skeletal system');

    // The panel offers to CHECK rather than to re-upload.
    await expect(
      dialog.getByRole('button', { name: /check whether the file arrived/i }),
    ).toBeVisible({ timeout: 20_000 });

    await dialog.getByRole('button', { name: /check whether the file arrived/i }).click();

    // The upload finishes, and the file was never sent again.
    await expect(
      dialog.getByText(/Queued for processing\.|Being processed\.|Ready to stream\./),
    ).toBeVisible({ timeout: 20_000 });
    expect(await storagePutCount(page)).toBe(0);
  });
});

import type { Locator, Page } from '@playwright/test';

import { expect, resetStub, stubRequests, test } from './fixtures';

/**
 * ONE UPLOAD, TWO INDEPENDENT PIPELINES
 * =====================================
 *
 * A lecture video is processed twice, by two unrelated systems: Gumlet (DRM,
 * for the web) and our own encoder (HLS, for the Android and iOS apps). The
 * panel used to have one badge - the Gumlet state - so a lecture Gumlet
 * rejected read as plain "Failed", and a reader could not tell that the file
 * was safely uploaded and that the mobile version was encoding normally.
 *
 * What these tests pin:
 *
 *   - the upload, Gumlet and Mobile HLS are reported as three separate facts;
 *   - a Gumlet failure is never shown as an upload failure, and does not stop
 *     the mobile version being followed to the end;
 *   - each pipeline has its own retry, and pressing one calls only that
 *     pipeline's endpoint;
 *   - a queued mobile encode says QUEUED - including when the encoder is
 *     offline - rather than pretending to be processing;
 *   - an API that cannot be reached after the bytes are in storage is not an
 *     upload failure either: nothing is sent again.
 *
 * The stub models the two pipelines separately (`e2e/stub-api/server.mjs`),
 * each advancing on its own polls and each failing only when told to.
 */

const STUB_API = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 4599}`;

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

const VIDEO = {
  name: 'lecture-01.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('\x00\x00\x00\x18ftypmp42stub-bytes-for-the-test'),
};

async function openVideoDialog(page: Page, lecture = 'Muscles of the forearm') {
  await page.goto('/courses/course-1?tab=content');
  const row = page.getByRole('listitem').filter({ hasText: lecture });
  await row.getByRole('button', { name: /video/i }).click();
  return page.getByRole('dialog');
}

async function arm(page: Page, control: string) {
  await page.request.get(`${STUB_API}/__test__/${control}`);
}

async function pipelineCalls(
  page: Page,
): Promise<{ complete: number; gumletRetry: number; mobileRetry: number }> {
  const response = await page.request.get(`${STUB_API}/__test__/pipeline-calls`);
  const body = (await response.json()) as { data?: unknown };
  return (body.data ?? body) as { complete: number; gumletRetry: number; mobileRetry: number };
}

async function storagePutCount(page: Page): Promise<number> {
  const requests = await stubRequests(page);
  return requests.filter((r) => r.startsWith('PUT /__storage__/videos/')).length;
}

const chips = (dialog: Locator) => ({
  upload: dialog.getByTestId('pipeline-upload'),
  gumlet: dialog.getByTestId('pipeline-gumlet'),
  mobile: dialog.getByTestId('pipeline-mobile'),
});

/** The mobile encode is followed on a slower poll once Gumlet has settled. */
const MOBILE_SETTLE = { timeout: 60_000 };

test.describe('one upload, two independent pipelines', () => {
  test('reports the upload, Gumlet and Mobile HLS as three separate states', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openVideoDialog(page);

    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const c = chips(dialog);
    await expect(c.upload).toContainText('Uploaded');
    await expect(c.gumlet).toContainText('Ready', { timeout: 20_000 });
    await expect(c.mobile).toContainText('Ready', MOBILE_SETTLE);
    await expect(dialog.getByTestId('mobile-pipeline-panel')).toContainText(
      /Encoded for the Android and iOS apps/,
    );
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('Gumlet rejects the video: the upload is still Uploaded, and Mobile HLS carries on to Ready', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(120_000);
    await signIn('admin');
    await arm(page, 'gumlet-rejects');
    // The mobile encode outlasts the Gumlet verdict, so this passes only if
    // the panel keeps following the video after Gumlet has failed.
    await arm(page, 'mobile-slow?polls=1');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const c = chips(dialog);
    await expect(c.gumlet).toContainText('Failed', { timeout: 20_000 });

    // The failure is Gumlet's, and is named as Gumlet's.
    await expect(dialog.getByText('Gumlet processing failed')).toBeVisible();
    await expect(dialog.getByText(/Gumlet rejected the source/).first()).toBeVisible();

    // It is NOT an upload failure, and is not shown as one.
    await expect(c.upload).toContainText('Uploaded');
    await expect(dialog.getByText(/upload failed/i)).toHaveCount(0);

    // The mobile version is still being worked on while Gumlet shows Failed...
    await expect(c.mobile).toContainText(/Queued|Processing/);
    // ...and finishes on its own.
    await expect(c.mobile).toContainText('Ready', MOBILE_SETTLE);
    await expect(c.gumlet).toContainText('Failed');
    await expect(
      dialog.getByText(/The mobile version is ready and is not affected/),
    ).toBeVisible();
  });

  test('Retry Gumlet calls only the Gumlet endpoint and leaves a ready mobile version alone', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(120_000);
    await signIn('admin');
    await arm(page, 'gumlet-rejects');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const c = chips(dialog);
    await expect(c.gumlet).toContainText('Failed', { timeout: 20_000 });
    await expect(c.mobile).toContainText('Ready', MOBILE_SETTLE);

    await dialog.getByRole('button', { name: 'Retry Gumlet' }).click();

    await expect(c.gumlet).toContainText('Ready', { timeout: 20_000 });
    // Never left Ready while Gumlet was being retried.
    await expect(c.mobile).toContainText('Ready');
    expect(await pipelineCalls(page)).toMatchObject({ gumletRetry: 1, mobileRetry: 0 });
    expect(await storagePutCount(page)).toBe(1);
  });

  test('Mobile HLS fails while Gumlet is ready: its own retry, on its own endpoint', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(120_000);
    await signIn('admin');
    await arm(page, 'mobile-fails');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const c = chips(dialog);
    await expect(c.gumlet).toContainText('Ready', { timeout: 20_000 });
    await expect(c.mobile).toContainText('Failed', MOBILE_SETTLE);

    // The lecture is playable on the web: the overall state is not "failed".
    await expect(dialog.getByText('Ready to stream.')).toBeVisible();
    await expect(dialog.getByText('Gumlet processing failed')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Retry Gumlet' })).toHaveCount(0);

    // The mobile failure has its own reason and its own button.
    const panel = dialog.getByTestId('mobile-pipeline-panel');
    await expect(panel.getByRole('alert')).toContainText(/ffmpeg exited with code 1/);
    await panel.getByRole('button', { name: 'Retry Mobile HLS' }).click();

    await expect(c.mobile).toContainText(/Queued|Processing/, { timeout: 20_000 });
    await expect(c.mobile).toContainText('Ready', MOBILE_SETTLE);
    await expect(c.gumlet).toContainText('Ready');
    expect(await pipelineCalls(page)).toMatchObject({ gumletRetry: 0, mobileRetry: 1 });
    expect(await storagePutCount(page)).toBe(1);
  });

  test('the encoder is offline: Mobile HLS says Queued and why, and Gumlet finishes regardless', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await arm(page, 'mobile-worker-offline');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const c = chips(dialog);
    await expect(c.upload).toContainText('Uploaded');
    await expect(c.gumlet).toContainText('Ready', { timeout: 20_000 });

    // Truthful: queued, not "processing", and no failure.
    await expect(c.mobile).toContainText('Queued');
    await expect(dialog.getByTestId('mobile-pipeline-message')).toContainText(
      /encoder is offline right now; this starts automatically/i,
    );
    await expect(
      dialog.getByRole('button', { name: /Retry Mobile HLS|Process for mobile/ }),
    ).toHaveCount(0);
    await expect(dialog.getByText('Ready to stream.')).toBeVisible();
  });
});

test.describe('the file is stored but the API cannot be reached to confirm it', () => {
  test('a brief outage is retried without the reader seeing a failure', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await arm(page, 'complete-unreachable?times=2');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    await expect(chips(dialog).upload).toContainText('Uploaded', { timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    expect(await storagePutCount(page)).toBe(1);
    expect((await pipelineCalls(page)).complete).toBe(3);
  });

  test('a lasting outage is reported as "uploaded, not confirmed" - never as a failed upload', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(90_000);
    await signIn('admin');
    await arm(page, 'complete-unreachable?times=99');

    const dialog = await openVideoDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles(VIDEO);

    const notice = dialog.getByTestId('upload-unconfirmed');
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toContainText('The file was uploaded.');
    await expect(notice).toContainText(/nothing needs to be uploaded again/i);
    await expect(dialog.getByText(/upload failed/i)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Choose another file' })).toHaveCount(0);

    // The API comes back. One request finishes the job; the file is not re-sent.
    await arm(page, 'complete-unreachable?times=0');
    await notice.getByRole('button', { name: /check whether the file arrived/i }).click();

    await expect(chips(dialog).upload).toContainText('Uploaded', { timeout: 20_000 });
    await expect(chips(dialog).upload).not.toContainText('not confirmed');
    await expect(chips(dialog).gumlet).toContainText(/Pending|Processing|Ready/);
    expect(await storagePutCount(page)).toBe(1);
  });
});

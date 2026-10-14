import { expect, test } from './fixtures';

/**
 * The course picker in Generate codes.
 *
 * Two courses can share a title across colleges — "Anatomy" exists in every
 * medical faculty — and the picker used to show the title alone, so the only
 * way to tell them apart was to guess from the order. It now carries the
 * college and the university.
 *
 * What these tests defend, in the order the change could go wrong:
 *
 *   1. The label reads as specified. The stub's one course is filed against
 *      Medicine / Cairo University, so the option must read
 *      `Anatomy 101 (Medicine – Cairo University)`.
 *   2. The option's VALUE is still the course id. This was always meant to be
 *      a display change; if the value drifted to the label, every generated
 *      batch would be filed against a string that is not a course.
 *   3. Generation still works end to end and the request still carries the
 *      bare id. The assertion is on the outgoing request body, because that
 *      is the part the database sees.
 */

const COURSE_ID = 'course-1';
const EXPECTED_LABEL = 'Anatomy 101 (Medicine – Cairo University)';

/** Opens the dialog on the Codes page with the default COURSE target. */
async function openGenerateDialog(page: import('@playwright/test').Page) {
  await page.goto('/codes');
  await expect(page.getByRole('heading', { name: 'Codes', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Generate codes' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('generate codes — course picker labels', () => {
  test('shows the course with its college and university', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openGenerateDialog(page);

    const course = dialog.getByLabel('Course');

    // The option's text is the whole point of the change.
    await expect(
      course.locator('option', { hasText: EXPECTED_LABEL }),
    ).toHaveCount(1);

    // And the bare title must no longer be the entire label. `hasText` is a
    // substring match, so this asks for an option whose text is EXACTLY the
    // old label — which is what a reverted change would produce.
    await expect(course.locator('option').filter({ hasText: /^Anatomy 101$/ })).toHaveCount(
      0,
    );
  });

  test('keeps the course id as the option value', async ({ page, signIn }) => {
    await signIn('admin');
    const dialog = await openGenerateDialog(page);

    const course = dialog.getByLabel('Course');

    // Selecting by LABEL and then reading back the value proves the two are
    // wired the way they were: the operator picks the readable text, the form
    // holds the id.
    await course.selectOption({ label: EXPECTED_LABEL });
    await expect(course).toHaveValue(COURSE_ID);
  });

  test('generates a batch with the plain course id, not the label', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerateDialog(page);

    await dialog.getByLabel('Course').selectOption({ label: EXPECTED_LABEL });
    await dialog.getByLabel('Card price').fill('250');

    // Captured before the click so the listener is already attached.
    const generateRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/codes/generate') && request.method() === 'POST',
    );

    await dialog.getByRole('button', { name: /^Generate \d* ?codes$/ }).click();

    const body = (await (await generateRequest).postDataJSON()) as {
      courseId?: string;
      targetType?: string;
    };

    // The id, and nothing decorative around it.
    expect(body.courseId).toBe(COURSE_ID);
    expect(body.targetType).toBe('COURSE');
  });
});

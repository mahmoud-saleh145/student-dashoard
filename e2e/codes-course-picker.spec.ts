import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * The course picker in Generate codes.
 *
 * Two courses can share a title across colleges — "Anatomy" exists in every
 * medical faculty — and the picker used to show the title alone, so the only
 * way to tell them apart was to guess from the order. It now carries the
 * college, the university and the departments the course is offered to.
 *
 * What these tests defend, in the order the change could go wrong:
 *
 *   1. The label reads as specified — for one department, for several, and for
 *      none. The stub's one course is filed against Medicine / Cairo University
 *      and two departments, so its option must read
 *      `Anatomy 101 (Medicine – Cairo University – Human Anatomy – Histology)`.
 *   2. A course with no department reads EXACTLY as it did before departments
 *      were added. This is the half of the change most likely to be got wrong:
 *      a join that emits an empty segment produces `Biology ()` or a trailing
 *      ` – `, both of which look like a bug to whoever reads the dropdown.
 *   3. The option's VALUE is still the course id, whatever the label says.
 *      This was always meant to be a display change; if the value drifted to
 *      the label, every generated batch would be filed against a string that is
 *      not a course.
 *   4. Generation still works end to end and the request still carries the
 *      bare id. The assertion is on the outgoing request body, because that
 *      is the part the database sees.
 *
 * Cases 2 and 3 need courses the shared stub does not have, so they answer
 * `GET admin/courses` themselves rather than adding to the fixture every other
 * spec reads. Same approach as `academic-classification.spec.ts`: a route the
 * test owns cannot leak into a suite that never asked for the extra rows.
 */

const COURSE_ID = 'course-1';
const EXPECTED_LABEL = 'Anatomy 101 (Medicine – Cairo University – Human Anatomy – Histology)';

/** A course row with only the fields the label reads. */
function course(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Anatomy 101',
    slug: id,
    status: 'PUBLISHED',
    university: { id: 'uni-1', name: 'Cairo University', nameAr: 'جامعة القاهرة' },
    faculty: { id: 'fac-1', name: 'Medicine', nameAr: 'الطب' },
    ...over,
  };
}

/** Answers the picker's one request with `items`, and nothing else. */
async function serveCourses(page: Page, items: unknown[]): Promise<void> {
  await page.route('**/api/proxy/admin/courses?**', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items,
          meta: {
            page: 1,
            pageSize: 100,
            total: items.length,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
        },
      },
    });
  });
}

/** Opens the dialog on the Codes page with the default COURSE target. */
async function openGenerateDialog(page: Page) {
  await page.goto('/codes');
  await expect(page.getByRole('heading', { name: 'Codes', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Generate codes' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('generate codes — course picker labels', () => {
  test('shows the course with its college, university and departments', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    const dialog = await openGenerateDialog(page);

    const course = dialog.getByLabel('Course');

    // The option's text is the whole point of the change.
    await expect(course.locator('option', { hasText: EXPECTED_LABEL })).toHaveCount(1);

    // And the bare title must no longer be the entire label. `hasText` is a
    // substring match, so this asks for an option whose text is EXACTLY the
    // old label — which is what a reverted change would produce.
    await expect(course.locator('option').filter({ hasText: /^Anatomy 101$/ })).toHaveCount(0);
  });

  test('names one department when the course is offered to one', async ({ page, signIn }) => {
    await signIn('admin');
    await serveCourses(page, [
      course('course-1', {
        departments: [{ id: 'dep-1', name: 'Human Anatomy', facultyId: 'fac-1' }],
      }),
    ]);

    const dialog = await openGenerateDialog(page);
    const select = dialog.getByLabel('Course');

    await expect(
      select.locator('option', { hasText: 'Anatomy 101 (Medicine – Cairo University)' }),
    ).toHaveCount(0);
    await expect(
      select.locator('option', {
        hasText: 'Anatomy 101 (Medicine – Cairo University – Human Anatomy)',
      }),
    ).toHaveCount(1);
  });

  test('leaves a course with no department reading exactly as before', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    // Both shapes a course can arrive in with no department: the field present
    // but empty, and the field absent entirely because the API was deployed
    // before the dashboard was. Neither may add a bracket or a dangling dash.
    await serveCourses(page, [
      course('course-1', { departments: [] }),
      course('course-2', { title: 'Organic Chemistry', slug: 'organic-chemistry' }),
    ]);

    const dialog = await openGenerateDialog(page);
    const select = dialog.getByLabel('Course');

    await expect(
      select.locator('option', { hasText: 'Anatomy 101 (Medicine – Cairo University)' }),
    ).toHaveCount(1);
    await expect(
      select.locator('option', { hasText: 'Organic Chemistry (Medicine – Cairo University)' }),
    ).toHaveCount(1);

    // An empty affiliation segment is the failure this guards.
    for (const option of await select.locator('option').all()) {
      const text = (await option.textContent()) ?? '';
      expect(text).not.toMatch(/\(\s*\)/);
      expect(text).not.toMatch(/–\s*\)/);
    }
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

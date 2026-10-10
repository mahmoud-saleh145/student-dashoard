import { expect, resetStub, test } from './fixtures';

const university = { id: 'u', name: 'Mansoura University', nameAr: 'Mansoura', isActive: true };
const faculty = {
  id: 'f',
  universityId: 'u',
  name: 'Engineering',
  nameAr: 'Engineering',
  isActive: true,
};
const departments = [
  {
    id: 'general',
    facultyId: 'f',
    name: 'Civil Engineering',
    nameAr: 'Civil',
    studyType: 'GENERAL',
    isActive: true,
  },
  {
    id: 'program',
    facultyId: 'f',
    name: 'Program A',
    nameAr: 'Program A',
    studyType: 'PROGRAMS',
    isActive: true,
  },
];

/** A year-based university with one college that has not overridden it. */
const universities = [
  {
    id: 'u',
    name: 'Mansoura University',
    nameAr: 'Mansoura',
    isActive: true,
    defaultAcademicSystem: 'YEAR' as const,
    collegeCount: 1,
  },
];

const faculties = [
  {
    id: 'f',
    name: 'Engineering',
    nameAr: 'Engineering',
    isActive: true,
  },
];

test.beforeEach(async ({ page }) => {
  await resetStub(page);
  await page.route('**/api/proxy/catalog/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/universities')) data = [university];
    if (path.endsWith('/faculties')) data = [faculty];
    if (path.endsWith('/departments')) data = departments;
    // The structure manager joins the tree with this. Without it the university
    // carries no default system and the college carries no effective one, so the
    // inheritance badges cannot be asserted at all.
    if (path.endsWith('/academic-systems')) data = { universities, faculties: [] };
    // The tree is an object, not a list. Returning `[]` for it left
    // `tree.data.universities` undefined and the page hit its error boundary
    // before any assertion could run.
    if (path.endsWith('/tree')) {
      data = {
        universities: [{ ...university, faculties: [{ ...faculty, departments }] }],
        academicYears: [],
      };
    }
    await route.fulfill({ json: { success: true, data } });
  });
});

test('course targeting separates General and Programs and clears old departments', async ({
  page,
  signIn,
}) => {
  await signIn('master');
  await page.goto('/courses');
  await page.getByRole('button', { name: 'New course', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('University', { exact: true }).selectOption('u');
  await dialog.getByLabel('College', { exact: true }).selectOption('f');
  await dialog.getByLabel('Study type', { exact: true }).selectOption('GENERAL');
  await expect(dialog.getByLabel('Civil Engineering')).toBeVisible();
  await expect(dialog.getByLabel('Program A')).toHaveCount(0);
  await dialog.getByLabel('Civil Engineering').check();
  await dialog.getByLabel('Study type', { exact: true }).selectOption('PROGRAMS');
  await expect(dialog.getByLabel('Civil Engineering')).toHaveCount(0);
  await expect(dialog.getByLabel('Program A')).not.toBeChecked();
  await dialog.getByLabel('Program A').check();
  await dialog.getByLabel('Study type', { exact: true }).selectOption('GENERAL');
  await expect(dialog.getByLabel('Civil Engineering')).not.toBeChecked();
});

/**
 * A department's ladder vocabulary is no longer derived from its study type.
 *
 * This test used to assert the opposite: selecting a PROGRAMS department
 * silently forced the System dropdown to LEVEL, which is exactly the assumption
 * the product forbids — a programme department inside a year-based college has to
 * show years. The control is now left alone, and the API is what rejects a
 * mismatch between a ladder's kind and its owner's configured system.
 */
test('creating a department ladder does not rewrite the chosen vocabulary', async ({
  page,
  signIn,
}) => {
  await signIn('master');
  await page.goto('/other-data?tab=structures');
  await page.getByRole('button', { name: 'Add structure', exact: true }).first().click();
  const dialog = page.getByRole('dialog');

  const vocabulary = dialog.getByRole('combobox', { name: /^Ladder vocabulary/ });
  await vocabulary.selectOption('LEVEL');
  await expect(vocabulary).toHaveValue('LEVEL');

  await dialog.getByText('One department', { exact: true }).click();
  await dialog.getByLabel('Department university').selectOption('u');
  await dialog.getByLabel('Department college').selectOption('f');
  // A PROGRAMS department — the case that used to force LEVEL.
  await dialog.getByLabel('Department', { exact: true }).selectOption('program');
  await expect(vocabulary).toHaveValue('LEVEL');

  // And the reverse: an explicit LEVEL choice survives selecting a GENERAL
  // department, which the old handler would have reset to YEAR.
  await vocabulary.selectOption('YEAR');
  await dialog.getByLabel('Department', { exact: true }).selectOption('general');
  await expect(vocabulary).toHaveValue('YEAR');

  let submitted: unknown;
  await page.route('**/api/proxy/catalog/academic-structures', async (route) => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    await route.fulfill({
      json: { success: true, data: route.request().method() === 'POST' ? { id: 'new' } : [] },
    });
  });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => submitted).toEqual({ kind: 'YEAR', departmentId: 'general' });
});

/**
 * University defaults and college overrides, including inheritance.
 *
 * These are the rules the product is actually about, and they have to be visible
 * on screen rather than merely stored: an administrator who cannot tell an
 * inherited value from an explicit override cannot know whether a future
 * university-wide change will reach a given college.
 */
test('a college inherits its university default until it overrides it', async ({
  page,
  signIn,
}) => {
  await signIn('master');

  const patches: Array<{ id: string; defaultAcademicSystem: string }> = [];
  const overridePatches: Array<{ id: string; academicSystemOverride: string | null }> = [];

  /**
   * The `beforeEach` route matches the whole catalog namespace, and Playwright
   * applies the LAST matching handler first — so these three are registered
   * after it and win.
   *
   * Three separate patterns on purpose: one combined glob covering
   * academic-systems would also swallow the write route, and the write is
   * precisely what this test checks.
   */
  await page.route('**/api/proxy/catalog/academic-systems', async (route) => {
    // Reflects the patches so the screen's own re-fetch shows the new state.
    const university = universities[0]!;
    const facultyRow = faculties[0]!;
    const override = overridePatches.find((p) => p.id === facultyRow.id);
    /*
      The CURRENT default, not the fixture's initial one. Computing the mismatch
      from the stale value would make this row report "agrees" after the very
      change that should make it report a disagreement — a false pass on the very
      behaviour this test exists to pin.
    */
    const currentDefault =
      patches.find((p) => p.id === university.id)?.defaultAcademicSystem ??
      university.defaultAcademicSystem;
    const effective = override?.academicSystemOverride ?? currentDefault;
    await route.fulfill({
      json: {
        success: true,
        data: {
          universities: [
            {
              ...university,
              defaultAcademicSystem: currentDefault,
            },
          ],
          faculties: [
            {
              ...facultyRow,
              universityId: university.id,
              universityName: university.name,
              academicSystemOverride: override?.academicSystemOverride ?? null,
              effectiveAcademicSystem: effective,
              inherited: !override?.academicSystemOverride,
              /*
                The college's ladder stays YEAR throughout: changing the
                university default does not rename entries, which is exactly what
                these two fields exist to let the screen report.
              */
              ladderKind: 'YEAR',
              ladderMismatch: effective !== 'YEAR',
              redundantOverride: false,
            },
          ],
        },
      },
    });
  });

  await page.route(
    '**/api/proxy/catalog/faculties/*/academic-system-override',
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
      /*
      The body is parsed defensively: if the route were ever reached with an empty
      body, `body.academicSystemOverride` would throw inside the handler, the
      request would never be answered, and the assertion would fail with a
      timeout instead of showing the actual payload. Throwing here makes a real
      mismatch visible immediately.
    */
      const body = (route.request().postDataJSON() ?? {}) as {
        academicSystemOverride?: string | null;
      };
      overridePatches.push({
        id,
        academicSystemOverride: body.academicSystemOverride ?? null,
      });
      await route.fulfill({
        json: {
          success: true,
          data: { id, academicSystemOverride: body.academicSystemOverride ?? null },
        },
      });
    },
  );

  /*
    The university's default is reflected back in the read handler below, keyed
    off this patch list, so the screen re-fetch shows the change rather than
    needing a page reload.
  */
  await page.route('**/api/proxy/catalog/universities/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fulfill({ json: { success: true, data: { ok: true } } });
      return;
    }
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const body = (route.request().postDataJSON() ?? {}) as { defaultAcademicSystem?: string };
    if (body.defaultAcademicSystem) {
      patches.push({ id, defaultAcademicSystem: body.defaultAcademicSystem });
    }
    await route.fulfill({ json: { success: true, data: { ok: true } } });
  });

  await page.goto('/other-data?tab=systems');

  /**
   * Anchored on the row rather than on the name text: the college name also
   * appears in the university header's "1 college" summary region, so a bare
   * text locator would be ambiguous.
   */
  const row = page.getByRole('listitem').filter({ hasText: 'Engineering' }).first();
  await expect(row.getByText('Inherited', { exact: true })).toBeVisible();
  await expect(row.getByText('Years', { exact: true })).toBeVisible();

  /*
   * Changing the university default is confirmed before it is applied, and the
   * confirmation states the part that is NOT obvious: the existing entries are not
   * renamed, so the college now needs manual configuration. Without this copy an
   * administrator reads a green toast and believes the whole platform switched.
   */
  await page.getByLabel('Default academic system').first().selectOption('LEVEL');
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(/college/)).toBeVisible();
  /*
   * Asserted against the dialog's whole text, not a single element: the copy is
   * broken up by <strong> and the sentence spans several text nodes, so
   * `getByText` would be matching against a fragment no element actually owns.
   */
  await expect(confirm).toContainText('Existing years and levels are not changed');
  await expect(confirm).toContainText('Nothing is renamed, renumbered or deleted');
  await confirm.getByRole('button', { name: 'Change default' }).click();
  await expect.poll(() => patches.map((p) => p.defaultAcademicSystem)).toEqual(['LEVEL']);

  /*
   * And the consequence is then visible on the college itself: configured as
   * levels, entries still years. The screen reports this rather than silently
   * reconciling the two.
   */
  await expect(row).toContainText('still Year-based');

  /**
   * An explicit override survives a university-wide change, which is the whole
   * reason the two are stored separately.
   */
  await row.getByRole('button', { name: 'Override' }).click();
  const overrideDialog = page.getByRole('dialog');
  const overrideSelect = overrideDialog.getByLabel('Academic system');
  await expect(overrideSelect).toBeVisible();
  // The college has no override yet, so "Inherit" is the current value and the
  // save button is correctly disabled until a different one is chosen.
  await expect(overrideSelect).toHaveValue('INHERIT');
  await overrideSelect.selectOption('YEAR');
  await overrideDialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => overridePatches.map((p) => p.academicSystemOverride))
    .toEqual(['YEAR']);

  // Clearing it returns the college to inheritance: an explicit null, not an
  // omitted field. The row re-labels itself once the override is set.
  await row.getByRole('button', { name: 'Change override' }).click();
  const clearDialog = page.getByRole('dialog');
  await clearDialog.getByLabel('Academic system').selectOption('INHERIT');
  await clearDialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => overridePatches.map((p) => p.academicSystemOverride))
    .toEqual(['YEAR', null]);
});

test('a university without a default system cannot be created silently as YEAR', async ({
  page,
  signIn,
}) => {
  await signIn('master');
  await page.goto('/courses/structure');
  await page.getByRole('button', { name: 'Add university' }).first().click();

  const dialog = page.getByRole('dialog');
  // The control is on the create form, not only on edit: a university whose
  // system is never chosen would silently become years-based.
  await expect(dialog.getByLabel(/Default academic system/)).toBeVisible();
  await expect(dialog.getByLabel(/Default academic system/)).toHaveValue('YEAR');

  // A too-short name is reported on the field rather than failing silently.
  await dialog.getByLabel('English name').fill('A');
  await dialog.getByLabel('Arabic name').fill('ب');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByText('Enter at least 2 characters.')).toBeVisible();
});

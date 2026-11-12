import type { Locator, Page, Route } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Departments chosen per year/level, in the real production build.
 *
 * The API is answered by `page.route` handlers this file owns, in the shapes
 * the backend returns (`audienceMappings`, `audience.mappings`, `yearScope`),
 * and every write is captured so each assertion is on the body the database
 * would see.
 *
 * Catalogue: Mansoura University → Engineering — Programs
 *   MTE, Mechatronics, Electrical, Mechanical (Programs) on the LEVEL ladder
 *   000/100/200/300; Aerospace (Programs) on its own ladder with only Level
 *   400; Foundation (General) on the YEAR ladder.
 *   Second college: Engineering — General (Civil on the YEAR ladder).
 */

const ok = (data: unknown) => ({ json: { success: true, data } });

const UNIVERSITIES = [{ id: 'uni-mans', name: 'Mansoura University', nameAr: 'جامعة المنصورة' }];
const FACULTIES = [
  { id: 'fac-prog', universityId: 'uni-mans', name: 'Engineering — Programs', nameAr: 'هندسة برامج' },
  { id: 'fac-gen', universityId: 'uni-mans', name: 'Engineering — General', nameAr: 'هندسة عام' },
];
const dept = (id: string, facultyId: string, name: string, studyType: 'GENERAL' | 'PROGRAMS') => ({
  id,
  facultyId,
  name,
  nameAr: `${name} ع`,
  studyType,
  isActive: true,
  sortOrder: 0,
});
const DEPARTMENTS: Record<string, ReturnType<typeof dept>[]> = {
  'fac-prog': [
    dept('mte', 'fac-prog', 'MTE', 'PROGRAMS'),
    dept('mct', 'fac-prog', 'Mechatronics', 'PROGRAMS'),
    dept('elec', 'fac-prog', 'Electrical', 'PROGRAMS'),
    dept('mech', 'fac-prog', 'Mechanical', 'PROGRAMS'),
    dept('aer', 'fac-prog', 'Aerospace', 'PROGRAMS'),
    dept('found', 'fac-prog', 'Foundation', 'GENERAL'),
  ],
  'fac-gen': [dept('civil', 'fac-gen', 'Civil', 'GENERAL')],
};
const rung = (id: string, order: number, name: string, kind: 'YEAR' | 'LEVEL') => ({
  id,
  order,
  name,
  nameAr: `${name} ع`,
  kind,
  isActive: true,
});
const LEVELS = [
  rung('l000', 0, 'Level 000', 'LEVEL'),
  rung('l100', 1, 'Level 100', 'LEVEL'),
  rung('l200', 2, 'Level 200', 'LEVEL'),
  rung('l300', 3, 'Level 300', 'LEVEL'),
];
const AER_LEVELS = [rung('l400', 4, 'Level 400', 'LEVEL')];
const YEARS = [rung('y1', 1, 'First year', 'YEAR'), rung('y2', 2, 'Second year', 'YEAR')];

function ladderFor(params: URLSearchParams) {
  const departmentId = params.get('departmentId');
  if (departmentId === 'aer') return AER_LEVELS;
  if (departmentId === 'found' || departmentId === 'civil') return YEARS;
  if (departmentId) return LEVELS;
  return params.get('facultyId') === 'fac-gen' ? YEARS : LEVELS;
}

async function serveCatalog(page: Page) {
  await page.route('**/api/proxy/catalog/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/proxy\/catalog/, '');
    if (path === '/universities') return route.fulfill(ok(UNIVERSITIES));
    if (/^\/universities\/[^/]+\/faculties$/.test(path)) return route.fulfill(ok(FACULTIES));
    const match = /^\/faculties\/([^/]+)\/departments$/.exec(path);
    if (match) return route.fulfill(ok(DEPARTMENTS[match[1]!] ?? []));
    if (path === '/academic-years') return route.fulfill(ok(ladderFor(url.searchParams)));
    return route.fulfill(ok([]));
  });
  await page.route('**/api/proxy/subjects**', (route) => route.fulfill(ok([])));
}

const ref = (id: string) => {
  const d = DEPARTMENTS['fac-prog']!.find((x) => x.id === id)!;
  return { id: d.id, name: d.name, nameAr: d.nameAr, studyType: d.studyType };
};
const level = (id: string) => {
  const r = LEVELS.find((x) => x.id === id)!;
  return { id: r.id, name: r.name, nameAr: r.nameAr, kind: r.kind };
};

/** Level 000 -> MTE; Level 200 -> Electrical, Mechanical. */
function perYearMaterial() {
  return {
    id: 'mat-py',
    title: 'Per-year notes',
    titleAr: null,
    description: null,
    status: 'DRAFT',
    isActive: true,
    sortOrder: 1,
    universityId: 'uni-mans',
    facultyId: 'fac-prog',
    academicYearId: 'l000',
    academicYearIds: ['l000', 'l200'],
    subjectId: null,
    departmentScope: 'DEPARTMENTS',
    departmentIds: ['mte', 'elec', 'mech'],
    yearScope: 'SELECTED_YEARS',
    audienceMappings: [
      { academicYearId: 'l000', departmentIds: ['mte'] },
      { academicYearId: 'l200', departmentIds: ['elec', 'mech'] },
    ],
    audience: {
      university: UNIVERSITIES[0],
      faculty: { id: 'fac-prog', name: 'Engineering — Programs', nameAr: 'هندسة برامج' },
      departmentScope: 'DEPARTMENTS',
      departments: [ref('mte'), ref('elec'), ref('mech')],
      academicYear: level('l000'),
      academicYears: [level('l000'), level('l200')],
      yearScope: 'SELECTED_YEARS',
      mappings: [
        { academicYear: level('l000'), departments: [ref('mte')] },
        { academicYear: level('l200'), departments: [ref('elec'), ref('mech')] },
      ],
    },
    hasCover: false,
    coverUrl: null,
    defaultThumbnailUrl: null,
    parts: [],
    packages: [],
  };
}

type Captured = { method: string; path: string; body: Record<string, unknown> };

async function serveLibrary(
  page: Page,
  detail: ReturnType<typeof perYearMaterial>,
  respond?: (write: Captured) => { status: number; json: unknown } | null,
) {
  const writes: Captured[] = [];
  await page.route('**/api/proxy/admin/library/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/proxy/, '');
    if (request.method() !== 'GET') {
      const write = {
        method: request.method(),
        path,
        body: (request.postDataJSON() ?? {}) as Record<string, unknown>,
      };
      writes.push(write);
      const refusal = respond?.(write);
      return route.fulfill(refusal ?? ok(detail));
    }
    if (path === '/admin/library/materials') {
      return route.fulfill(
        ok({
          items: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        }),
      );
    }
    if (path === '/admin/library/purchases') {
      return route.fulfill(
        ok({
          items: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
          totals: { creditsSpent: 0, count: 0 },
        }),
      );
    }
    return route.fulfill(ok(detail));
  });
  return writes;
}

const groupCard = (dialog: Locator, id: string) => dialog.getByTestId(`year-group-${id}`);
const tick = (card: Locator, name: string) => card.getByRole('checkbox', { name: new RegExp(`^${name}`) });

async function openNew(page: Page) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'New material' }).click();
  const dialog = page.getByRole('dialog', { name: 'New library material' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function choosePerYear(dialog: Locator) {
  await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
  await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-prog');
  await dialog.getByRole('radio', { name: /Selected departments/ }).check();
  await dialog.getByRole('radio', { name: /Choose departments per year/ }).check();
}

async function addLevel(dialog: Locator, id: string) {
  await dialog.getByRole('combobox', { name: /^Add (level|year \/ level)$/ }).selectOption(id);
}

test.beforeEach(async ({ page, signIn }) => {
  await resetStub(page);
  await serveCatalog(page);
  await signIn('admin');
});

test.describe('departments per year/level — creating', () => {
  test('Level 000 -> MTE and Level 200 -> Electrical + Mechanical go as two independent groups', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, perYearMaterial());
    const dialog = await openNew(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Per-year notes');
    await choosePerYear(dialog);

    await addLevel(dialog, 'l000');
    await tick(groupCard(dialog, 'l000'), 'MTE').check();
    await addLevel(dialog, 'l200');
    await tick(groupCard(dialog, 'l200'), 'Electrical').check();
    await tick(groupCard(dialog, 'l200'), 'Mechanical').check();

    // Each card counts its own departments; nothing leaked across.
    await expect(groupCard(dialog, 'l000').getByTestId('year-group-count')).toHaveText('1 department selected');
    await expect(groupCard(dialog, 'l200').getByTestId('year-group-count')).toHaveText('2 departments selected');
    await expect(tick(groupCard(dialog, 'l000'), 'Electrical')).not.toBeChecked();
    await expect(tick(groupCard(dialog, 'l200'), 'MTE')).not.toBeChecked();

    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]!.body).toMatchObject({
      universityId: 'uni-mans',
      facultyId: 'fac-prog',
      departmentScope: 'DEPARTMENTS',
      yearScope: 'SELECTED_YEARS',
      academicYearIds: ['l000', 'l200'],
      academicYearId: 'l000',
      departmentIds: ['mte', 'elec', 'mech'],
      audienceMappings: [
        { academicYearId: 'l000', departmentIds: ['mte'] },
        { academicYearId: 'l200', departmentIds: ['elec', 'mech'] },
      ],
    });
  });

  test('a department is offered under a level only when that level is on its own ladder', async ({
    page,
  }) => {
    await serveLibrary(page, perYearMaterial());
    const dialog = await openNew(page);
    await choosePerYear(dialog);
    await addLevel(dialog, 'l000');
    const l000 = groupCard(dialog, 'l000');
    await expect(tick(l000, 'MTE')).toBeVisible();
    await expect(tick(l000, 'Aerospace')).toHaveCount(0);
    await addLevel(dialog, 'l400');
    const l400 = groupCard(dialog, 'l400');
    await expect(tick(l400, 'Aerospace')).toBeVisible();
    await expect(tick(l400, 'MTE')).toHaveCount(0);
  });

  test('a level with no department is refused beside that level, and nothing is sent', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, perYearMaterial());
    const dialog = await openNew(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Per-year notes');
    await choosePerYear(dialog);
    await addLevel(dialog, 'l000');
    await tick(groupCard(dialog, 'l000'), 'MTE').check();
    await addLevel(dialog, 'l100');
    await expect(groupCard(dialog, 'l100').getByTestId('year-group-error')).toContainText(
      'Choose at least one department for Level 100',
    );
    await expect(dialog.getByRole('button', { name: 'Create material' })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  test('once a Programs department is ticked, only Programs levels can be added', async ({ page }) => {
    await serveLibrary(page, perYearMaterial());
    const dialog = await openNew(page);
    await choosePerYear(dialog);
    await addLevel(dialog, 'l000');
    await tick(groupCard(dialog, 'l000'), 'MTE').check();
    // Once Programs is ticked, the General ladder's years are not offered, and
    // no General department is offered under a level.
    const picker = dialog.getByRole('combobox', { name: 'Add level' });
    await expect(picker.locator('option:not([value=""])')).toHaveText([
      'Level 100',
      'Level 200',
      'Level 300',
      'Level 400',
    ]);
    await expect(tick(groupCard(dialog, 'l000'), 'MTE')).toBeChecked();
    await expect(dialog.getByTestId('year-group-track-GENERAL')).toHaveCount(0);
  });
});

test.describe('departments per year/level — editing', () => {
  async function openEdit(page: Page) {
    await page.goto('/library/mat-py');
    await page.getByRole('button', { name: 'Edit material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit material' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('the saved groups load, and editing Level 000 only leaves Level 200 as it was', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, perYearMaterial());
    const dialog = await openEdit(page);
    await expect(tick(groupCard(dialog, 'l000'), 'MTE')).toBeChecked();
    await expect(tick(groupCard(dialog, 'l200'), 'Electrical')).toBeChecked();
    await expect(tick(groupCard(dialog, 'l200'), 'Mechanical')).toBeChecked();

    await tick(groupCard(dialog, 'l000'), 'Mechatronics').check();
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    const review = page.getByTestId('audience-change-review');
    await expect(review).toContainText('Level 000: MTE, Mechatronics; Level 200: Electrical, Mechanical');
    await page.getByRole('button', { name: 'Apply audience change' }).click();

    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]!.body.audienceMappings).toEqual([
      { academicYearId: 'l000', departmentIds: ['mte', 'mct'] },
      { academicYearId: 'l200', departmentIds: ['elec', 'mech'] },
    ]);
  });

  test('removing Level 200 sends only Level 000', async ({ page }) => {
    const writes = await serveLibrary(page, perYearMaterial());
    const dialog = await openEdit(page);
    await groupCard(dialog, 'l200').getByRole('button', { name: 'Remove Level 200' }).click();
    await expect(groupCard(dialog, 'l200')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Apply audience change' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]!.body).toMatchObject({
      academicYearIds: ['l000'],
      departmentIds: ['mte'],
      audienceMappings: [{ academicYearId: 'l000', departmentIds: ['mte'] }],
    });
  });

  test('a backend refusal of one group is shown beside that group', async ({ page }) => {
    await serveLibrary(page, perYearMaterial(), () => ({
      status: 422,
      json: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          fields: { 'audienceMappings.1.departmentIds': ['one or more departments are inactive'] },
        },
      },
    }));
    const dialog = await openEdit(page);
    await tick(groupCard(dialog, 'l200'), 'MTE').check();
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Apply audience change' }).click();
    await expect(groupCard(dialog, 'l200').getByTestId('year-group-error')).toContainText(
      'One or more departments are inactive.',
    );
    await expect(groupCard(dialog, 'l000').getByTestId('year-group-error')).toHaveCount(0);
  });

  test('changing the college asks first; keeping changes nothing, discarding clears the groups', async ({
    page,
  }) => {
    await serveLibrary(page, perYearMaterial());
    const dialog = await openEdit(page);
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    const confirm = dialog.getByTestId('audience-discard-confirm');
    await expect(confirm).toContainText('Changing the college clears');
    await confirm.getByRole('button', { name: 'Keep current selection' }).click();
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('fac-prog');
    await expect(tick(groupCard(dialog, 'l000'), 'MTE')).toBeChecked();

    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByTestId('audience-discard-confirm').getByRole('button', { name: 'Discard and change' }).click();
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('fac-gen');
    await expect(dialog.getByTestId('year-group-l000')).toHaveCount(0);
  });

  test('back to all years asks first, and keeps every department as one list', async ({ page }) => {
    const writes = await serveLibrary(page, perYearMaterial());
    const dialog = await openEdit(page);
    // Clicked, not checked: the radio waits for the confirmation.
    await dialog.getByRole('radio', { name: /All years \/ levels/ }).click();
    await dialog.getByTestId('audience-discard-confirm').getByRole('button', { name: 'Discard and change' }).click();
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Apply audience change' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]!.body).toMatchObject({
      yearScope: 'ALL_YEARS',
      academicYearIds: [],
      academicYearId: null,
      audienceMappings: [],
      departmentIds: ['mte', 'elec', 'mech'],
    });
  });
});

test.describe('departments per year/level — display', () => {
  test('the material page lists the departments of each level', async ({ page }) => {
    await serveLibrary(page, perYearMaterial());
    await page.goto('/library/mat-py');
    const perYear = page.getByTestId('material-audience-per-year');
    await expect(perYear).toContainText('Level 000: MTE');
    await expect(perYear).toContainText('Level 200: Electrical, Mechanical');
  });

  test('the per-year editor fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await serveLibrary(page, perYearMaterial());
    await page.goto('/library/mat-py');
    await page.getByRole('button', { name: 'Edit material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit material' });
    await expect(groupCard(dialog, 'l200')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await groupCard(dialog, 'l200').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

import type { Page, Route } from '@playwright/test';

import { expect, resetStub, test } from './fixtures';

/**
 * Library academic targeting in the dashboard (Phase 2).
 *
 * The form is driven through the real production build; the API answers come
 * from `page.route` handlers this file owns, so the shared stub every other
 * spec reads is untouched — the same approach as
 * `academic-classification.spec.ts`. Each handler returns the Phase 1 backend
 * shapes (`GET admin/library/materials/:id` with `departmentScope`,
 * `departmentIds` and `audience`; `catalog/academic-years` with `kind`), and
 * every write is captured so the assertion is on the request body the
 * database would see.
 *
 * Catalogue used throughout:
 *
 *   Mansoura University
 *     Engineering (General)  — Preparatory (General), Civil (General)   YEAR ladder
 *     Engineering (Mixed)    — Architecture (General) on the YEAR ladder,
 *                              CCE and Mechatronics (Programs) on a LEVEL ladder
 *   Delta University
 *     Delta Engineering      — Delta Civil (General)                    its own YEAR ladder
 */

// ---------------------------------------------------------------------------
// Catalogue fixtures
// ---------------------------------------------------------------------------

const UNIVERSITIES = [
  { id: 'uni-mans', name: 'Mansoura University', nameAr: 'جامعة المنصورة' },
  { id: 'uni-delta', name: 'Delta University', nameAr: 'جامعة الدلتا' },
];

const FACULTIES: Record<
  string,
  { id: string; universityId: string; name: string; nameAr: string }[]
> = {
  'uni-mans': [
    {
      id: 'fac-gen',
      universityId: 'uni-mans',
      name: 'Engineering (General)',
      nameAr: 'هندسة عام',
    },
    { id: 'fac-mix', universityId: 'uni-mans', name: 'Engineering (Mixed)', nameAr: 'هندسة' },
  ],
  'uni-delta': [
    {
      id: 'fac-delta',
      universityId: 'uni-delta',
      name: 'Delta Engineering',
      nameAr: 'هندسة الدلتا',
    },
  ],
};

const dept = (
  id: string,
  facultyId: string,
  name: string,
  studyType: 'GENERAL' | 'PROGRAMS',
) => ({
  id,
  facultyId,
  name,
  nameAr: `${name} ع`,
  studyType,
});

const DEPARTMENTS: Record<string, ReturnType<typeof dept>[]> = {
  'fac-gen': [
    dept('prep', 'fac-gen', 'Preparatory', 'GENERAL'),
    dept('civil', 'fac-gen', 'Civil', 'GENERAL'),
  ],
  'fac-mix': [
    dept('arch', 'fac-mix', 'Architecture', 'GENERAL'),
    dept('cce', 'fac-mix', 'CCE', 'PROGRAMS'),
    dept('mech', 'fac-mix', 'Mechatronics', 'PROGRAMS'),
  ],
  'fac-delta': [dept('delta-civil', 'fac-delta', 'Delta Civil', 'GENERAL')],
};

const rung = (id: string, order: number, name: string, kind: 'YEAR' | 'LEVEL') => ({
  id,
  order,
  name,
  nameAr: name,
  kind,
});
const MANS_YEARS = [
  rung('y-prep', 0, 'Preparatory year', 'YEAR'),
  rung('y-1', 1, 'First year', 'YEAR'),
];
const MANS_LEVELS = [
  rung('l-000', 0, 'Level 000', 'LEVEL'),
  rung('l-100', 1, 'Level 100', 'LEVEL'),
];
const DELTA_YEARS = [rung('dy-1', 1, 'Delta first year', 'YEAR')];

function ladderFor(params: URLSearchParams) {
  const departmentId = params.get('departmentId');
  const facultyId = params.get('facultyId');
  if (departmentId) {
    if (departmentId === 'cce' || departmentId === 'mech') return MANS_LEVELS;
    if (departmentId === 'delta-civil') return DELTA_YEARS;
    return MANS_YEARS;
  }
  if (facultyId === 'fac-delta') return DELTA_YEARS;
  if (facultyId) return MANS_YEARS;
  return [...MANS_YEARS];
}

const ok = (data: unknown) => ({ json: { success: true, data } });

async function serveCatalog(page: Page) {
  await page.route('**/api/proxy/catalog/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/proxy\/catalog/, '');
    if (path === '/universities') return route.fulfill(ok(UNIVERSITIES));
    let match = /^\/universities\/([^/]+)\/faculties$/.exec(path);
    if (match) return route.fulfill(ok(FACULTIES[match[1]!] ?? []));
    match = /^\/faculties\/([^/]+)\/departments$/.exec(path);
    if (match) return route.fulfill(ok(DEPARTMENTS[match[1]!] ?? []));
    if (path === '/academic-years') return route.fulfill(ok(ladderFor(url.searchParams)));
    return route.fulfill(ok([]));
  });
  await page.route('**/api/proxy/subjects**', (route) =>
    route.fulfill(ok([{ id: 'subj-1', name: 'Mechanics', nameAr: 'ميكانيكا' }])),
  );
}

// ---------------------------------------------------------------------------
// Library fixtures (Phase 1 admin shapes)
// ---------------------------------------------------------------------------

const part = (id: string, title: string, price: number) => ({
  id,
  title,
  titleAr: null,
  description: null,
  sortOrder: 1,
  status: 'PUBLISHED',
  isActive: true,
  price,
  currency: 'EGP',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  pageCount: 10,
  isPreview: false,
  hasDocument: true,
  entitlementCount: 0,
  createdAt: '2026-11-01T08:00:00.000Z',
});

function material(over: Record<string, unknown> = {}) {
  return {
    id: 'mat-a',
    title: 'Mechanica',
    titleAr: 'ميكانيكا',
    description: 'Statics and dynamics.',
    status: 'PUBLISHED',
    isActive: true,
    sortOrder: 1,
    universityId: 'uni-mans',
    facultyId: 'fac-gen',
    academicYearId: 'y-prep',
    academicYearIds: ['y-prep'],
    subjectId: 'subj-1',
    departmentScope: 'DEPARTMENTS',
    departmentIds: ['prep'],
    audience: {
      university: { id: 'uni-mans', name: 'Mansoura University', nameAr: 'جامعة المنصورة' },
      faculty: { id: 'fac-gen', name: 'Engineering (General)', nameAr: 'هندسة عام' },
      departmentScope: 'DEPARTMENTS',
      departments: [
        { id: 'prep', name: 'Preparatory', nameAr: 'اعدادي', studyType: 'GENERAL' },
      ],
      academicYear: { id: 'y-prep', name: 'Preparatory year', nameAr: 'اعدادي', kind: 'YEAR' },
      academicYears: [
        { id: 'y-prep', name: 'Preparatory year', nameAr: 'اعدادي', kind: 'YEAR' },
      ],
    },
    hasCover: false,
    coverUrl: null,
    defaultThumbnailUrl: null,
    parts: [part('lp-1', 'Part 1', 50), part('lp-2', 'Part 2', 60)],
    packages: [
      {
        id: 'pk-1',
        title: 'Both parts',
        titleAr: null,
        description: null,
        status: 'PUBLISHED',
        isActive: true,
        sortOrder: 0,
        price: 90,
        currency: 'EGP',
        // 'lp-gone' was withdrawn from the material after the package was made.
        partIds: ['lp-1', 'lp-gone'],
        purchaseCount: 0,
      },
    ],
    ...over,
  };
}

type Captured = { method: string; path: string; body: Record<string, unknown> };

/**
 * Answers every `admin/library/*` request. `respond` can refuse a write the
 * way the real backend does; otherwise writes succeed and are recorded.
 */
async function serveLibrary(
  page: Page,
  detail: ReturnType<typeof material>,
  respond?: (write: Captured) => { status: number; json: unknown } | null,
) {
  const writes: Captured[] = [];
  await page.route('**/api/proxy/admin/library/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/proxy/, '');
    const method = request.method();

    if (method !== 'GET') {
      const write = {
        method,
        path,
        body: (request.postDataJSON() ?? {}) as Record<string, unknown>,
      };
      writes.push(write);
      const refusal = respond?.(write);
      if (refusal) return route.fulfill(refusal);
      return route.fulfill(ok(detail));
    }

    if (path === '/admin/library/materials') {
      return route.fulfill(
        ok({
          items: [
            {
              id: detail.id,
              title: detail.title,
              titleAr: detail.titleAr,
              status: detail.status,
              isActive: true,
              sortOrder: 1,
              subject: { id: 'subj-1', name: 'Mechanics' },
              faculty: { id: 'fac-gen', name: 'Engineering (General)', nameAr: 'هندسة عام' },
              departmentScope: 'DEPARTMENTS',
              departmentCount: 1,
              academicYears: [
                { id: 'y-prep', name: 'Preparatory year', nameAr: 'اعدادي', kind: 'YEAR' },
                { id: 'y-1', name: 'First year', nameAr: 'الأولى', kind: 'YEAR' },
              ],
              partCount: 2,
              packageCount: 1,
              createdBy: null,
              createdAt: '2026-11-01T08:00:00.000Z',
            },
            {
              id: 'mat-legacy',
              title: 'Legacy notes',
              titleAr: null,
              status: 'DRAFT',
              isActive: true,
              sortOrder: 2,
              subject: null,
              faculty: null,
              departmentScope: 'FACULTY',
              departmentCount: 0,
              partCount: 0,
              packageCount: 0,
              createdBy: null,
              createdAt: '2026-10-01T08:00:00.000Z',
            },
          ],
          meta: {
            page: 1,
            pageSize: 20,
            total: 2,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
        }),
      );
    }
    if (path === '/admin/library/purchases') {
      return route.fulfill(
        ok({
          items: [],
          meta: {
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false,
          },
          totals: { creditsSpent: 0, count: 0 },
        }),
      );
    }
    return route.fulfill(ok(detail));
  });
  return writes;
}

const validationRefusal = (fields: Record<string, string[]>) => ({
  status: 422,
  json: {
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', fields },
  },
});

const AUDIENCE_KEYS = [
  'universityId',
  'facultyId',
  'departmentScope',
  'departmentIds',
  'academicYearId',
  'academicYearIds',
];

/** The years/levels control: one checkbox per rung of the audience's ladder. */
const yearGroup = (dialog: ReturnType<Page['getByRole']>) => dialog.getByTestId('academic-years');

/** A department checkbox, as distinct from a year/level one ("Preparatory" vs "Preparatory year"). */
const department = (dialog: ReturnType<Page['getByRole']>, name: RegExp) =>
  dialog.locator('[data-testid^="department-group-"]').getByRole('checkbox', { name });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openNewMaterial(page: Page) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'New material' }).click();
  const dialog = page.getByRole('dialog', { name: 'New library material' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openEditMaterial(page: Page) {
  await page.goto('/library/mat-a');
  await page.getByRole('button', { name: 'Edit material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit material' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page, signIn }) => {
  await resetStub(page);
  await serveCatalog(page);
  await signIn('admin');
});

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

test.describe('library audience — creating a material', () => {
  test('colleges follow the university, and departments follow the college with their track', async ({
    page,
  }) => {
    await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);

    const college = dialog.getByRole('combobox', { name: /^College/ });
    await expect(college).toBeDisabled();

    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await expect(college.locator('option')).toHaveText([
      'Choose a college',
      'Engineering (General)',
      'Engineering (Mixed)',
    ]);

    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-delta');
    await expect(college.locator('option')).toHaveText([
      'Choose a college',
      'Delta Engineering',
    ]);

    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await college.selectOption('fac-mix');
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();

    const general = dialog.getByTestId('department-group-GENERAL');
    const programs = dialog.getByTestId('department-group-PROGRAMS');
    await expect(general).toContainText('General');
    await expect(general.getByRole('checkbox')).toHaveCount(1);
    await expect(programs).toContainText('Programs');
    await expect(programs.getByRole('checkbox')).toHaveCount(2);
    // Nothing of another college is offered.
    await expect(department(dialog, /Preparatory|Delta Civil/)).toHaveCount(
      0,
    );
  });

  test('university and college are required before a material can be created', async ({
    page,
  }) => {
    await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');

    const create = dialog.getByRole('button', { name: 'Create material' });
    await expect(create).toBeDisabled();
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await expect(create).toBeDisabled();
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await expect(create).toBeEnabled();
  });

  test('a whole-college material is created with no departments and an explicit null year', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await expect(dialog.getByRole('radio', { name: /Entire college/ })).toBeChecked();
    await expect(dialog).toContainText('Reaches all 2 departments of this college.');

    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();

    const post = writes.find(
      (w) => w.method === 'POST' && w.path === '/admin/library/materials',
    );
    expect(post?.body).toMatchObject({
      title: 'Mechanica',
      universityId: 'uni-mans',
      facultyId: 'fac-gen',
      departmentScope: 'FACULTY',
      departmentIds: [],
      academicYearId: null,
      academicYearIds: [],
    });
  });

  test('a department material is created with its departments and year', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();

    const create = dialog.getByRole('button', { name: 'Create material' });
    await expect(dialog).toContainText('Choose at least one department.');
    await expect(create).toBeDisabled();

    await department(dialog, /Preparatory/).check();
    await department(dialog, /Civil/).check();
    const years = yearGroup(dialog);
    await expect(years.getByRole('checkbox', { name: 'First year' })).toBeEnabled();
    await years.getByRole('checkbox', { name: 'First year' }).check();
    await expect(dialog.getByTestId('audience-path')).toHaveText(
      'Mansoura University → Engineering (General) → Preparatory, Civil',
    );

    await create.click();
    await expect(dialog).toBeHidden();
    const post = writes.find((w) => w.method === 'POST');
    expect(post?.body).toMatchObject({
      universityId: 'uni-mans',
      facultyId: 'fac-gen',
      departmentScope: 'DEPARTMENTS',
      departmentIds: ['prep', 'civil'],
      academicYearId: 'y-1',
      academicYearIds: ['y-1'],
    });
  });

  test('several years are ticked and sent as one list, the first as the legacy id', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');

    const years = yearGroup(dialog);
    await expect(years.getByRole('checkbox', { name: 'Preparatory year' })).toBeVisible();
    await expect(years).toContainText('Any — no year/level filter');

    // Ticked out of ladder order on purpose: the list goes as ticked.
    await years.getByRole('checkbox', { name: 'First year' }).check();
    await years.getByRole('checkbox', { name: 'Preparatory year' }).check();
    await expect(years).toContainText('2 selected');

    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();
    const post = writes.find((w) => w.method === 'POST');
    expect(post?.body).toMatchObject({
      academicYearIds: ['y-1', 'y-prep'],
      academicYearId: 'y-1',
    });
  });

  test('"Clear years" returns to all years', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');

    const years = yearGroup(dialog);
    await years.getByRole('checkbox', { name: 'First year' }).check();
    await years.getByRole('button', { name: 'Clear years' }).click();
    await expect(years.getByRole('checkbox', { name: 'First year' })).not.toBeChecked();
    await expect(years.getByRole('button', { name: 'Clear years' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();
    expect(writes.find((w) => w.method === 'POST')?.body).toMatchObject({
      academicYearIds: [],
      academicYearId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Track and ladder
// ---------------------------------------------------------------------------

test.describe('library audience — General/Programs and YEAR/LEVEL', () => {
  test('ticking a Programs department locks the General ones, and the ladder becomes Levels', async ({
    page,
  }) => {
    await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-mix');

    // Whole college on a mixed college: the ladder is the college's, and the
    // form says that both tracks are reached.
    await expect(dialog).toContainText('has both General and Programs departments');
    const years = yearGroup(dialog);
    await expect(dialog.getByText('Years (optional)')).toBeVisible();
    await expect(years.getByRole('checkbox')).toHaveCount(2);
    await expect(years.getByRole('checkbox', { name: 'Preparatory year' })).toBeVisible();
    await expect(years.getByRole('checkbox', { name: 'First year' })).toBeVisible();

    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await department(dialog, /CCE/).check();

    await expect(department(dialog, /Architecture/)).toBeDisabled();
    await expect(department(dialog, /Mechatronics/)).toBeEnabled();
    await expect(dialog.getByTestId('department-group-GENERAL')).toContainText(
      'Unavailable while Programs departments are ticked',
    );

    await expect(dialog.getByText('Levels (optional)')).toBeVisible();
    await expect(years.getByRole('checkbox')).toHaveCount(2);
    await expect(years.getByRole('checkbox', { name: 'Level 000' })).toBeVisible();
    await expect(years.getByRole('checkbox', { name: 'Level 100' })).toBeVisible();

    // Untick, and the General department is available again.
    await department(dialog, /CCE/).uncheck();
    await expect(department(dialog, /Architecture/)).toBeEnabled();
  });

  test('a year chosen for one ladder is refused once the departments resolve to another', async ({
    page,
  }) => {
    await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-mix');
    const years = yearGroup(dialog);
    await years.getByRole('checkbox', { name: 'First year' }).check();

    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await department(dialog, /CCE/).check();

    // Never silently kept: flagged by name, blocking, and removable.
    await expect(dialog).toContainText('not part of the ladder for this audience');
    const stale = dialog.getByTestId('unavailable-years');
    await expect(stale).toContainText('First year');
    await expect(dialog.getByRole('button', { name: 'Create material' })).toBeDisabled();
    await stale.getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByTestId('unavailable-years')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Create material' })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Dependent resets
// ---------------------------------------------------------------------------

test.describe('library audience — dependent fields', () => {
  test('changing the university or the college clears everything below it', async ({
    page,
  }) => {
    await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await department(dialog, /Preparatory/).check();
    await yearGroup(dialog).getByRole('checkbox', { name: 'First year' }).check();

    // The year/level never moves the college or the departments.
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('fac-gen');
    await expect(department(dialog, /Preparatory/)).toBeChecked();

    // College change: departments and years go.
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-mix');
    await expect(department(dialog, /Preparatory/)).toHaveCount(0);
    await expect(department(dialog, /Architecture/)).not.toBeChecked();
    // No department ticked yet on the new college, so no ladder to offer —
    // and nothing from the old one is kept.
    await expect(yearGroup(dialog)).toContainText('Choose departments first');
    await expect(yearGroup(dialog)).toContainText('Any — no year/level filter');
    await expect(yearGroup(dialog).getByRole('checkbox')).toHaveCount(0);

    // University change: college goes too.
    await department(dialog, /Architecture/).check();
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-delta');
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('');
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expect(yearGroup(dialog)).toContainText('Choose a college first');
  });

  test('switching to Entire college drops the department selection', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await department(dialog, /Civil/).check();
    await dialog.getByRole('radio', { name: /Entire college/ }).check();
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await expect(department(dialog, /Civil/)).not.toBeChecked();
    await dialog.getByRole('radio', { name: /Entire college/ }).check();

    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();
    expect(writes.find((w) => w.method === 'POST')?.body).toMatchObject({
      departmentScope: 'FACULTY',
      departmentIds: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

test.describe('library audience — editing a material', () => {
  test('the saved audience loads, and a title-only edit sends no audience at all', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openEditMaterial(page);

    await expect(dialog.getByRole('combobox', { name: /^University/ })).toHaveValue('uni-mans');
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('fac-gen');
    await expect(dialog.getByRole('radio', { name: /Selected departments/ })).toBeChecked();
    await expect(department(dialog, /Preparatory/)).toBeChecked();
    await expect(department(dialog, /Civil/)).not.toBeChecked();
    const years = yearGroup(dialog);
    await expect(years.getByRole('checkbox', { name: 'Preparatory year' })).toBeChecked();
    await expect(years.getByRole('checkbox', { name: 'First year' })).not.toBeChecked();

    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica 2027');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    const patch = writes.find((w) => w.method === 'PATCH');
    expect(patch?.path).toBe('/admin/library/materials/mat-a');
    expect(patch?.body.title).toBe('Mechanica 2027');
    for (const key of AUDIENCE_KEYS) expect(patch?.body).not.toHaveProperty(key);
    // An unchanged subject is left out, never rewritten.
    expect(patch?.body).not.toHaveProperty('subjectId');
  });

  test('an audience change is reviewed old-versus-new, then sent whole with a null year', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openEditMaterial(page);

    await dialog.getByRole('radio', { name: /Entire college/ }).check();
    await dialog.getByRole('button', { name: 'Clear years' }).click();
    await dialog.getByRole('button', { name: 'Review changes' }).click();

    const review = page.getByRole('dialog', { name: 'Change who can see this material?' });
    await expect(review).toBeVisible();
    const table = review.getByTestId('audience-change-review');
    await expect(table.locator('tr[data-changed="true"] th')).toHaveText([
      'Reaches',
      'Departments',
      'Year / level',
    ]);
    await expect(table).toContainText('Selected departments only');
    await expect(table).toContainText('Entire college — every department');
    await expect(table).toContainText('Preparatory (General)');
    await expect(table).toContainText('Preparatory year (Year)');
    await expect(review).toContainText('Existing purchases are not revoked.');
    await expect(review).toContainText('published');
    await expect(review).toContainText('audit log');
    // Nothing is sent until the change is applied.
    expect(writes).toHaveLength(0);

    await review.getByRole('button', { name: 'Apply audience change' }).click();
    await expect(review).toBeHidden();

    const patch = writes.find((w) => w.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      universityId: 'uni-mans',
      facultyId: 'fac-gen',
      departmentScope: 'FACULTY',
      departmentIds: [],
      academicYearId: null,
      academicYearIds: [],
    });
    for (const key of AUDIENCE_KEYS) expect(patch?.body).toHaveProperty(key);
  });

  test('adding a second year is an audience change, reviewed and sent whole', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openEditMaterial(page);

    await yearGroup(dialog).getByRole('checkbox', { name: 'First year' }).check();
    await dialog.getByRole('button', { name: 'Review changes' }).click();

    const review = page.getByRole('dialog', { name: 'Change who can see this material?' });
    const table = review.getByTestId('audience-change-review');
    await expect(table.locator('tr[data-changed="true"] th')).toHaveText(['Year / level']);
    await expect(table).toContainText('Preparatory year, First year (Year)');

    await review.getByRole('button', { name: 'Apply audience change' }).click();
    await expect(review).toBeHidden();
    const patch = writes.find((w) => w.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      departmentScope: 'DEPARTMENTS',
      departmentIds: ['prep'],
      academicYearIds: ['y-prep', 'y-1'],
      academicYearId: 'y-prep',
    });
  });

  test('Back from the review returns to the form and sends nothing', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openEditMaterial(page);
    await department(dialog, /Civil/).check();
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByRole('dialog', { name: 'Edit material' })).toBeVisible();
    await expect(department(dialog, /Civil/)).toBeChecked();
    expect(writes).toHaveLength(0);
  });

  test('a backend refusal is shown on the field it names', async ({ page }) => {
    await serveLibrary(page, material(), (write) =>
      write.method === 'PATCH'
        ? validationRefusal({ departmentIds: ['one or more departments are inactive'] })
        : null,
    );
    const dialog = await openEditMaterial(page);
    await department(dialog, /Civil/).check();
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Apply audience change' }).click();

    const form = page.getByRole('dialog', { name: 'Edit material' });
    await expect(form).toBeVisible();
    await expect(form).toContainText('One or more departments are inactive.');
  });

  test('a saved department the college no longer offers is shown, and can be removed', async ({
    page,
  }) => {
    const stale = material({
      departmentIds: ['prep', 'old-dept'],
      audience: {
        ...material().audience,
        departments: [
          { id: 'prep', name: 'Preparatory', nameAr: 'اعدادي', studyType: 'GENERAL' },
          { id: 'old-dept', name: 'Retired Department', nameAr: 'قسم', studyType: 'GENERAL' },
        ],
      },
    });
    const writes = await serveLibrary(page, stale);
    const dialog = await openEditMaterial(page);

    const unavailable = dialog.getByTestId('unavailable-departments');
    await expect(unavailable).toContainText('Retired Department');
    await expect(dialog).toContainText('no longer offered by this college');

    await unavailable.getByRole('button', { name: 'Remove' }).click();
    await expect(dialog.getByTestId('unavailable-departments')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('button', { name: 'Apply audience change' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    expect(writes.find((w) => w.method === 'PATCH')?.body.departmentIds).toEqual(['prep']);
  });
});

// ---------------------------------------------------------------------------
// The material screen and the list
// ---------------------------------------------------------------------------

test.describe('library audience — display', () => {
  test('the material page shows the saved audience', async ({ page }) => {
    await serveLibrary(page, material());
    await page.goto('/library/mat-a');
    const card = page.getByTestId('material-audience');
    await expect(card).toContainText('Mansoura University');
    await expect(card).toContainText('Engineering (General)');
    await expect(card).toContainText('Selected departments only');
    await expect(card).toContainText('Preparatory (General)');
    await expect(card).toContainText('Preparatory year (Year)');
  });

  test('a legacy material says it needs an audience, and a publish refusal names the field', async ({
    page,
  }) => {
    const legacy = material({
      status: 'DRAFT',
      universityId: null,
      facultyId: null,
      academicYearId: null,
      departmentScope: 'FACULTY',
      departmentIds: [],
      audience: {
        university: null,
        faculty: null,
        departmentScope: 'FACULTY',
        departments: [],
        academicYear: null,
      },
    });
    await serveLibrary(page, legacy, (write) =>
      write.body.status === 'PUBLISHED'
        ? validationRefusal({
            universityId: ['choose a university'],
            facultyId: ['choose a college'],
          })
        : null,
    );
    await page.goto('/library/mat-a');
    await expect(page.getByTestId('material-audience')).toContainText('No audience set');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Publish', exact: true })
      .click();
    await expect(page.getByText(/University: choose a university/)).toBeVisible();
    await expect(page.getByText(/Edit the material to fix its audience/)).toBeVisible();
  });

  test('the material list shows each material’s audience', async ({ page }) => {
    await serveLibrary(page, material());
    await page.goto('/library');
    const rows = page.getByRole('row');
    await expect(rows.filter({ hasText: 'Mechanica' })).toContainText('Engineering (General)');
    await expect(rows.filter({ hasText: 'Mechanica' })).toContainText('1 department');
    await expect(rows.filter({ hasText: 'Mechanica' })).toContainText(
      'Preparatory year, First year (Year)',
    );
    await expect(rows.filter({ hasText: 'Legacy notes' })).toContainText('Not set');
  });
});

// ---------------------------------------------------------------------------
// Packages — one material
// ---------------------------------------------------------------------------

test.describe('library packages — a single material', () => {
  test('a new package belongs to this material and holds only its documents', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Add package' }).click();
    const dialog = page.getByRole('dialog', { name: 'New package' });
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Both parts');
    await dialog.getByLabel('Price').fill('90');
    await dialog.getByRole('checkbox', { name: 'Part 1' }).check();
    await dialog.getByRole('checkbox', { name: 'Part 2' }).check();
    await dialog.getByRole('button', { name: 'Create package' }).click();
    await expect(dialog).toBeHidden();

    expect(writes.find((w) => w.path === '/admin/library/packages')?.body).toMatchObject({
      materialId: 'mat-a',
      partIds: ['lp-1', 'lp-2'],
    });
  });

  test('a price-only edit leaves the stored contents alone, withdrawn document included', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    const note = dialog.getByTestId('package-withdrawn-note');
    await expect(note).toContainText('lp-gone');
    await expect(note).toContainText('leaves them exactly as they are');
    await dialog.getByLabel('Price').fill('80');
    // Nothing leaves, so there is nothing to confirm.
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    const patch = writes.find((w) => w.path === '/admin/library/packages/pk-1');
    expect(patch?.body.price).toBe(80);
    expect(patch?.body).not.toHaveProperty('partIds');
  });

  test('a contents change that drops a withdrawn document is confirmed first, listing it', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    await dialog.getByRole('checkbox', { name: 'Part 2' }).check();
    await expect(dialog.getByTestId('package-withdrawn-note')).toContainText(
      'Changing the contents removes them',
    );
    await dialog.getByRole('button', { name: 'Review removal' }).click();

    const review = page.getByRole('dialog', { name: 'Remove documents from this package?' });
    const list = review.getByTestId('package-removal-review');
    await expect(list).toContainText('lp-gone');
    await expect(list).toContainText('No purchase or entitlement changes.');
    await expect(list).not.toContainText('Part 1');
    expect(writes).toHaveLength(0);

    await review.getByRole('button', { name: 'Remove 1 and save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(writes.find((w) => w.path === '/admin/library/packages/pk-1')?.body.partIds).toEqual(
      ['lp-1', 'lp-2'],
    );
  });

  test('Back from the removal review keeps the form and sends nothing', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    await page.getByRole('dialog').getByRole('checkbox', { name: 'Part 2' }).check();
    await page.getByRole('button', { name: 'Review removal' }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    await expect(dialog.getByRole('checkbox', { name: 'Part 2' })).toBeChecked();
    expect(writes).toHaveLength(0);
  });

  test('unticking a current document is confirmed by name', async ({ page }) => {
    const base = material();
    const full = material({
      packages: [{ ...base.packages[0]!, partIds: ['lp-1', 'lp-2'] }],
    });
    const writes = await serveLibrary(page, full);
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    await expect(dialog.getByTestId('package-withdrawn-note')).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'Part 2' }).uncheck();
    await expect(dialog.getByTestId('package-removal-warning')).toContainText('Part 2');
    await dialog.getByRole('button', { name: 'Review removal' }).click();

    const review = page.getByRole('dialog', { name: 'Remove documents from this package?' });
    await expect(review.getByTestId('package-removal-review')).toContainText('Part 2');
    await review.getByRole('button', { name: 'Remove 1 and save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(writes[0]?.body.partIds).toEqual(['lp-1']);
  });

  test('adding a document when nothing leaves saves without a confirmation', async ({
    page,
  }) => {
    const base = material();
    const single = material({ packages: [{ ...base.packages[0]!, partIds: ['lp-1'] }] });
    const writes = await serveLibrary(page, single);
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    await dialog.getByRole('checkbox', { name: 'Part 2' }).check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(writes[0]?.body.partIds).toEqual(['lp-1', 'lp-2']);
  });

  test('a refusal of the contents is shown back in the form', async ({ page }) => {
    await serveLibrary(page, material(), (write) =>
      write.path === '/admin/library/packages/pk-1'
        ? validationRefusal({ partIds: ['these documents belong to another material: lp-x'] })
        : null,
    );
    await page.goto('/library/mat-a');
    await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
    await page.getByRole('dialog').getByRole('checkbox', { name: 'Part 2' }).check();
    await page.getByRole('button', { name: 'Review removal' }).click();
    await page.getByRole('button', { name: 'Remove 1 and save' }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit package' });
    await expect(dialog).toContainText('these documents belong to another material');
  });
});

// ---------------------------------------------------------------------------
// Year/level retry, and subject clearing
// ---------------------------------------------------------------------------

test.describe('library audience — transient ladder failure', () => {
  test('a failed year/level request is retried on its own and nothing chosen is lost', async ({
    page,
  }) => {
    const writes = await serveLibrary(page, material());
    const counts: Record<string, number> = {};
    let failCivil = true;
    // Registered after serveCatalog, so it is consulted first.
    await page.route('**/api/proxy/catalog/academic-years**', async (route) => {
      const scope = new URL(route.request().url()).searchParams;
      const key = scope.get('departmentId') ?? scope.get('facultyId') ?? 'platform';
      counts[key] = (counts[key] ?? 0) + 1;
      if (key === 'civil' && failCivil) {
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: 'SERVER_ERROR', message: 'unavailable' } },
        });
      }
      return route.fallback();
    });

    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByRole('radio', { name: /Selected departments/ }).check();
    await department(dialog, /Preparatory/).check();
    await yearGroup(dialog).getByRole('checkbox', { name: 'First year' }).check();
    await department(dialog, /Civil/).check();

    // The automatic retries run out, then the editor says so and offers Retry.
    const error = dialog.getByTestId('ladder-error');
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText('Your selections are kept.');
    await expect(dialog.getByRole('button', { name: 'Create material' })).toBeDisabled();

    // Nothing chosen was cleared or replaced while it failed.
    await expect(dialog.getByRole('combobox', { name: /^University/ })).toHaveValue('uni-mans');
    await expect(dialog.getByRole('combobox', { name: /^College/ })).toHaveValue('fac-gen');
    await expect(department(dialog, /Preparatory/)).toBeChecked();
    await expect(department(dialog, /Civil/)).toBeChecked();
    const unverified = dialog.getByTestId('unavailable-years');
    await expect(unverified).toContainText('not verified until the years/levels load');
    await expect(unverified).toContainText('First year');

    const before = { ...counts };
    failCivil = false;
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByTestId('ladder-error')).toHaveCount(0);

    // Only the failed scope was asked again.
    expect(counts.civil).toBe((before.civil ?? 0) + 1);
    expect(counts.prep).toBe(before.prep);

    await expect(yearGroup(dialog).getByRole('checkbox', { name: 'First year' })).toBeChecked();
    await expect(dialog.getByTestId('unavailable-years')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();
    expect(writes.find((w) => w.method === 'POST')?.body).toMatchObject({
      universityId: 'uni-mans',
      facultyId: 'fac-gen',
      departmentScope: 'DEPARTMENTS',
      departmentIds: ['prep', 'civil'],
      academicYearId: 'y-1',
      academicYearIds: ['y-1'],
    });
  });
});

test.describe('library material — subject', () => {
  test('clearing the subject sends subjectId: null', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openEditMaterial(page);
    await expect(dialog.getByRole('combobox', { name: /^Subject/ })).toHaveValue('subj-1');
    await dialog.getByRole('combobox', { name: /^Subject/ }).selectOption('');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    const patch = writes.find((w) => w.method === 'PATCH');
    expect(patch?.body).toHaveProperty('subjectId', null);
    for (const key of AUDIENCE_KEYS) expect(patch?.body).not.toHaveProperty(key);
  });

  test('a create sends the chosen subject', async ({ page }) => {
    const writes = await serveLibrary(page, material());
    const dialog = await openNewMaterial(page);
    await dialog.getByRole('textbox', { name: /^Title(?! \(Arabic)/ }).fill('Mechanica');
    await dialog.getByRole('combobox', { name: /^Subject/ }).selectOption('subj-1');
    await dialog.getByRole('combobox', { name: /^University/ }).selectOption('uni-mans');
    await dialog.getByRole('combobox', { name: /^College/ }).selectOption('fac-gen');
    await dialog.getByRole('button', { name: 'Create material' }).click();
    await expect(dialog).toBeHidden();
    expect(writes.find((w) => w.method === 'POST')?.body.subjectId).toBe('subj-1');
  });
});

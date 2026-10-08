import { expect, resetStub, test } from './fixtures';

const university = { id: 'u', name: 'Mansoura University', nameAr: 'Mansoura', isActive: true };
const faculty = { id: 'f', universityId: 'u', name: 'Engineering', nameAr: 'Engineering', isActive: true };
const departments = [
  { id: 'general', facultyId: 'f', name: 'Civil Engineering', nameAr: 'Civil', studyType: 'GENERAL', isActive: true },
  { id: 'program', facultyId: 'f', name: 'Program A', nameAr: 'Program A', studyType: 'PROGRAMS', isActive: true },
];

test.beforeEach(async ({ page }) => {
  await resetStub(page);
  await page.route('**/api/proxy/catalog/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/universities')) data = [university];
    if (path.endsWith('/faculties')) data = [faculty];
    if (path.endsWith('/departments')) data = departments;
    await route.fulfill({ json: { success: true, data } });
  });
});

test('course targeting separates General and Programs and clears old departments', async ({ page, signIn }) => {
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

test('admin creates a program-specific level ladder', async ({ page, signIn }) => {
  await signIn('master');
  await page.goto('/other-data?tab=structures');
  await page.getByRole('button', { name: 'Add structure', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('One department or program', { exact: true }).click();
  await dialog.getByLabel('Department university').selectOption('u');
  await dialog.getByLabel('Department faculty').selectOption('f');
  await dialog.getByLabel('Department or program', { exact: true }).selectOption('program');
  await expect(dialog.getByRole('combobox', { name: /^System/ })).toHaveValue('LEVEL');
  let submitted: unknown;
  await page.route('**/api/proxy/catalog/academic-structures', async (route) => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, data: route.request().method() === 'POST' ? { id: 'new' } : [] } });
  });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => submitted).toEqual({ kind: 'LEVEL', departmentId: 'program' });
});

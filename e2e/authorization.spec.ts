import { expect, forbidPath, resetStub, test } from './fixtures';

/**
 * Authorization.
 *
 * Two separate claims are checked here, and the second is the one that
 * matters:
 *
 *  1. the interface does not offer a role things it cannot do;
 *  2. **the API refuses them anyway.** A test that only asserted on hidden
 *     navigation would pass just as happily against a dashboard whose entire
 *     security model was CSS.
 */

/**
 * The proxy refuses a mutating request that does not carry these, as a
 * cross-site form post could not. A test that omits them is answered by the
 * CSRF check rather than by the authorization being tested.
 */
const DASHBOARD_HEADERS = { 'x-dashboard-request': '1' } as const;
const DASHBOARD_POST = { ...DASHBOARD_HEADERS, 'content-type': 'application/json' } as const;

test.beforeEach(async ({ page }) => {
  await resetStub(page);
});

test.describe('teacher', () => {
  test('sees only teaching navigation', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'My courses' })).toBeVisible();

    for (const hidden of [
      'Students',
      'Teachers',
      'Codes',
      'Support centre',
      'Logs',
      'Admin accounts',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
  });

  test('is refused platform statistics by the API, not just by the menu', async ({
    page,
    signIn,
  }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    // Called directly through the proxy, exactly as a hostile client would.
    const response = await page.request.get('/api/proxy/analytics/dashboard');

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('is refused platform settings and the audit log', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    for (const path of ['admin/settings', 'audit', 'audit/logins']) {
      const response = await page.request.get(`/api/proxy/${path}`);
      expect(response.status(), `${path} must be refused`).toBe(403);
    }
  });

  test('is offered no way to create a course', async ({ page, signIn }) => {
    await signIn('teacher');
    await page.goto('/courses');

    await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();

    // The course a teacher can work on is one an administrator assigned them.
    await expect(page.getByRole('link', { name: 'Anatomy 101' })).toBeVisible();

    // …and there is no entry point to making another. Checked across the whole
    // page rather than just the header, because the empty state carries its
    // own copy of this button.
    await expect(page.getByRole('button', { name: /new course/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /create course/i })).toHaveCount(0);
  });

  test('creating a course is refused by the API, not just hidden', async ({
    page,
    signIn,
  }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    // Called directly through the proxy, exactly as a hostile client would —
    // including naming themselves as the teacher, which is the payload that
    // would have granted them access to what they created.
    //
    // The dashboard header is sent deliberately. Without it the proxy's CSRF
    // check answers first with its own 403, and the test would pass without
    // the role gate ever running — a green that proves nothing about who may
    // create a course. Asserting the *code*, not just the status, is what
    // keeps the two refusals from being mistaken for each other.
    const response = await page.request.post('/api/proxy/admin/courses', {
      data: {
        title: 'Self-made course',
        teacherIds: ['user-teacher'],
        enrollmentMethods: ['CODE'],
        price: 100,
      },
      headers: DASHBOARD_POST,
    });

    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('cannot change who teaches a course', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const assign = await page.request.post('/api/proxy/admin/courses/course-1/teachers', {
      data: { teacherId: 'user-teacher', canEditPricing: true },
      headers: DASHBOARD_POST,
    });
    expect(assign.status()).toBe(403);
    expect(((await assign.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');

    const remove = await page.request.delete(
      '/api/proxy/admin/courses/course-1/teachers/user-teacher',
      { headers: DASHBOARD_HEADERS },
    );
    expect(remove.status()).toBe(403);
    expect(((await remove.json()) as { code: string }).code).toBe('INSUFFICIENT_ROLE');
  });

  test('opening an assigned course shows no Teachers tab', async ({ page, signIn }) => {
    await signIn('teacher');
    await page.goto('/courses/course-1');

    // What they keep: the course and its content.
    await expect(page.getByRole('tab', { name: 'Content' })).toBeVisible();

    // What they do not get: staffing.
    await expect(page.getByRole('tab', { name: 'Teachers' })).toHaveCount(0);
  });

  test('a course list request returns only their own courses', async ({ page, signIn }) => {
    await signIn('teacher');
    await expect(page).toHaveURL(/\/$/);

    const response = await page.request.get('/api/proxy/admin/courses');
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      data: { items: { teachers: { id: string }[] }[] };
    };

    for (const course of body.data.items) {
      expect(course.teachers.some((teacher) => teacher.id === 'user-teacher')).toBe(true);
    }
  });
});

test.describe('course creation is the administrator\'s', () => {
  test('an admin is offered the button and the API accepts the call', async ({
    page,
    signIn,
  }) => {
    await signIn('admin');
    await page.goto('/courses');

    await expect(page.getByRole('button', { name: 'New course' })).toBeVisible();

    const response = await page.request.post('/api/proxy/admin/courses', {
      data: {
        title: 'Pharmacology',
        teacherIds: ['user-teacher'],
        enrollmentMethods: ['CODE'],
        price: 300,
      },
      headers: DASHBOARD_POST,
    });

    expect(response.ok()).toBe(true);

    // The course comes back assigned to the teacher the admin named, which is
    // what puts it in that teacher's dashboard.
    const body = (await response.json()) as {
      data: { teachers: { id: string }[] };
    };
    expect(body.data.teachers.map((teacher) => teacher.id)).toEqual(['user-teacher']);
  });

  test('an admin can assign and unassign a teacher', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/courses/course-1');

    await expect(page.getByRole('tab', { name: 'Teachers' })).toBeVisible();
    await page.getByRole('tab', { name: 'Teachers' }).click();

    await expect(page.getByRole('heading', { name: 'Assigned teachers' })).toBeVisible();

    // Scoped to the panel: the name also appears in the course summary above,
    // so an unscoped locator matches twice and fails on strict mode.
    const panel = page.getByRole('tabpanel', { name: 'Teachers' });
    await expect(panel.getByText('Tarek Teacher')).toBeVisible();

    const assign = await page.request.post('/api/proxy/admin/courses/course-1/teachers', {
      data: { teacherId: 'user-teacher' },
      headers: DASHBOARD_POST,
    });
    expect(assign.ok()).toBe(true);
  });
});

test.describe('regular admin', () => {
  test('sees operational navigation but not admin accounts', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Codes' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Managing administrators is the master's alone.
    await expect(nav.getByRole('link', { name: 'Admin accounts' })).toHaveCount(0);
  });

  test('reaching /admins directly is refused in the interface too', async ({ page, signIn }) => {
    await signIn('admin');
    await page.goto('/admins');

    await expect(page.getByText(/only the master admin/i)).toBeVisible();
  });
});

test.describe('master admin', () => {
  test('sees admin accounts and can open the page', async ({ page, signIn }) => {
    await signIn('master');
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Admin accounts' })).toBeVisible();

    await nav.getByRole('link', { name: 'Admin accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Admin accounts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add admin' })).toBeVisible();
  });
});

test.describe('server-side refusal is authoritative', () => {
  test('an action the API forbids fails even for an admin', async ({ page, signIn }) => {
    await signIn('admin');
    await expect(page).toHaveURL(/\/$/);

    // The API is told to refuse this path regardless of role — standing in for
    // a permission the dashboard has not been taught about yet.
    await forbidPath(page, '/admin/settings');

    const response = await page.request.get('/api/proxy/admin/settings');
    expect(response.status()).toBe(403);
  });
});

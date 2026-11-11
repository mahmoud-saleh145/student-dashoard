import { expect, test } from '@playwright/test';

/**
 * The store-facing pages: privacy, terms, account deletion, support.
 *
 * Google Play and App Store reviewers open these links with no dashboard
 * session. The property under test is that they render, in both languages,
 * without a session and without touching the API — a redirect to /login here
 * would be a store rejection.
 */

const PAGES = [
  { path: '/privacy', en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
  { path: '/terms', en: 'Terms & Conditions', ar: 'الشروط والأحكام' },
  { path: '/account-deletion', en: 'Delete your Student Center account', ar: 'حذف حساب Student Center' },
  { path: '/contact', en: 'Student Center Support', ar: 'دعم Student Center' },
] as const;

test.describe('public pages', () => {
  for (const p of PAGES) {
    test(`${p.path} renders in English without a session`, async ({ page }) => {
      const apiCalls: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/')) apiCalls.push(r.url());
      });

      const response = await page.goto(p.path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${p.path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.en);
      await expect(page.locator('[dir="ltr"][lang="en"]').first()).toBeVisible();
      expect(apiCalls).toEqual([]);
    });

    test(`${p.path}?lang=ar renders right-to-left in Arabic`, async ({ page }) => {
      await page.goto(`${p.path}?lang=ar`);
      await expect(page).toHaveURL(new RegExp(`${p.path}\\?lang=ar$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.ar);
      await expect(page.locator('[dir="rtl"][lang="ar"]').first()).toBeVisible();
    });
  }

  test('every page links the others and switches language in place', async ({ page }) => {
    await page.goto('/privacy');
    const nav = page.getByRole('navigation', { name: 'Pages' });
    for (const p of PAGES) {
      await expect(nav.locator(`a[href="${p.path}"]`)).toHaveCount(1);
    }
    await page.getByRole('link', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/privacy\?lang=ar$/);
  });

  test('the deletion page gives a way to ask without the app', async ({ page }) => {
    await page.goto('/account-deletion');
    const mail = page.locator('a[href^="mailto:"]').first();
    await expect(mail).toBeVisible();
    expect(await mail.getAttribute('href')).toContain('subject=Account%20deletion%20request');
    await expect(page.locator('a[href^="https://wa.me/"]').first()).toBeVisible();
  });

  test('the pages are indexable even though the dashboard is not', async ({ page }) => {
    await page.goto('/privacy');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('index');
    expect(robots).not.toContain('noindex');
  });

  test('the staff area still requires a session', async ({ page }) => {
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login\?next=%2Fstudents/);
  });
});

/**
 * The mobile apps are consumption-only (owner decision, 2026-11-10): no prices,
 * no purchases, no codes, no wallet payments. These pages are what App Review
 * reads next to the app, so none of them may describe a code, card or payment
 * as something done in the app — while still disclosing the website records.
 */
test.describe('public pages match the consumption-only mobile app', () => {
  const IN_APP_SALES = [
    /codes you type in/i,
    /inside the app\.? Course access/i,
    /Code not working/i,
    /spent on Library materials inside the app/i,
    /كروت الشحن التي تُدخلها/,
    /الكود لا يعمل/,
    /لمواد المكتبة داخل التطبيق/,
  ];

  for (const path of ['/privacy', '/terms', '/account-deletion', '/contact']) {
    for (const lang of ['en', 'ar'] as const) {
      test(`${path} (${lang}) never presents codes, cards or wallet as app features`, async ({ page }) => {
        await page.goto(lang === 'ar' ? `${path}?lang=ar` : path);
        const text = await page.locator('main').innerText();
        for (const pattern of IN_APP_SALES) expect(text).not.toMatch(pattern);
      });
    }
  }

  test('the privacy policy says what the app does not do, and still discloses website records', async ({ page }) => {
    await page.goto('/privacy');
    const text = await page.locator('main').innerText();
    expect(text).toMatch(/does not accept access codes, recharge cards or wallet payments/);
    expect(text).toMatch(/Records from the Student Center website/);
    expect(text).toMatch(/The app never creates these records/);
    await page.goto('/privacy?lang=ar');
    const ar = await page.locator('main').innerText();
    expect(ar).toMatch(/لا يقبل\s+أكواد الوصول أو كروت الشحن أو الدفع من المحفظة/);
    expect(ar).toMatch(/سجلات من موقع Student Center/);
  });

  test('deletion is described as the app does it: password, 30 days, cancel by signing in', async ({ page }) => {
    for (const path of ['/account-deletion', '/privacy']) {
      await page.goto(path);
      const text = await page.locator('main').innerText();
      expect(text).toMatch(/30 days/);
      expect(text).toMatch(/Cancel deletion/);
      expect(text).not.toMatch(/as a support ticket/);
    }
  });

  test('the support page covers access, devices, playback and deletion, in both languages', async ({ page }) => {
    await page.goto('/contact');
    for (const name of ['Getting into your account', 'Devices and approval', 'Playback problems', 'Account deletion and privacy']) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
    await page.goto('/contact?lang=ar');
    for (const name of ['الدخول إلى حسابك', 'الأجهزة وموافقة الإدارة', 'مشاكل التشغيل', 'حذف الحساب والخصوصية']) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
  });
});

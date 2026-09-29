/**
 * Public, unauthenticated pages for the Student Center mobile app: privacy
 * policy, terms, account deletion and support.
 *
 * They live in the dashboard because it is the one web property the platform
 * already runs, on Vercel, with no cold start — a store reviewer who opens the
 * privacy link gets a page immediately. They never call the API and never read
 * a session, so they behave identically whether or not anyone is signed in.
 *
 * The support contacts are the same values the app itself shows (they are
 * compiled into the mobile bundle, so none of this is secret). Each can be
 * overridden with a server-side environment variable on Vercel without a code
 * change; nothing here is a NEXT_PUBLIC_ variable.
 */

export type Lang = 'en' | 'ar';

export function parseLang(value: string | string[] | undefined): Lang {
  return value === 'ar' ? 'ar' : 'en';
}

export const APP_NAME = 'Student Center';

/** Digits only, international form, as wa.me and tel: expect. */
const phoneDigits = (process.env.PUBLIC_SUPPORT_PHONE ?? '+201101112344').replace(/[^\d]/g, '');
const whatsappDigits = (process.env.PUBLIC_SUPPORT_WHATSAPP ?? '+201101112344').replace(
  /[^\d]/g,
  '',
);

export const SUPPORT = {
  email: process.env.PUBLIC_SUPPORT_EMAIL ?? 'startuppp3@gmail.com',
  phone: `+${phoneDigits}`,
  phoneHref: `tel:+${phoneDigits}`,
  whatsapp: `+${whatsappDigits}`,
  whatsappHref: `https://wa.me/${whatsappDigits}`,
} as const;

/** Readable form of an Egyptian mobile number: +20 110 111 2344. */
export function displayPhone(international: string): string {
  const m = /^\+20(\d{3})(\d{3})(\d{4})$/.exec(international);
  return m ? `+20 ${m[1]} ${m[2]} ${m[3]}` : international;
}

/** "Last updated" date shown on every page. Change it when the text changes. */
export const LAST_UPDATED = { en: '29 September 2026', ar: '٢٩ سبتمبر ٢٠٢٦' } as const;

export const PAGES = [
  { href: '/privacy', en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
  { href: '/terms', en: 'Terms & Conditions', ar: 'الشروط والأحكام' },
  { href: '/account-deletion', en: 'Account Deletion', ar: 'حذف الحساب' },
  { href: '/contact', en: 'Support', ar: 'الدعم' },
] as const;

export type PublicPath = (typeof PAGES)[number]['href'];

export const PUBLIC_PAGE_PATHS: readonly string[] = PAGES.map((p) => p.href);

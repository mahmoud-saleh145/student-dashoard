import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { APP_NAME, LAST_UPDATED, PAGES, type Lang, type PublicPath } from './site';

/**
 * Chrome for the public pages: brand, language switch, page links.
 *
 * Arabic is rendered right-to-left on its own subtree. The root <html> belongs
 * to the dashboard and stays `lang="en" dir="ltr"`; setting `lang`/`dir` on the
 * container is enough for layout, screen readers and bidi text.
 */
export function PublicShell({
  lang,
  path,
  title,
  children,
}: {
  lang: Lang;
  path: PublicPath;
  title: string;
  children: ReactNode;
}) {
  const other: Lang = lang === 'en' ? 'ar' : 'en';
  const hrefFor = (href: string, l: Lang) => (l === 'en' ? href : `${href}?lang=ar`);

  return (
    <div
      lang={lang}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href={hrefFor('/privacy', lang)} className="flex items-center gap-3">
            <Image src="/logo-mark.png" alt="" width={36} height={40} priority />
            <span className="text-lg font-semibold">{APP_NAME}</span>
          </Link>
          <Link
            href={hrefFor(path, other)}
            hrefLang={other}
            lang={other}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-alt"
          >
            {other === 'ar' ? 'العربية' : 'English'}
          </Link>
        </div>
        <nav aria-label={lang === 'ar' ? 'صفحات' : 'Pages'} className="mx-auto max-w-3xl px-4 pb-3">
          <ul className="flex flex-wrap gap-2 text-sm">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={hrefFor(p.href, lang)}
                  aria-current={p.href === path ? 'page' : undefined}
                  className={
                    p.href === path
                      ? 'rounded-md bg-primary-soft px-2.5 py-1 font-medium text-primary'
                      : 'rounded-md px-2.5 py-1 text-muted hover:text-foreground'
                  }
                >
                  {p[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {lang === 'ar' ? 'آخر تحديث: ' : 'Last updated: '}
          {LAST_UPDATED[lang]}
        </p>
        <div className="public-prose mt-6">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted">
          © {APP_NAME}
        </div>
      </footer>
    </div>
  );
}

/** A titled section. Kept tiny so the page files read as documents. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 leading-7">{children}</div>
    </section>
  );
}

import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'EduPlatform Dashboard',
    template: '%s · EduPlatform',
  },
  description: 'Administration and teaching dashboard for the EduPlatform.',
  // A back office must never be indexed, even if it is somehow reachable.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

/**
 * The theme is applied by an inline script that runs before first paint.
 *
 * Doing it in an effect would paint the light theme first and then swap, which
 * is a full-screen white flash for anyone using dark mode — the most-reported
 * complaint about themed dashboards and entirely avoidable.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('edu-theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = stored === 'light' || stored === 'dark' ? stored : system;
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

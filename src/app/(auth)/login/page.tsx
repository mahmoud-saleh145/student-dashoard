import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/features/auth/login-form';
import { getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const params = await searchParams;

  // Already signed in — do not show a login form to someone who has a session;
  // it reads as though their session was lost.
  const user = await getSessionUser();
  if (user) redirect(safeNext(params.next) ?? '/');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark />
          <div>
            <h1 className="text-xl font-semibold text-foreground">EduPlatform</h1>
            <p className="mt-1 text-sm text-muted">Administration &amp; teaching dashboard</p>
          </div>
        </div>

        <div className="card p-6">
          {params.reason === 'expired' ? (
            <p
              role="status"
              className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
            >
              Your session expired. Please sign in again.
            </p>
          ) : null}

          {params.reason === 'forbidden' ? (
            <p
              role="status"
              className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              That account cannot access this dashboard.
            </p>
          ) : null}

          <LoginForm nextPath={safeNext(params.next)} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Staff accounts only. Students use the mobile app.
        </p>
      </div>
    </main>
  );
}

/**
 * Only same-site paths are honoured as a redirect target.
 *
 * `?next=https://elsewhere.example` on a login page is a textbook open
 * redirect — it makes a phishing link look like it came from this domain.
 */
function safeNext(next: string | undefined): string | undefined {
  if (!next) return undefined;
  if (!next.startsWith('/') || next.startsWith('//')) return undefined;
  return next;
}

function BrandMark() {
  return (
    <span
      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-sm"
      aria-hidden="true"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M7 11v4.2c0 .5.3 1 .8 1.2 1.2.6 2.7.9 4.2.9s3-.3 4.2-.9c.5-.2.8-.7.8-1.2V11"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

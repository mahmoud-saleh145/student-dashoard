'use client';

import { useEffect } from 'react';

/**
 * The last-resort boundary.
 *
 * It shows what went wrong in general terms and offers a retry. It never
 * renders `error.message`: an unhandled exception's message can contain
 * internal paths or query fragments, and this page is shown to whoever is
 * logged in, not only to a developer.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept as a console entry rather than a UI element; wire this to a crash
    // reporter when one is configured.
    console.error('Unhandled dashboard error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        The page could not be displayed. Trying again often resolves it; if it does not,
        reload the dashboard.
      </p>
      {error.digest ? (
        <p className="font-mono text-[11px] text-subtle">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
      >
        Try again
      </button>
    </main>
  );
}

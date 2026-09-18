'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/errors';
import { SessionProvider } from '@/lib/session-context';
import type { SessionUser } from '@/types/domain';

/**
 * Client providers.
 *
 * The query client is created inside `useState` rather than at module scope:
 * a module-level client is shared between requests on the server, which in a
 * multi-tenant back office means one administrator could be served another's
 * cached data. One client per browser session is the only safe shape.
 */
export function Providers({
  children,
  user,
}: {
  children: ReactNode;
  user: SessionUser;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Back-office data changes under you constantly — another admin is
            // editing the same records. Short and refetch-on-focus keeps what
            // is on screen close to what is true, without hammering the API.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,

            retry: (failureCount, error) => {
              // Retrying a 403 or a 422 just repeats the same answer more
              // slowly. Only transport and server faults are worth another go.
              if (error instanceof ApiError) {
                if (error.status > 0 && error.status < 500) return false;
              }
              return failureCount < 2;
            },

            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },

          mutations: {
            // A mutation is a deliberate act; silently repeating it could
            // create two of something. Retries are opt-in per mutation.
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider user={user}>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

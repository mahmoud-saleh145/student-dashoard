'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { messageFor } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * The region is `aria-live="polite"` and always present in the DOM, so an
 * appended message is announced. It is not `assertive`: a success confirmation
 * interrupting whatever a screen-reader user is reading is worse than a short
 * delay, and errors that genuinely block the task are rendered inline on the
 * form, not here.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (error: unknown, title?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = (nextToastId += 1);
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);

      // Errors stay longer: they are more likely to carry something the reader
      // needs to act on than a success confirmation is.
      const ttl = toast.tone === 'error' ? 8000 : 4500;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (error, title) =>
        push({
          tone: 'error',
          title: title ?? 'That did not work',
          description: messageFor(error),
        }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return context;
}

const TONES: Record<ToastTone, { bar: string; icon: ReactNode }> = {
  success: {
    bar: 'bg-success',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m5 13 4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    bar: 'bg-danger',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 7v6m0 4h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  warning: {
    bar: 'bg-warning',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 8v5m0 3.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  info: {
    bar: 'bg-info',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 11v6m0-9.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
};

const TONE_TEXT: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:end-0 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <span className={cn('w-1 shrink-0', TONES[toast.tone].bar)} aria-hidden="true" />

          <div className="flex flex-1 items-start gap-3 p-3">
            <span className={cn('mt-0.5 shrink-0', TONE_TEXT[toast.tone])}>
              {TONES[toast.tone].icon}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-sm break-words text-muted">{toast.description}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-me-1 -mt-1 shrink-0 rounded p-1 text-subtle transition-colors hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

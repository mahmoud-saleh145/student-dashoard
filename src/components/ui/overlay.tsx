'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Button, type ButtonVariant } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Dialogs and drawers.
 *
 * Written against the platform rather than pulled in as a dependency, because
 * the behaviour that actually matters is small and specific:
 *
 *  - focus moves into the surface on open and returns to the trigger on close;
 *  - Tab is trapped inside while it is open;
 *  - Escape closes it, and so does a click on the backdrop;
 *  - the page behind does not scroll;
 *  - it is announced as a dialog, with its title as the accessible name.
 *
 * A destructive confirmation that a keyboard user cannot escape from is worse
 * than no confirmation at all.
 */

function useLockedBody(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const { overflow, paddingRight } = document.body.style;
    // Compensate for the scrollbar so the page does not shift sideways as it
    // locks — a jump on every dialog open reads as a bug.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
}

function useFocusTrap(
  active: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  /**
   * The close handler is read through a ref rather than closed over.
   *
   * Callers pass `onClose={() => setDialog(null)}` — a fresh function on every
   * render — and the input inside the dialog is usually controlled by state in
   * that same component. With `onClose` in the dependency array, the first
   * keystroke re-rendered the caller, changed the handler's identity, tore this
   * effect down and set it up again. Setup focuses `focusables()[0]`, and since
   * the header (with its close button) precedes `children` in the DOM, focus
   * jumped from the input to the X after a single character. Holding the
   * handler in a ref lets the trap arm once per open instead of per keystroke.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (!node) return;

    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

    // Focus the first control, or the surface itself when there is nothing
    // focusable inside it yet (a drawer that is still loading).
    const initial = focusables()[0] ?? node;
    window.requestAnimationFrame(() => initial.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
    // Deliberately not `onClose`: see the ref above. `ref` is a stable ref
    // object, so this effect now runs exactly once per open and close.
  }, [active, ref]);
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevents closing while a submit is in flight. */
  busy?: boolean;
}

const MODAL_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy,
}: ModalProps) {
  const surface = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useLockedBody(open);
  useFocusTrap(open, surface, close);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
          onClick={close}
          aria-hidden="true"
        />

        <div
          ref={surface}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            'relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-surface shadow-xl',
            'rounded-t-2xl sm:rounded-2xl',
            MODAL_SIZES[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Close"
              className="-me-1 -mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
            >
              <CloseIcon />
            </button>
          </div>

          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          ) : null}

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-alt px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

export interface DrawerProps extends Omit<ModalProps, 'size'> {
  width?: 'md' | 'lg' | 'xl';
}

/**
 * A side panel for record detail.
 *
 * Anchored with logical `inset-inline-end`, so it slides in from the right in
 * English and from the left in Arabic without a second implementation.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy,
  width = 'lg',
}: DrawerProps) {
  const surface = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useLockedBody(open);
  useFocusTrap(open, surface, close);

  if (!open) return null;

  const widths = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' };

  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />

        <div
          ref={surface}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 end-0 flex w-full flex-col bg-surface shadow-2xl',
            widths[width],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-semibold text-foreground">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Close"
              className="-me-1 -mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-alt px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  busy?: boolean;
}

/**
 * The confirmation step before anything destructive or irreversible.
 *
 * Deliberately spells out the consequence in `message` rather than asking
 * "Are you sure?" — the caller passes what will actually happen, because a
 * generic prompt trains people to click through it.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{message}</div>
    </Modal>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6 18 18M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

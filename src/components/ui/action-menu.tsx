'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The row actions menu.
 *
 * Written here rather than pulled in, for the same reason as the dialogs: the
 * behaviour that matters is small, and a dependency would bring a focus model
 * this app already has opinions about.
 *
 * What it does that a bare dropdown does not:
 *
 *  - closes on Escape, on outside click, and after any item runs, so a menu
 *    can never be left hanging over the row it acted on;
 *  - returns focus to the trigger on close, so keyboard users do not land at
 *    the top of the document;
 *  - marks a destructive item so that Delete does not look like Edit.
 *
 * It deliberately does NOT trap focus. A menu is not a dialog: Tab should walk
 * out of it, and trapping here is what makes menus feel stuck.
 */

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** Renders the item as destructive. */
  danger?: boolean;
  disabled?: boolean;
}

export function ActionMenu({
  items,
  label = 'Actions',
  align = 'end',
}: {
  items: ActionMenuItem[];
  /** Accessible name for the trigger; say what the actions act on. */
  label?: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
    // `items` is not a dependency: the listeners close the menu, they do not
    // read the items. Including it would re-arm them on every parent render.
  }, [open]);

  return (
    // Clicks inside the menu never reach the row: tables with `onRowClick`
    // (students, for one) otherwise opened the row's drawer on top of the
    // action the reader chose.
    <div
      className="relative"
      ref={container}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
      >
        <DotsIcon />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute z-30 mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {/* Disabled items are rendered, not hidden: a menu whose contents
              move around between openings is harder to use than one with a
              greyed-out row. */}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                // Close first: the item may open a dialog, and a menu left
                // open underneath it competes for focus with the dialog.
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'block w-full px-3 py-2 text-start text-sm transition-colors disabled:opacity-50',
                item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-foreground hover:bg-surface-alt',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DotsIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabs, with the selected tab kept in the URL.
 *
 * A record page whose tab is component state loses it on refresh and cannot be
 * linked to — "look at the Students tab of this course" has to be a URL. The
 * `?tab=` parameter is replaced rather than pushed so tabbing around a record
 * does not fill the Back history.
 *
 * Rendered as a tablist with real `role="tab"` semantics; arrow keys move
 * between tabs the way a screen-reader user expects.
 */

export interface TabDefinition {
  id: string;
  label: string;
  badge?: ReactNode;
  hidden?: boolean;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabDefinition[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const visible = tabs.filter((tab) => !tab.hidden);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = visible.findIndex((tab) => tab.id === active);
    if (index === -1) return;

    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % visible.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + visible.length) % visible.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visible.length - 1;
    else return;

    event.preventDefault();
    const target = visible[next];
    if (target) onChange(target.id);
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn(
        'table-scroll flex gap-1 border-b border-border',
        className,
      )}
    >
      {visible.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:border-border-strong hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.badge ? <span className="shrink-0">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;

  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}

/** Reads and writes the `?tab=` parameter. */
export function useTabParam(defaultTab: string): [string, (id: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get('tab') ?? defaultTab;

  const setActive = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id === defaultTab) next.delete('tab');
      else next.set('tab', id);

      // Changing tab resets any list paging that belonged to the old tab.
      next.delete('page');

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaultTab],
  );

  return [active, setActive];
}

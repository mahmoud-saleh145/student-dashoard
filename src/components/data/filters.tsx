'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Select, TextInput, type SelectOption } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * Filter bar pieces.
 *
 * Search is debounced here rather than in every page, so a list screen does
 * not fire one request per keystroke. 350 ms is long enough to swallow typing
 * and short enough that it does not feel laggy.
 */

export const SEARCH_DEBOUNCE_MS = 350;

/**
 * The search box.
 *
 * Two values, deliberately kept apart: what the person is typing (`draft`,
 * owned here) and what the list is filtered by (`value`, the committed query
 * the page owns and keeps in the URL). The draft is committed after a pause
 * in typing; the committed value flows back only when something OTHER than
 * this box changed it.
 *
 * That last rule is what used to be missing. The box re-adopted `value` on
 * every change, including the echo of its own commit — and because the commit
 * reached the URL through an asynchronous navigation, the echo arrived after
 * the person had typed more, and overwrote it. "Students" typed quickly came
 * back as "Stud". So a commit is remembered, and an incoming `value` equal to
 * the last commit is ignored; anything else (Clear, Back, a filter that reset
 * the query, a URL pasted by a colleague) is adopted as before.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  const lastCommitted = useRef(value);

  // The latest handler, read when the timer fires. The page re-creates
  // `onChange` on every render (each fetch state change is a render), and a
  // handler in the effect's dependencies would restart the debounce on each
  // of them — so a list that is busy refetching could postpone the commit
  // indefinitely while the person waits.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // An outside change to the committed query: adopt it. Our own commit coming
  // back is not an outside change, and must never touch the draft.
  useEffect(() => {
    if (value === lastCommitted.current) return;
    lastCommitted.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === lastCommitted.current) return;
    const timer = setTimeout(() => {
      lastCommitted.current = draft;
      onChangeRef.current(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <TextInput
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      className={cn('sm:w-64', className)}
      leading={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={options}
      placeholder={placeholder}
      aria-label={label}
      className={cn('sm:w-48', className)}
    />
  );
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <TextInput
        type="date"
        value={from}
        max={to || undefined}
        onChange={(event) => onChange({ from: event.target.value, to })}
        aria-label="From date"
        className="w-[9.5rem]"
      />
      <span className="text-xs text-muted" aria-hidden="true">
        →
      </span>
      <TextInput
        type="date"
        value={to}
        min={from || undefined}
        onChange={(event) => onChange({ from, to: event.target.value })}
        aria-label="To date"
        className="w-[9.5rem]"
      />
    </div>
  );
}

/**
 * The filter row itself.
 *
 * "Clear" only appears when something is actually filtered — a permanently
 * visible reset button is noise, and its absence is a useful signal that the
 * list in front of you is the complete list.
 */
export function FilterBar({
  children,
  onClear,
  isFiltered,
  actions,
  className,
}: {
  children: ReactNode;
  onClear?: () => void;
  isFiltered?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}

      {isFiltered && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      ) : null}

      {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, with later Tailwind utilities beating earlier ones.
 *
 * Without the merge step, `cn('p-2', 'p-4')` emits both and the winner is
 * decided by stylesheet order rather than by the caller — which makes a
 * component's `className` prop unreliable, and unreliable overrides are how
 * component libraries become unusable.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Stable id for `label`/`aria-describedby` pairs in generated forms. */
let idCounter = 0;
export function nextId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Removes empty values so they never reach the query string. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

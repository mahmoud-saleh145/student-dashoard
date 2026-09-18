'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * List state, kept in the URL.
 *
 * The address bar is the state store rather than component state, which buys
 * three things a back office genuinely needs: a filtered view can be sent to a
 * colleague, Back returns to the previous filter instead of leaving the
 * screen, and a reload does not throw away the search someone just typed.
 *
 * Page resets to 1 whenever a filter or the search changes — staying on page 7
 * of a result set that now has two pages shows an empty table and looks broken.
 */

export interface ListState {
  page: number;
  pageSize: number;
  q: string;
  sort: { key: string; direction: 'asc' | 'desc' } | null;
  filters: Record<string, string>;
}

export interface UseListQueryOptions {
  /** Filter keys this list understands. Anything else in the URL is ignored. */
  filterKeys?: readonly string[];
  defaultPageSize?: number;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
}

export interface UseListQueryResult extends ListState {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSearch: (q: string) => void;
  setSort: (sort: { key: string; direction: 'asc' | 'desc' }) => void;
  setFilter: (key: string, value: string) => void;
  setFilters: (values: Record<string, string>) => void;
  clear: () => void;
  /** True when anything other than pagination is applied. */
  isFiltered: boolean;
  /** Ready to spread into a request's query object. */
  queryParams: Record<string, string | number>;
}

export function useListQuery(options: UseListQueryOptions = {}): UseListQueryResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterKeys = options.filterKeys ?? [];
  const defaultPageSize = options.defaultPageSize ?? 20;

  const state = useMemo<ListState>(() => {
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Number(searchParams.get('pageSize') ?? String(defaultPageSize));
    const sortKey = searchParams.get('sort');
    const sortDirection = searchParams.get('order');

    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const value = searchParams.get(key);
      if (value) filters[key] = value;
    }

    return {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      // Clamped to the backend's own cap so a hand-edited URL cannot ask for
      // ten thousand rows and receive a silently truncated page.
      pageSize: Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : defaultPageSize,
      q: searchParams.get('q') ?? '',
      sort: sortKey
        ? { key: sortKey, direction: sortDirection === 'asc' ? 'asc' : 'desc' }
        : (options.defaultSort ?? null),
      filters,
    };
    // `filterKeys` is a literal array at every call site, so it is compared by
    // its contents rather than by identity to avoid re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, defaultPageSize, filterKeys.join(','), options.defaultSort?.key, options.defaultSort?.direction]);

  const apply = useCallback(
    (changes: Record<string, string | number | null>, resetPage: boolean) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }

      if (resetPage) next.delete('page');

      // `scroll: false` keeps the viewport where it is: paging a long table
      // should not throw the reader back to the top of the page.
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return {
    ...state,

    setPage: (page) => apply({ page: page > 1 ? page : null }, false),
    setPageSize: (pageSize) =>
      apply({ pageSize: pageSize === defaultPageSize ? null : pageSize }, true),
    setSearch: (q) => apply({ q: q || null }, true),
    setSort: (sort) => apply({ sort: sort.key, order: sort.direction }, true),
    setFilter: (key, value) => apply({ [key]: value || null }, true),
    setFilters: (values) =>
      apply(
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])),
        true,
      ),

    clear: () => {
      const cleared: Record<string, null> = { q: null, page: null };
      for (const key of filterKeys) cleared[key] = null;
      apply(cleared, true);
    },

    isFiltered: Boolean(state.q) || Object.keys(state.filters).length > 0,

    queryParams: {
      page: state.page,
      pageSize: state.pageSize,
      ...(state.q ? { q: state.q } : {}),
      ...(state.sort ? { sort: state.sort.key, order: state.sort.direction } : {}),
      ...state.filters,
    },
  };
}

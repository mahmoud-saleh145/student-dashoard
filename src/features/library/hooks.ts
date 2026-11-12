'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDepartments, useFaculties, useUniversities } from '@/features/catalog/hooks';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { AcademicYear } from '@/types/domain';
import type {
  CreateLibraryPackageInput,
  CreateLibraryPartInput,
  CreateMaterialInput,
  LibraryMaterialDetail,
  LibraryMaterialRow,
  LibraryPurchaseRow,
  LibraryPurchaseTotals,
  PaginatedWithTotals,
  UpdateLibraryPackageInput,
  UpdateLibraryPartInput,
  UpdateMaterialInput,
} from '@/types/commerce';

import {
  IDLE_DEPARTMENT_LADDERS,
  IDLE_LADDER,
  intersectLadders,
  isPerYear,
  ladderScopes,
  type AudienceDraft,
  type DepartmentLadders,
  type LadderState,
} from './audience';

/**
 * The Library.
 *
 * **This is the only place wallet credit is spent.** A student recharges their
 * wallet with a card, then buys a library part or package; the debit and the
 * entitlement happen in one transaction on the server. Nothing in this module
 * references a course, an enrollment or a section, and that absence is the
 * design rather than an omission.
 *
 * Every route here is `@AdminOnly()` — there is no teacher-scoped library
 * endpoint at all, because a teacher has no assignment that could scope access
 * to a platform-wide catalogue.
 */

export function useLibraryMaterials(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.library.materials(query),
    queryFn: () => api.page<LibraryMaterialRow>('admin/library/materials', { query }),
    placeholderData: (previous) => previous,
  });
}

export function useLibraryMaterial(materialId: string) {
  return useQuery({
    queryKey: queryKeys.library.material(materialId),
    queryFn: () =>
      api.get<LibraryMaterialDetail>(`admin/library/materials/${materialId}`),
    enabled: Boolean(materialId),
  });
}

/**
 * Invalidation for anything that changes the catalogue.
 *
 * Deliberately broad: adding a part changes the material detail, the material
 * list's part count, and any package that might include it. Refetching the
 * domain is cheaper than reasoning about which of those moved.
 */
function useLibraryMutation<TInput, TResult>(
  perform: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  });
}

// --- audience ----------------------------------------------------------------

const CATALOG_STALE_TIME = 5 * 60_000;

/**
 * The year/level rungs valid for an audience.
 *
 * Resolved through the same scopes the backend's `checkYearInLadder` uses: the
 * college for a whole-college material, and each selected department for a
 * department selection — where only rungs every department's ladder shares are
 * offered. Each scope is its own cached `catalog/academic-years` request, keyed
 * exactly as `useAcademicYears` keys it, so the two share a cache.
 */
export function useAudienceLadder(draft: AudienceDraft): LadderState {
  const scopes = ladderScopes(draft);
  const results = useQueries({
    queries: scopes.map((scope) => {
      const id = 'departmentId' in scope ? scope.departmentId : scope.facultyId;
      return {
        queryKey: queryKeys.catalog.academicYears(id),
        queryFn: () => api.get<AcademicYear[]>('catalog/academic-years', { query: scope }),
        staleTime: CATALOG_STALE_TIME,
      };
    }),
  });

  if (scopes.length === 0) return IDLE_LADDER;
  // A query whose request failed but whose earlier answer is still cached is
  // not an error here: the answer it has is still the right one.
  // One being retried right now is loading, not failed.
  const failed = results.filter(
    (result) => result.isError && !result.data && !result.isFetching,
  );
  if (failed.length > 0) {
    return {
      ...IDLE_LADDER,
      status: 'error',
      // Only the scopes that failed are asked again; the others keep their
      // cached answers, and the draft itself is never touched.
      retry: () => {
        for (const result of failed) void result.refetch();
      },
    };
  }
  if (results.some((result) => !result.data)) return { ...IDLE_LADDER, status: 'loading' };
  return { status: 'ready', ...intersectLadders(results.map((result) => result.data ?? [])) };
}

/**
 * Every department's own ladder, for choosing departments per year/level.
 *
 * One cached `catalog/academic-years?departmentId=` request per department of
 * the college, keyed exactly as `useAudienceLadder` keys a department, so the
 * two share a cache. Only fetched while the draft is per-year.
 */
export function useDepartmentLadders(departmentIds: string[], enabled: boolean): DepartmentLadders {
  const ids = enabled ? [...new Set(departmentIds)].sort() : [];
  const results = useQueries({
    queries: ids.map((departmentId) => ({
      queryKey: queryKeys.catalog.academicYears(departmentId),
      queryFn: () => api.get<AcademicYear[]>('catalog/academic-years', { query: { departmentId } }),
      staleTime: CATALOG_STALE_TIME,
    })),
  });

  if (ids.length === 0) return IDLE_DEPARTMENT_LADDERS;
  const failed = results.filter((result) => result.isError && !result.data && !result.isFetching);
  const byDepartment = Object.fromEntries(
    ids.flatMap((id, index) => {
      const data = results[index]?.data;
      return data ? [[id, data]] : [];
    }),
  ) as Record<string, AcademicYear[]>;
  if (failed.length > 0) {
    return {
      status: 'error',
      byDepartment,
      retry: () => {
        for (const result of failed) void result.refetch();
      },
    };
  }
  if (results.some((result) => !result.data)) return { status: 'loading', byDepartment };
  return { status: 'ready', byDepartment };
}

/** Everything the audience editor reads, in one place for the form to share. */
export function useLibraryAudienceData(draft: AudienceDraft) {
  const universities = useUniversities();
  const faculties = useFaculties(draft.universityId || null);
  const departments = useDepartments(draft.facultyId || null);
  // The single ladder governs only a whole-college material now; departments
  // are checked year by year against their own ladders.
  const ladder = useAudienceLadder(
    draft.departmentScope === 'FACULTY' ? draft : { ...draft, departmentIds: [] },
  );
  const departmentLadders = useDepartmentLadders(
    (departments.data ?? []).map((d) => d.id),
    isPerYear(draft),
  );
  return { universities, faculties, departments, ladder, departmentLadders };
}

// --- materials -------------------------------------------------------------

export function useCreateMaterial() {
  return useLibraryMutation((input: CreateMaterialInput) =>
    api.post<LibraryMaterialDetail>('admin/library/materials', input),
  );
}

export function useUpdateMaterial(materialId: string) {
  return useLibraryMutation((input: UpdateMaterialInput) =>
    api.patch<LibraryMaterialDetail>(`admin/library/materials/${materialId}`, input),
  );
}

/**
 * Removes a material.
 *
 * Soft, and refused once any student holds an entitlement to one of its parts —
 * removing it would orphan something they paid credit for. Deactivating hides
 * it from the catalogue and keeps existing holders whole.
 */
export function useRemoveMaterial() {
  return useLibraryMutation((materialId: string) =>
    api.delete(`admin/library/materials/${materialId}`),
  );
}

// --- parts -----------------------------------------------------------------

export function useCreateLibraryPart(materialId: string) {
  return useLibraryMutation((input: CreateLibraryPartInput) =>
    api.post<LibraryMaterialDetail>(
      `admin/library/materials/${materialId}/parts`,
      input,
    ),
  );
}

export function useUpdateLibraryPart() {
  return useLibraryMutation((input: { partId: string } & UpdateLibraryPartInput) => {
    const { partId, ...body } = input;
    return api.patch<LibraryMaterialDetail>(`admin/library/parts/${partId}`, body);
  });
}

/** Refused once anyone holds it, and refused while it sits inside a package. */
export function useRemoveLibraryPart() {
  return useLibraryMutation((partId: string) =>
    api.delete(`admin/library/parts/${partId}`),
  );
}

// --- packages --------------------------------------------------------------

export function useCreateLibraryPackage() {
  return useLibraryMutation((input: CreateLibraryPackageInput) =>
    api.post('admin/library/packages', input),
  );
}

/**
 * Edits a package.
 *
 * Changing the contents affects **future** purchases only. Everyone who has
 * already bought holds entitlements to the parts it contained on the day they
 * bought it, because a purchase writes one entitlement per part rather than a
 * pointer to the package. The dialog says so where an admin will read it.
 */
export function useUpdateLibraryPackage() {
  return useLibraryMutation((input: { packageId: string } & UpdateLibraryPackageInput) => {
    const { packageId, ...body } = input;
    return api.patch(`admin/library/packages/${packageId}`, body);
  });
}

export function useRemoveLibraryPackage() {
  return useLibraryMutation((packageId: string) =>
    api.delete(`admin/library/packages/${packageId}`),
  );
}

// --- purchases -------------------------------------------------------------

/**
 * What students spent credit on.
 *
 * The total is labelled `creditsSpent`, never "revenue": the cash was
 * recognised when the recharge card was redeemed, and adding this to recharge
 * revenue would count every pound twice.
 */
export function useLibraryPurchases(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.library.purchases(query),
    queryFn: () =>
      api.get<PaginatedWithTotals<LibraryPurchaseRow, LibraryPurchaseTotals>>(
        'admin/library/purchases',
        { query },
      ),
    placeholderData: (previous) => previous,
  });
}

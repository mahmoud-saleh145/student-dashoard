'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
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

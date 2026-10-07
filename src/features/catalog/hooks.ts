'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AcademicStructure,
  AcademicStructureKind,
  AcademicYear,
  Department,
  Faculty,
  Subject,
  University,
} from '@/types/domain';

/**
 * Academic structure.
 *
 * The backend's hierarchy is University → Faculty → Department, with academic
 * years as a flat platform-wide list that both courses and students point at.
 * "College" in the interface is this `Faculty` — the dashboard renames it for
 * readers, it does not reshape the data.
 *
 * The catalogue changes rarely, so these are cached far longer than the rest
 * of the dashboard: every filter dropdown on every screen reads them.
 */

const CATALOG_STALE_TIME = 5 * 60_000;

export function useUniversities() {
  return useQuery({
    queryKey: queryKeys.catalog.universities,
    queryFn: () => api.get<University[]>('catalog/universities'),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useFaculties(universityId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.catalog.faculties(universityId ?? 'none'),
    queryFn: () => api.get<Faculty[]>(`catalog/universities/${universityId}/faculties`),
    enabled: Boolean(universityId),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useDepartments(facultyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.catalog.departments(facultyId ?? 'none'),
    queryFn: () => api.get<Department[]>(`catalog/faculties/${facultyId}/departments`),
    enabled: Boolean(facultyId),
    staleTime: CATALOG_STALE_TIME,
  });
}

/**
 * The one unit of scope a ladder can be asked about.
 *
 * `academicYears` on the API takes exactly one owner and refuses two, so this
 * is deliberately singular — mirroring `AcademicStructureValue`, where the
 * plural lives on departments because a course really can be offered to
 * several.
 */
export interface AcademicYearScope {
  universityId?: string | null;
  facultyId?: string | null;
  /** One department, not many: the API resolves a single owner. */
  departmentId?: string | null;
}

/**
 * The rungs a unit offers — its years, or its levels.
 *
 * Unscoped, this returns the platform-wide ladder, which is what every filter
 * dropdown wants: a notifications or audience filter lists everything that
 * exists, not one college's subset.
 *
 * Pass a scope where the ladder *depends* on the unit — the course form. A
 * faculty that counts in levels has its own structure, and asking for the
 * platform list there is how "First Year, Second Year" ended up showing
 * instead of "Level 1…Level 6".
 */
export function useAcademicYears(scope?: AcademicYearScope) {
  // Most specific wins, which is the same precedence the API resolves by.
  const query =
    scope?.departmentId
      ? { departmentId: scope.departmentId }
      : scope?.facultyId
        ? { facultyId: scope.facultyId }
        : scope?.universityId
          ? { universityId: scope.universityId }
          : {};

  const cacheScope =
    query.departmentId ?? query.facultyId ?? query.universityId ?? 'platform';

  return useQuery({
    queryKey: queryKeys.catalog.academicYears(cacheScope),
    queryFn: () => api.get<AcademicYear[]>('catalog/academic-years', { query }),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useSubjects(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.subjects.list({ includeInactive }),
    queryFn: () =>
      api.get<Subject[]>('subjects', {
        query: includeInactive ? { includeInactive: true } : {},
      }),
    staleTime: CATALOG_STALE_TIME,
  });
}

/** The whole tree in one request — used by the structure manager. */
export interface CatalogTree {
  universities: (University & {
    faculties: (Faculty & { departments: Department[] })[];
  })[];
  academicYears?: AcademicYear[];
}

export function useCatalogTree() {
  return useQuery({
    queryKey: queryKeys.catalog.tree,
    queryFn: () => api.get<CatalogTree>('catalog/tree'),
    staleTime: CATALOG_STALE_TIME,
  });
}

/** Every catalogue write invalidates the whole tree — it is small and cheap. */
function useCatalogMutation<TInput>(
  perform: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all }),
      ]);
    },
  });
}

export function useCreateUniversity() {
  return useCatalogMutation<{ name: string; nameAr: string; logoUrl?: string }>((input) =>
    api.post('catalog/universities', input),
  );
}

export function useUpdateUniversity() {
  return useCatalogMutation<{
    id: string;
    name?: string;
    nameAr?: string;
    logoUrl?: string | null;
    isActive?: boolean;
  }>(({ id, ...body }) => api.patch(`catalog/universities/${id}`, body));
}

export function useCreateFaculty() {
  return useCatalogMutation<{ universityId: string; name: string; nameAr: string }>((input) =>
    api.post('catalog/faculties', input),
  );
}

export function useCreateDepartment() {
  return useCatalogMutation<{ facultyId: string; name: string; nameAr: string }>((input) =>
    api.post('catalog/departments', input),
  );
}

export function useCreateAcademicYear() {
  return useCatalogMutation<{
    order: number;
    name: string;
    nameAr: string;
    /** Omitted writes to the platform-wide ladder, as this form always did. */
    structureId?: string;
  }>((input) => api.post('catalog/academic-years', input));
}

// ---------------------------------------------------------------------------
// Academic structures
// ---------------------------------------------------------------------------

/**
 * Every ladder with its rungs.
 *
 * Admin-only, and not cached as long as the pickers above: an administrator
 * editing structures expects to see their own change, and this screen is not
 * on the hot path that the registration dropdowns are.
 */
export function useAcademicStructures() {
  return useQuery({
    queryKey: queryKeys.catalog.academicStructures,
    queryFn: () => api.get<AcademicStructure[]>('catalog/academic-structures'),
  });
}

export function useCreateAcademicStructure() {
  return useCatalogMutation<{
    kind: AcademicStructureKind;
    universityId?: string;
    facultyId?: string;
    departmentId?: string;
  }>((input) => api.post('catalog/academic-structures', input));
}

export function useUpdateAcademicStructure() {
  return useCatalogMutation<{
    id: string;
    kind?: AcademicStructureKind;
    isActive?: boolean;
  }>(({ id, ...body }) => api.patch(`catalog/academic-structures/${id}`, body));
}

/**
 * Replaces a ladder's rungs in one write: how many, and their names.
 *
 * A rung left out is deactivated rather than deleted, because students and
 * courses point at it — the server does that, and the UI says so.
 */
export function useReplaceStructureEntries() {
  return useCatalogMutation<{
    id: string;
    entries: { order: number; name: string; nameAr: string }[];
  }>(({ id, entries }) => api.put(`catalog/academic-structures/${id}/entries`, { entries }));
}

export function useUpdateFaculty() {
  return useCatalogMutation<{
    id: string;
    name?: string;
    nameAr?: string;
    sortOrder?: number;
    isActive?: boolean;
  }>(({ id, ...body }) => api.patch(`catalog/faculties/${id}`, body));
}

export function useUpdateDepartment() {
  return useCatalogMutation<{
    id: string;
    name?: string;
    nameAr?: string;
    sortOrder?: number;
    isActive?: boolean;
  }>(({ id, ...body }) => api.patch(`catalog/departments/${id}`, body));
}

/**
 * The catalogue rows, as the backend names them.
 *
 * Singular, deliberately. These hooks used to send the plural — `universities`
 * — into a backend that switches on the singular, so the switch matched no
 * case, fell through, and answered `{ ok: true }` without deactivating
 * anything. The route now accepts both and refuses anything else, but sending
 * the name it actually uses is the honest fix.
 */
export type CatalogEntity = 'university' | 'faculty' | 'department' | 'academicYear';

/** What else points at a row, for the confirmation dialog to quote. */
export interface CatalogDependents {
  children: number;
  students: number;
}

export function useCatalogDependents(entity: CatalogEntity, id: string | null) {
  return useQuery({
    queryKey: ['catalog', 'dependents', entity, id],
    queryFn: () => api.get<CatalogDependents>(`catalog/${entity}/${id}/dependents`),
    enabled: Boolean(id),
    // Deliberately not cached: it is read at the moment of confirming, and a
    // stale count is worse than a brief spinner.
    staleTime: 0,
  });
}

/**
 * Deactivates a catalogue entity.
 *
 * The backend has no hard delete here on purpose: students and courses point
 * at these rows, and removing one would orphan them. Deactivating hides it
 * from new selections while every existing reference keeps resolving — which
 * is also why it is reversible; see `useReactivateCatalogEntity`.
 */
export function useDeactivateCatalogEntity() {
  return useCatalogMutation<{ entity: CatalogEntity; id: string }>(({ entity, id }) =>
    api.delete(`catalog/${entity}/${id}`),
  );
}

/** Puts a deactivated row back into service. */
export function useReactivateCatalogEntity() {
  return useCatalogMutation<{ entity: CatalogEntity; id: string }>(({ entity, id }) =>
    api.post(`catalog/${entity}/${id}/reactivate`, {}),
  );
}

export function useCreateSubject() {
  return useCatalogMutation<{ name: string; nameAr: string; sortOrder?: number }>((input) =>
    api.post('subjects', input),
  );
}

export function useUpdateSubject() {
  return useCatalogMutation<{
    id: string;
    name?: string;
    nameAr?: string;
    sortOrder?: number;
    isActive?: boolean;
  }>(({ id, ...body }) => api.patch(`subjects/${id}`, body));
}

export function useDeactivateSubject() {
  return useCatalogMutation<{ id: string }>(({ id }) => api.delete(`subjects/${id}`));
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
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

export function useAcademicYears() {
  return useQuery({
    queryKey: queryKeys.catalog.academicYears,
    queryFn: () => api.get<AcademicYear[]>('catalog/academic-years'),
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
  return useCatalogMutation<{ order: number; name: string; nameAr: string }>((input) =>
    api.post('catalog/academic-years', input),
  );
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

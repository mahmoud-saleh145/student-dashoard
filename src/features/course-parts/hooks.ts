'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  CoursePartPurchaseRow,
  CoursePartPurchaseTotals,
  CoursePartsView,
  CreateCoursePartInput,
  PaginatedWithTotals,
  UpdateCoursePartInput,
} from '@/types/commerce';

/**
 * Course parts.
 *
 * **Parts belong to the course payment system, not the wallet.** A student
 * unlocks a part by redeeming a part-scoped access card, exactly as they
 * unlock a whole course; the money changes hands offline and an administrator
 * issues the card. There is no purchase endpoint here and no debit anywhere in
 * this module — the backend does not expose one, deliberately.
 *
 * The structural routes are `@StaffOnly()`, so a teacher can reach them, but
 * the service then checks that this teacher is assigned to this course with
 * the right capability. The purchase report is `@AdminOnly()` and is kept out
 * of the teacher's navigation.
 *
 * Every mutation returns the whole `CoursePartsView`, so the cache is seeded
 * from the response rather than refetched. That matters for allocation: after
 * an edit, `allocationError` and every part's `effectivePrice` must be the
 * server's freshly computed values, never a locally patched guess.
 */

export function useCourseParts(courseId: string) {
  return useQuery({
    queryKey: queryKeys.courseParts.forCourse(courseId),
    queryFn: () => api.get<CoursePartsView>(`admin/courses/${courseId}/parts`),
    enabled: Boolean(courseId),
  });
}

/** Seeds the cache from a mutation's own response. */
function useSeedingMutation<TInput>(
  courseId: string,
  perform: (input: TInput) => Promise<CoursePartsView>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: (view) => {
      queryClient.setQueryData(queryKeys.courseParts.forCourse(courseId), view);
    },
  });
}

/**
 * Creates the conventional two-part split.
 *
 * 60/40 before and after the midterm, which is how these courses are actually
 * sold. It exists because building that by hand is four dialogs and an
 * arithmetic mistake waiting to happen.
 */
export function useCreateDefaultParts(courseId: string) {
  return useSeedingMutation(courseId, () =>
    api.post<CoursePartsView>(`admin/courses/${courseId}/parts/default`),
  );
}

export function useCreateCoursePart(courseId: string) {
  return useSeedingMutation(courseId, (input: CreateCoursePartInput) =>
    api.post<CoursePartsView>(`admin/courses/${courseId}/parts`, input),
  );
}

export function useUpdateCoursePart(courseId: string) {
  return useSeedingMutation(
    courseId,
    (input: { partId: string } & UpdateCoursePartInput) => {
      const { partId, ...body } = input;
      return api.patch<CoursePartsView>(`admin/course-parts/${partId}`, body);
    },
  );
}

/**
 * Sets which sections a part unlocks.
 *
 * An empty list is allowed: a part with no sections is priced but unlocks
 * nothing yet, which is a legitimate half-built state rather than an error.
 */
export function useSetPartSections(courseId: string) {
  return useSeedingMutation(courseId, (input: { partId: string; sectionIds: string[] }) =>
    api.put<CoursePartsView>(`admin/course-parts/${input.partId}/sections`, {
      sectionIds: input.sectionIds,
    }),
  );
}

/** Takes every part id in the new order — a partial list is rejected. */
export function useReorderCourseParts(courseId: string) {
  return useSeedingMutation(courseId, (partIds: string[]) =>
    api.put<CoursePartsView>(`admin/courses/${courseId}/parts/order`, { partIds }),
  );
}

/**
 * Removes a part.
 *
 * A soft delete, and refused outright once anyone has bought it — removing it
 * would orphan access somebody paid for. Deactivating is the way to take a
 * part off sale while keeping existing holders whole.
 */
export function useDeleteCoursePart(courseId: string) {
  return useSeedingMutation(courseId, (partId: string) =>
    api.delete<CoursePartsView>(`admin/course-parts/${partId}`),
  );
}

/**
 * Who unlocked which part.
 *
 * `@AdminOnly()`. The totals are catalogue value, **not cash** — the cash for
 * these arrived offline through whatever channel sold the access card, and is
 * accounted for there. The report labels it accordingly.
 */
export function usePartPurchases(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.courseParts.purchases(query),
    queryFn: () =>
      api.get<PaginatedWithTotals<CoursePartPurchaseRow, CoursePartPurchaseTotals>>(
        'admin/part-purchases',
        { query },
      ),
    placeholderData: (previous) => previous,
  });
}

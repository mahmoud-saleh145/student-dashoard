'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { CodeBatchRow, CodeRedemptionRow, CodeRow, CodeTargetType } from '@/types/domain';

export function useCodes(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.codes.list(query),
    queryFn: () => api.page<CodeRow>('admin/codes', { query }),
    placeholderData: (previous) => previous,
  });
}

export function useCodeRedemptions(codeId: string | null) {
  return useQuery({
    queryKey: queryKeys.codes.redemptions(codeId ?? 'none', {}),
    queryFn: () =>
      api.page<CodeRedemptionRow>(`admin/codes/${codeId}/redemptions`, {
        query: { page: 1, pageSize: 50 },
      }),
    enabled: Boolean(codeId),
  });
}

export function useCodeBatches(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.codes.batches(query),
    queryFn: () => api.page<CodeBatchRow>('admin/code-batches', { query }),
    placeholderData: (previous) => previous,
  });
}

export interface BatchCodesResponse {
  batch: CodeBatchRow;
  codes: {
    id: string;
    code: string;
    status: string;
    amount: number | null;
    currency: string;
    redemptionCount: number;
    maxRedemptions: number;
    expiresAt: string | null;
    createdAt: string;
  }[];
}

/**
 * Every card in a batch.
 *
 * Unpaginated by design — this is what the Excel export is built from, and a
 * partial export of a card batch is worse than none: the missing cards are
 * indistinguishable from cards that were never printed.
 */
export function useBatchCodes(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.codes.batchCodes(batchId ?? 'none'),
    queryFn: () => api.get<BatchCodesResponse>(`admin/code-batches/${batchId}/codes`),
    enabled: Boolean(batchId),
  });
}

export interface GenerateCodesInput {
  targetType: CodeTargetType;
  courseId?: string;
  sectionId?: string;
  teacherId?: string;
  /**
   * Required when `targetType` is `PART`.
   *
   * `CodesService.generateBatch` validates it — the part must exist, be on
   * sale, and have at least one section, since a card for a part that unlocks
   * nothing is worse than no card at all.
   */
  coursePartId?: string;
  batchName?: string;
  count: number;
  priceAmount?: number;
  expiresAt?: string;
  prefix?: string;
}

export interface GenerateCodesResult {
  batchId: string;
  batchName: string | null;
  targetType: CodeTargetType;
  targetName: string;
  requested: number;
  created: number;
  /** The plaintext codes, returned once and only at creation. */
  codes: string[];
}

export function useGenerateCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateCodesInput) =>
      api.post<GenerateCodesResult>('admin/codes/generate', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.codes.all });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/**
 * Cancels a code.
 *
 * Future use stops; a student who already redeemed it keeps their access,
 * because the grant was legitimate when it was made. That rule lives in the
 * backend — this only names it accurately for the person clicking.
 */
export function useRevokeCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { codeId: string; reason: string }) =>
      api.post(`admin/codes/${input.codeId}/revoke`, { reason: input.reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.codes.all });
    },
  });
}

export function useRevokeBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { batchId: string; reason: string }) =>
      api.post(`admin/codes/batches/${input.batchId}/revoke`, { reason: input.reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.codes.all });
    },
  });
}

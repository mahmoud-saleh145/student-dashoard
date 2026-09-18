'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  GenerateRechargeInput,
  GeneratedRechargeBatch,
  PaginatedWithTotals,
  RechargeCodeRow,
  RechargePreview,
  RechargeRevenueRow,
  RechargeRevenueTotals,
  WalletDetail,
  WalletIntegrity,
  WalletRow,
  WalletTxDirection,
  WalletTxRow,
} from '@/types/commerce';

/**
 * The wallet, from the administrator's side.
 *
 * Every endpoint here is `@AdminOnly()` on the backend — teachers receive 403
 * on all of them — which is why no teacher screen imports this module.
 *
 * **The wallet funds the Library and nothing else.** Credit enters by redeeming
 * a recharge card and leaves by buying a library part or package. No hook in
 * this file, and no endpoint it calls, can grant course access; courses and
 * course parts are unlocked by access cards, with the money taken offline.
 */

export function useWallets(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.wallet.wallets(query),
    queryFn: () => api.page<WalletRow>('admin/wallets', { query }),
    placeholderData: (previous) => previous,
  });
}

export function useWalletTransactions(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.wallet.transactions(query),
    queryFn: () => api.page<WalletTxRow>('admin/wallet-transactions', { query }),
    placeholderData: (previous) => previous,
  });
}

export function useWalletDetail(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.wallet.detail(userId ?? 'none'),
    queryFn: () => api.get<WalletDetail>(`admin/wallets/${userId}`),
    enabled: Boolean(userId),
  });
}

/**
 * Re-derives the balance from the ledger and compares it with the cached one.
 *
 * Deliberately not fetched with the detail: it is a reconciliation query an
 * administrator asks for when something looks wrong, not something to run on
 * every drawer open.
 */
export function useWalletIntegrity(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.wallet.integrity(userId ?? 'none'),
    queryFn: () => api.get<WalletIntegrity>(`admin/wallets/${userId}/integrity`),
    enabled: Boolean(userId) && enabled,
  });
}

/**
 * Moves credit by hand.
 *
 * Writes an `ADMIN_ADJUSTMENT` entry carrying the actor and the reason, so the
 * ledger explains itself later. The reason is mandatory in the backend DTO
 * (five characters minimum) and the form enforces the same thing early rather
 * than letting the request fail.
 */
export function useAdjustWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      userId: string;
      amount: number;
      direction: WalletTxDirection;
      reason: string;
    }) =>
      api.post(`admin/wallets/${input.userId}/adjust`, {
        amount: input.amount,
        direction: input.direction,
        reason: input.reason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Recharge cards — the only way credit is created
// ---------------------------------------------------------------------------

export function useRechargeCodes(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.wallet.rechargeCodes(query),
    queryFn: () => api.page<RechargeCodeRow>('admin/recharge-codes', { query }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Recognised recharge revenue.
 *
 * Carries `totals` beside `items`, so it cannot use `api.page`. The totals are
 * computed by the backend over the whole filtered set, not over the page —
 * summing the visible rows in the browser would report a different number on
 * every page, which is exactly the kind of quiet wrongness a financial screen
 * must not have.
 */
export function useRechargeRevenue(query: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.wallet.rechargeRevenue(query),
    queryFn: () =>
      api.get<PaginatedWithTotals<RechargeRevenueRow, RechargeRevenueTotals>>(
        'admin/recharge-revenue',
        { query },
      ),
    placeholderData: (previous) => previous,
  });
}

/**
 * Prices a card without creating anything.
 *
 * The discount arithmetic runs on the server and the result is displayed
 * verbatim. The browser never computes `faceValue − discount`: the server's
 * rounding is what will be frozen onto the card, and a figure the admin
 * approved that differs by a piastre from the figure stored is worse than no
 * preview at all.
 */
export function usePreviewRecharge() {
  return useMutation({
    mutationFn: (input: {
      faceValue: number;
      discountType?: string;
      discountPercent?: number;
      discountAmount?: number;
      count?: number;
    }) => api.post<RechargePreview>('admin/recharge-codes/preview', input),
  });
}

export function useGenerateRecharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateRechargeInput) =>
      api.post<GeneratedRechargeBatch>('admin/recharge-codes/generate', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.codes.all });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

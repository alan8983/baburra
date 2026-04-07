'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { useUserTier } from '@/hooks/use-feature-gate';

export type UnlockType = 'kol_ticker' | 'stock_page';

export interface UnlockDto {
  unlockType: UnlockType;
  targetKey: string;
  unlockedAt: string;
}

export const unlockKeys = {
  all: ['unlocks'] as const,
  list: () => [...unlockKeys.all, 'list'] as const,
};

export function useUserUnlocks() {
  return useQuery({
    queryKey: unlockKeys.list(),
    queryFn: async (): Promise<{ unlocks: UnlockDto[] }> => {
      const res = await fetch(API_ROUTES.UNLOCKS);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Returns helper predicates over the current user's unlock set.
 * Pro/Max users are treated as always-unlocked for layer2; Max users
 * are always-unlocked for layer3.
 */
export function useUnlockChecks() {
  const { data } = useUserUnlocks();
  const tier = useUserTier();

  return useMemo(() => {
    const set = new Set((data?.unlocks ?? []).map((u) => `${u.unlockType}:${u.targetKey}`));
    return {
      hasLayer2: (kolId: string, stockId: string) =>
        tier === 'pro' || tier === 'max' || set.has(`kol_ticker:${kolId}:${stockId}`),
      hasLayer3: (stockId: string) =>
        tier === 'max' || (tier === 'pro' && set.has(`stock_page:${stockId}`)),
      tier,
    };
  }, [data, tier]);
}

interface UnlockResult {
  unlocked: true;
  creditsRemaining?: number;
  quotaRemaining?: number;
  alreadyUnlocked: boolean;
}

export function useUnlockLayer2Mutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { kolId: string; stockId: string }): Promise<UnlockResult> => {
      const res = await fetch(API_ROUTES.UNLOCK_LAYER2, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unlockKeys.all });
      qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
    },
  });
}

export function useUnlockLayer3Mutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { stockId: string }): Promise<UnlockResult> => {
      const res = await fetch(API_ROUTES.UNLOCK_LAYER3, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unlockKeys.all });
      qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
    },
  });
}

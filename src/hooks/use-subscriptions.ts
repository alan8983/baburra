'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// ── Types ──

export interface Subscription {
  id: string;
  kolSourceId: string;
  kolId: string;
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  platformUrl: string;
  monitoringEnabled: boolean;
  lastScrapedAt: string | null;
  createdAt: string;
}

export interface KolSource {
  id: string;
  platform: string;
  url: string;
  isSubscribed: boolean;
}

export interface SubscribeInput {
  kolId: string;
  sourceId: string;
}

// ── Query Keys ──

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  list: () => [...subscriptionKeys.all, 'list'] as const,
  kolSources: (kolId: string) => [...subscriptionKeys.all, 'kolSources', kolId] as const,
};

// ── Hooks ──

export function useSubscriptions() {
  return useQuery({
    queryKey: subscriptionKeys.list(),
    queryFn: async (): Promise<Subscription[]> => {
      const res = await fetch(API_ROUTES.SUBSCRIPTIONS);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

export function useKolSources(kolId: string) {
  return useQuery({
    queryKey: subscriptionKeys.kolSources(kolId),
    queryFn: async (): Promise<KolSource[]> => {
      const res = await fetch(API_ROUTES.KOL_SOURCES(kolId));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!kolId,
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation<Subscription, Error, SubscribeInput>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.SUBSCRIPTIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.list() });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.kolSources(variables.kolId) });
    },
  });
}

export function useUnsubscribe() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SubscribeInput>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.SUBSCRIPTION_DELETE(input.sourceId), {
        method: 'DELETE',
      });
      await throwIfNotOk(res);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.list() });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.kolSources(variables.kolId) });
    },
  });
}

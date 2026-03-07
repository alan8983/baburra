'use client';

import { useQuery } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// ── Types ──

export interface TrendingStock {
  stockId: string;
  ticker: string;
  name: string;
  postCount: number;
}

export interface PopularKol {
  kolId: string;
  name: string;
  avatarUrl: string | null;
  followerCount: number;
}

export interface KolFollowerCountResponse {
  kolId: string;
  followerCount: number;
}

// ── Query Keys ──

export const insightKeys = {
  all: ['insights'] as const,
  trendingStocks: () => [...insightKeys.all, 'trending-stocks'] as const,
  popularKols: () => [...insightKeys.all, 'popular-kols'] as const,
  kolFollowers: (kolId: string) => [...insightKeys.all, 'kol-followers', kolId] as const,
};

// ── Hooks ──

export function useTrendingStocks(days?: number, limit?: number) {
  return useQuery({
    queryKey: insightKeys.trendingStocks(),
    queryFn: async (): Promise<TrendingStock[]> => {
      const params = new URLSearchParams();
      if (days != null) params.set('days', String(days));
      if (limit != null) params.set('limit', String(limit));
      const qs = params.toString();
      const url = API_ROUTES.INSIGHTS_TRENDING_STOCKS + (qs ? `?${qs}` : '');
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePopularKols(limit?: number) {
  return useQuery({
    queryKey: insightKeys.popularKols(),
    queryFn: async (): Promise<PopularKol[]> => {
      const params = new URLSearchParams();
      if (limit != null) params.set('limit', String(limit));
      const qs = params.toString();
      const url = API_ROUTES.INSIGHTS_POPULAR_KOLS + (qs ? `?${qs}` : '');
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useKolFollowerCount(kolId: string) {
  return useQuery({
    queryKey: insightKeys.kolFollowers(kolId),
    queryFn: async (): Promise<KolFollowerCountResponse> => {
      const res = await fetch(API_ROUTES.KOL_FOLLOWERS_COUNT(kolId));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!kolId,
    staleTime: 5 * 60 * 1000,
  });
}

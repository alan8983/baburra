'use client';

// KOL 相關 hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  KOL,
  KOLWithStats,
  CreateKOLInput,
  KOLSearchResult,
  PostWithPriceChanges,
} from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

import type { ReturnRateStats } from '@/domain/calculators';

// Query Keys
export const kolKeys = {
  all: ['kols'] as const,
  lists: () => [...kolKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...kolKeys.lists(), filters] as const,
  details: () => [...kolKeys.all, 'detail'] as const,
  detail: (id: string) => [...kolKeys.details(), id] as const,
  posts: (id: string) => [...kolKeys.detail(id), 'posts'] as const,
  returnRate: (id: string) => [...kolKeys.detail(id), 'return-rate'] as const,
  search: (query: string) => [...kolKeys.all, 'search', query] as const,
};

// 取得 KOL 列表
export function useKols(params?: {
  search?: string;
  page?: number;
  limit?: number;
  validationStatus?: string;
}) {
  return useQuery({
    queryKey: kolKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: KOLWithStats[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.validationStatus) searchParams.set('validationStatus', params.validationStatus);

      const url = `${API_ROUTES.KOLS}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 取得單一 KOL 詳情
export function useKol(id: string) {
  return useQuery({
    queryKey: kolKeys.detail(id),
    queryFn: async (): Promise<KOLWithStats> => {
      const res = await fetch(API_ROUTES.KOL_DETAIL(id));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!id,
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

// 取得 KOL 的文章列表
export function useKolPosts(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: [...kolKeys.posts(id), params ?? {}],
    queryFn: async (): Promise<{
      data: PostWithPriceChanges[];
      total: number;
      currentAiModel?: string;
    }> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      const url = `${API_ROUTES.KOL_POSTS(id)}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 搜尋 KOL (用於 Selector)
export function useKolSearch(query: string) {
  return useQuery({
    queryKey: kolKeys.search(query),
    queryFn: async (): Promise<KOLSearchResult[]> => {
      const res = await fetch(`${API_ROUTES.KOLS}?search=${encodeURIComponent(query)}&limit=10`);
      await throwIfNotOk(res);
      const { data } = await res.json();
      return data;
    },
    enabled: query.length >= 1,
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 建立 KOL
export function useCreateKol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateKOLInput): Promise<KOL> => {
      const res = await fetch(API_ROUTES.KOLS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kolKeys.lists() });
    },
  });
}

// 取得 KOL 報酬率統計
export function useKolReturnRate(id: string) {
  return useQuery({
    queryKey: kolKeys.returnRate(id),
    queryFn: async (): Promise<ReturnRateStats> => {
      const res = await fetch(API_ROUTES.KOL_RETURN_RATE(id));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 分鐘內不重新請求
    gcTime: 10 * 60 * 1000,
  });
}

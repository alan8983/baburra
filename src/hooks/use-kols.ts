'use client';

// KOL 相關 hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { KOL, KOLWithStats, CreateKOLInput, KOLSearchResult } from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';

// Query Keys
export const kolKeys = {
  all: ['kols'] as const,
  lists: () => [...kolKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...kolKeys.lists(), filters] as const,
  details: () => [...kolKeys.all, 'detail'] as const,
  detail: (id: string) => [...kolKeys.details(), id] as const,
  search: (query: string) => [...kolKeys.all, 'search', query] as const,
};

// 取得 KOL 列表
export function useKols(params?: { search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: kolKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: KOLWithStats[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const url = `${API_ROUTES.KOLS}?${searchParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch KOLs');
      return res.json();
    },
  });
}

// 取得單一 KOL 詳情
export function useKol(id: string) {
  return useQuery({
    queryKey: kolKeys.detail(id),
    queryFn: async (): Promise<KOLWithStats> => {
      const res = await fetch(API_ROUTES.KOL_DETAIL(id));
      if (!res.ok) throw new Error('Failed to fetch KOL');
      return res.json();
    },
    enabled: !!id,
  });
}

// 搜尋 KOL (用於 Selector)
export function useKolSearch(query: string) {
  return useQuery({
    queryKey: kolKeys.search(query),
    queryFn: async (): Promise<KOLSearchResult[]> => {
      const res = await fetch(`${API_ROUTES.KOLS}?search=${encodeURIComponent(query)}&limit=10`);
      if (!res.ok) throw new Error('Failed to search KOLs');
      const { data } = await res.json();
      return data;
    },
    enabled: query.length >= 1,
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
      if (!res.ok) throw new Error('Failed to create KOL');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kolKeys.lists() });
    },
  });
}

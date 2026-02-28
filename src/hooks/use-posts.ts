'use client';

// Post 相關 hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Post,
  PostWithRelations,
  PostWithPriceChanges,
  CreatePostInput,
  UpdatePostInput,
} from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// Query Keys
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
  byKol: (kolId: string) => [...postKeys.all, 'kol', kolId] as const,
  byStock: (ticker: string) => [...postKeys.all, 'stock', ticker] as const,
};

// 取得 Post 列表
export function usePosts(params?: {
  search?: string;
  kolId?: string;
  stockTicker?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: postKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: PostWithPriceChanges[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.kolId) searchParams.set('kolId', params.kolId);
      if (params?.stockTicker) searchParams.set('stockTicker', params.stockTicker);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const url = `${API_ROUTES.POSTS}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 取得單一 Post 詳情
export function usePost(id: string) {
  return useQuery({
    queryKey: postKeys.detail(id),
    queryFn: async (): Promise<PostWithPriceChanges> => {
      const res = await fetch(API_ROUTES.POST_DETAIL(id));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!id,
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

// 檢查重複 URL
export function useCheckDuplicateUrl(url: string) {
  return useQuery({
    queryKey: ['posts', 'checkDuplicate', url],
    queryFn: async (): Promise<{ isDuplicate: boolean; existingPost?: PostWithRelations }> => {
      const res = await fetch(`${API_ROUTES.POST_CHECK_DUPLICATE}?url=${encodeURIComponent(url)}`);
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!url && url.startsWith('http'),
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

// 建立 Post
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput): Promise<Post> => {
      const res = await fetch(API_ROUTES.POSTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

// 更新 Post
export function useUpdatePost(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePostInput): Promise<Post> => {
      const res = await fetch(API_ROUTES.POST_DETAIL(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

// 刪除 Post
export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(API_ROUTES.POST_DETAIL(id), {
        method: 'DELETE',
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

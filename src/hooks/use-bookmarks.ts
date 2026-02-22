'use client';

// Bookmark 相關 hooks - 呼叫 Bookmark API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookmarkWithPost } from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';

// Query Keys
export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarkKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...bookmarkKeys.lists(), filters] as const,
  status: (postId: string) => [...bookmarkKeys.all, 'status', postId] as const,
};

// 取得書籤列表
export function useBookmarks(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: bookmarkKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: BookmarkWithPost[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      const url = `${API_ROUTES.BOOKMARKS}?${searchParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch bookmarks');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 檢查單篇文章是否已加書籤
export function useBookmarkStatus(postId: string) {
  return useQuery({
    queryKey: bookmarkKeys.status(postId),
    queryFn: async (): Promise<{ isBookmarked: boolean }> => {
      const res = await fetch(API_ROUTES.BOOKMARK_STATUS(postId));
      if (!res.ok) throw new Error('Failed to check bookmark status');
      return res.json();
    },
    enabled: !!postId,
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

// 切換書籤（加入/移除）
export function useToggleBookmark(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (isCurrentlyBookmarked: boolean): Promise<void> => {
      if (isCurrentlyBookmarked) {
        const res = await fetch(API_ROUTES.BOOKMARK_STATUS(postId), { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to remove bookmark');
      } else {
        const res = await fetch(API_ROUTES.BOOKMARKS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId }),
        });
        if (!res.ok) throw new Error('Failed to add bookmark');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.status(postId) });
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
}

// 移除書籤
export function useRemoveBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string): Promise<void> => {
      const res = await fetch(API_ROUTES.BOOKMARK_STATUS(postId), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove bookmark');
    },
    onSuccess: (_data, postId) => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.status(postId) });
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { postKeys } from './use-posts';
import type { Post } from '@/domain/models';

export function useReanalyze(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<Post> => {
      const res = await fetch(API_ROUTES.POST_REANALYZE(postId), {
        method: 'POST',
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) });
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

export function useReanalyzeBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postIds: string[]): Promise<{ success: number; failed: number }> => {
      const res = await fetch(API_ROUTES.POST_REANALYZE_BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds }),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.all });
    },
  });
}

export function useStalePostCount() {
  return useQuery<{ count: number; currentModel: string; postIds: string[] }>({
    queryKey: [...postKeys.all, 'stale-count'],
    queryFn: async () => {
      const res = await fetch(API_ROUTES.POST_STALE_COUNT);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

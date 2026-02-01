'use client';

// Draft 相關 hooks - 呼叫 Draft API

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Draft, DraftWithRelations, CreateDraftInput, UpdateDraftInput } from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';

// Query Keys
export const draftKeys = {
  all: ['drafts'] as const,
  lists: () => [...draftKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...draftKeys.lists(), filters] as const,
  details: () => [...draftKeys.all, 'detail'] as const,
  detail: (id: string) => [...draftKeys.details(), id] as const,
};

// 取得草稿列表
export function useDrafts(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: draftKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: DraftWithRelations[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      const url = `${API_ROUTES.DRAFTS}?${searchParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch drafts');
      return res.json();
    },
  });
}

// 取得單一草稿詳情
export function useDraft(id: string) {
  return useQuery({
    queryKey: draftKeys.detail(id),
    queryFn: async (): Promise<DraftWithRelations> => {
      const res = await fetch(API_ROUTES.DRAFT_DETAIL(id));
      if (!res.ok) throw new Error('Failed to fetch draft');
      return res.json();
    },
    enabled: !!id,
  });
}

// 新增草稿
export function useCreateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDraftInput): Promise<Draft> => {
      const res = await fetch(API_ROUTES.DRAFTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to create draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.lists() });
    },
  });
}

// 更新草稿
export function useUpdateDraft(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDraftInput): Promise<DraftWithRelations> => {
      const res = await fetch(API_ROUTES.DRAFT_DETAIL(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to update draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: draftKeys.lists() });
    },
  });
}

// 刪除草稿
export function useDeleteDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(API_ROUTES.DRAFT_DETAIL(id), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete draft');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.lists() });
    },
  });
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';

export const unreadCountKeys = {
  all: ['unread-count'] as const,
};

export function useUnreadCount() {
  return useQuery({
    queryKey: unreadCountKeys.all,
    queryFn: async (): Promise<number> => {
      const res = await fetch(API_ROUTES.POST_UNREAD_COUNT);
      if (!res.ok) return 0;
      const { count } = await res.json();
      return count ?? 0;
    },
    staleTime: 60 * 1000, // 60s polling via staleTime
    refetchInterval: 60 * 1000,
  });
}

export function useMarkPostsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(API_ROUTES.POST_MARK_READ, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to mark posts as read');
    },
    onSuccess: () => {
      queryClient.setQueryData(unreadCountKeys.all, 0);
    },
  });
}

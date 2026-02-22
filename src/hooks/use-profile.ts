/**
 * Profile Hook — 用戶個人資料管理
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants/routes';

// =====================
// Types
// =====================

export interface ProfileData {
  displayName: string | null;
  timezone: string;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
}

interface UpdateProfileInput {
  displayName?: string;
  timezone?: string;
}

// =====================
// Query Keys
// =====================

export const profileKeys = {
  all: ['profile'] as const,
};

// =====================
// Hooks
// =====================

export function useProfile() {
  return useQuery<ProfileData>({
    queryKey: profileKeys.all,
    queryFn: async () => {
      const res = await fetch(API_ROUTES.PROFILE);
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<ProfileData, Error, UpdateProfileInput>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.PROFILE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

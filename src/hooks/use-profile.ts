/**
 * Profile Hook — 用戶個人資料管理
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants/routes';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import type { ColorPalette, WinRatePeriod } from '@/domain/models/user';

// =====================
// Types
// =====================

export interface ProfileData {
  displayName: string | null;
  timezone: string;
  colorPalette: ColorPalette;
  defaultWinRatePeriod: WinRatePeriod;
  firstImportFree: boolean;
}

interface UpdateProfileInput {
  displayName?: string;
  timezone?: string;
  colorPalette?: ColorPalette;
  defaultWinRatePeriod?: WinRatePeriod;
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
      await throwIfNotOk(res);
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
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

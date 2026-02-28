'use client';

/**
 * Onboarding Hook — 用戶引導流程狀態管理
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants/routes';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { useProfile, profileKeys } from './use-profile';

export function useOnboarding() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile();

  const completeOnboardingMutation = useMutation<void, Error>({
    mutationFn: async () => {
      const res = await fetch(API_ROUTES.PROFILE_ONBOARDING, {
        method: 'POST',
      });
      await throwIfNotOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });

  const isOnboardingCompleted = profile?.onboardingCompleted ?? false;

  return {
    isOnboardingCompleted,
    isLoading,
    completeOnboarding: completeOnboardingMutation.mutateAsync,
    shouldShowOnboarding: !isLoading && !isOnboardingCompleted,
  };
}

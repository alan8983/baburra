'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useOnboarding } from '@/hooks/use-onboarding';
import { ROUTES } from '@/lib/constants';

/**
 * Client component that redirects new users to onboarding.
 * Placed inside the (app) layout to fire after auth is confirmed.
 */
export function OnboardingGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { shouldShowOnboarding, isLoading } = useOnboarding();

  useEffect(() => {
    if (isLoading) return;
    if (shouldShowOnboarding && pathname !== ROUTES.ONBOARDING) {
      router.replace(ROUTES.ONBOARDING);
    }
  }, [shouldShowOnboarding, isLoading, pathname, router]);

  return null;
}

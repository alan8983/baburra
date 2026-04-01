import type { SubscriptionTier } from '@/domain/models/user';

export const TIER_LIMITS = {
  free: { kolTracking: 5, weeklyCredits: 700 },
  pro: { kolTracking: 30, weeklyCredits: 4200 },
  max: { kolTracking: 100, weeklyCredits: 21000 },
} as const satisfies Record<SubscriptionTier, { kolTracking: number; weeklyCredits: number }>;

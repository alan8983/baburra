import type { SubscriptionTier } from '@/domain/models/user';
import { isBetaMode, BETA_KOL_TRACKING_LIMIT, BETA_CREDIT_LIMIT } from '@/lib/constants/billing';

export const TIER_LIMITS = {
  free: { kolTracking: 5, weeklyCredits: 700 },
  pro: { kolTracking: 30, weeklyCredits: 4200 },
  max: { kolTracking: 100, weeklyCredits: 21000 },
} as const satisfies Record<SubscriptionTier, { kolTracking: number; weeklyCredits: number }>;

export function getEffectiveKolLimit(tier: SubscriptionTier): number {
  if (isBetaMode()) return BETA_KOL_TRACKING_LIMIT;
  return TIER_LIMITS[tier].kolTracking;
}

export function getEffectiveWeeklyCredits(tier: SubscriptionTier): number {
  if (isBetaMode()) return BETA_CREDIT_LIMIT;
  return TIER_LIMITS[tier].weeklyCredits;
}

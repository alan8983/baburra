import type { SubscriptionTier } from '@/domain/models/user';

// Calibrated against scrape-cost telemetry (tier-layer-unlocks task 0.2, 2026-04-08):
// - Free 500: realistic quick-input text analysis + 3 free L2 unlocks
// - Pro 5000: ~20–30 caption-based KOL scrapes OR ~50 L3 unlocks
// - Max 25000: ceiling for heavy scraping (L3 is unlimited for Max anyway)
export const TIER_LIMITS = {
  free: { kolTracking: 5, monthlyCredits: 500, freeL2UnlocksPerMonth: 3 },
  pro: { kolTracking: 30, monthlyCredits: 5000, freeL2UnlocksPerMonth: Infinity },
  max: { kolTracking: 100, monthlyCredits: 25000, freeL2UnlocksPerMonth: Infinity },
} as const satisfies Record<
  SubscriptionTier,
  { kolTracking: number; monthlyCredits: number; freeL2UnlocksPerMonth: number }
>;

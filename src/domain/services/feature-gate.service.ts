import type { SubscriptionTier } from '@/domain/models/user';

export type Feature =
  | 'argument_cards'
  | 'win_rate_breakdown'
  | 'kol_comparison'
  | 'argument_timeline'
  | 'csv_export'
  | 'api_access'
  | 'portfolio_simulation';

export type GateType = 'full_access' | 'blur_gate' | 'pro_badge' | 'locked';

export interface FeatureAccess {
  gate: GateType;
  previewLimit?: number;
  requiredTier: 'pro' | 'max';
}

type FeatureConfig = {
  gate: GateType;
  previewLimit?: number;
  requiredTier: 'pro' | 'max';
};

const FEATURE_MAP: Record<Feature, FeatureConfig> = {
  argument_cards: { gate: 'blur_gate', previewLimit: 2, requiredTier: 'pro' },
  win_rate_breakdown: { gate: 'blur_gate', previewLimit: 1, requiredTier: 'pro' },
  kol_comparison: { gate: 'pro_badge', requiredTier: 'pro' },
  argument_timeline: { gate: 'pro_badge', requiredTier: 'pro' },
  csv_export: { gate: 'pro_badge', requiredTier: 'pro' },
  api_access: { gate: 'locked', requiredTier: 'max' },
  portfolio_simulation: { gate: 'locked', requiredTier: 'max' },
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  max: 2,
};

export function getFeatureAccess(feature: Feature, userTier: SubscriptionTier): FeatureAccess {
  const config = FEATURE_MAP[feature];
  const hasAccess = TIER_RANK[userTier] >= TIER_RANK[config.requiredTier];

  if (hasAccess) {
    return { gate: 'full_access', requiredTier: config.requiredTier };
  }

  return {
    gate: config.gate,
    ...(config.previewLimit !== undefined && { previewLimit: config.previewLimit }),
    requiredTier: config.requiredTier,
  };
}

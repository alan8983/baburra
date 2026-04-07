/**
 * Feature Gate Service — layer-based tier gating.
 *
 * Three layers (see openspec/changes/tier-layer-unlocks/specs/tier-unlocks/spec.md):
 *   - layer1: aggregated KOL intel (free for all tiers)
 *   - layer2: single KOL × ticker deep dive (Free: monthly quota; Pro/Max: unlimited)
 *   - layer3: cross-KOL stock page (Free: locked; Pro: credit-gated; Max: unlimited)
 *
 * UI note: per-unlock state is the authoritative check for whether a specific
 * (kolId, stockId) or stockId is visible. This service only answers the tier-level
 * question "what gating mode applies to layer X for tier Y".
 */

import type { SubscriptionTier } from '@/domain/models/user';

// Primary layer-based API
export type Layer = 'layer1' | 'layer2' | 'layer3';

// Legacy feature names — mapped to layers so existing <BlurGate feature="..."/> sites
// continue to compile. New code should use Layer directly.
export type LegacyFeature =
  | 'argument_cards'
  | 'win_rate_breakdown'
  | 'kol_comparison'
  | 'argument_timeline'
  | 'csv_export'
  | 'api_access'
  | 'portfolio_simulation';

export type Feature = Layer | LegacyFeature;

export type GateType = 'full_access' | 'blur_gate' | 'pro_badge' | 'locked';

export interface FeatureAccess {
  gate: GateType;
  previewLimit?: number;
  requiredTier: 'pro' | 'max';
  layer: Layer;
}

const LEGACY_TO_LAYER: Record<LegacyFeature, Layer> = {
  // L2 features — single-KOL deep dive
  argument_cards: 'layer2',
  win_rate_breakdown: 'layer2',
  argument_timeline: 'layer2',
  // L3 features — cross-KOL
  kol_comparison: 'layer3',
  // Out-of-MVP-scope; treated as layer3 locked for everyone until built
  csv_export: 'layer3',
  api_access: 'layer3',
  portfolio_simulation: 'layer3',
};

function resolveLayer(feature: Feature): Layer {
  if (feature === 'layer1' || feature === 'layer2' || feature === 'layer3') {
    return feature;
  }
  return LEGACY_TO_LAYER[feature];
}

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, pro: 1, max: 2 };

export function getFeatureAccess(feature: Feature, userTier: SubscriptionTier): FeatureAccess {
  const layer = resolveLayer(feature);

  if (layer === 'layer1') {
    return { gate: 'full_access', requiredTier: 'pro', layer };
  }

  if (layer === 'layer2') {
    // L2 is blur-gated at the tier level for Free; the actual unlock decision is
    // per-(kolId, stockId) and lives in UnlockService / useUnlocks. Pages that show
    // a L2 preview with upgrade-ramp should use BlurGate; pages that need the exact
    // per-unlock gate should call useHasUnlockedLayer2 instead.
    if (TIER_RANK[userTier] >= TIER_RANK.pro) {
      return { gate: 'full_access', requiredTier: 'pro', layer };
    }
    return { gate: 'blur_gate', previewLimit: 2, requiredTier: 'pro', layer };
  }

  // layer3
  if (TIER_RANK[userTier] >= TIER_RANK.max) {
    return { gate: 'full_access', requiredTier: 'max', layer };
  }
  // Pro users can unlock individual L3 pages with credits; Free users cannot.
  // Tier-level render mode is "locked" for both; the page-level check in
  // useHasUnlockedLayer3 decides actual visibility.
  return { gate: 'locked', requiredTier: userTier === 'free' ? 'pro' : 'max', layer };
}

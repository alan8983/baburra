'use client';

import { useAiUsage } from '@/hooks/use-ai';
import {
  getFeatureAccess,
  type Feature,
  type FeatureAccess,
} from '@/domain/services/feature-gate.service';
import type { SubscriptionTier } from '@/domain/models/user';

export function useFeatureGate(feature: Feature) {
  const { data: aiUsage } = useAiUsage();
  const userTier: SubscriptionTier = aiUsage?.subscriptionTier ?? 'free';
  const access: FeatureAccess = getFeatureAccess(feature, userTier);

  return {
    access,
    canAccess: access.gate === 'full_access',
    isBlurred: access.gate === 'blur_gate',
    isLocked: access.gate === 'pro_badge' || access.gate === 'locked',
    previewLimit: access.previewLimit ?? null,
    requiredTier: access.requiredTier,
  };
}

export function useUserTier(): SubscriptionTier {
  const { data: aiUsage } = useAiUsage();
  return aiUsage?.subscriptionTier ?? 'free';
}

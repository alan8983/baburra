// User 領域模型

import { isBetaMode, BETA_CREDIT_LIMIT } from '@/lib/constants/billing';

export type SubscriptionTier = 'free' | 'pro' | 'max';
export type ColorPalette = 'american' | 'asian';
export type ProfileStatus = 'active' | 'waitlisted';

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  colorPalette: ColorPalette;
  creditBalance: number;
  creditResetAt: Date | null;
  subscriptionTier: SubscriptionTier;
  status: ProfileStatus;
  firstImportFree: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  colorPalette?: ColorPalette;
}

// Credit system constants
export const CREDIT_LIMITS = {
  free: 700,
  pro: 4200,
  max: 21000,
} as const;

export function getEffectiveCreditLimit(tier: SubscriptionTier): number {
  if (isBetaMode()) return BETA_CREDIT_LIMIT;
  return CREDIT_LIMITS[tier];
}

export const CREDIT_COSTS = {
  text_analysis: 1,
  youtube_caption_analysis: 2,
  video_transcription_per_min: 5,
  reroll_analysis: 3,
} as const;

// Backward compatibility alias (deprecated — use CREDIT_LIMITS)
export const AI_QUOTA = {
  FREE_WEEKLY_LIMIT: CREDIT_LIMITS.free,
  PREMIUM_WEEKLY_LIMIT: CREDIT_LIMITS.pro,
} as const;

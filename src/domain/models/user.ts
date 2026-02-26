// User 領域模型

export type SubscriptionTier = 'free' | 'premium';
export type ColorPalette = 'american' | 'asian';

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  colorPalette: ColorPalette;
  aiUsageCount: number;
  aiUsageResetAt: Date | null;
  subscriptionTier: SubscriptionTier;
  onboardingCompleted: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  colorPalette?: ColorPalette;
}

// AI 配額常數
export const AI_QUOTA = {
  FREE_WEEKLY_LIMIT: 15,
  PREMIUM_WEEKLY_LIMIT: 100,
} as const;

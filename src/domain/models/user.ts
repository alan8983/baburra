// User 領域模型

export type SubscriptionTier = 'free' | 'pro' | 'max';
export type ColorPalette = 'american' | 'asian';

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  colorPalette: ColorPalette;
  creditBalance: number;
  creditResetAt: Date | null;
  subscriptionTier: SubscriptionTier;
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

// Credit system constants — monthly allotments (calibrated 2026-04-08, tasks.md 0.2)
export const MONTHLY_CREDIT_LIMITS = {
  free: 500,
  pro: 5000,
  max: 25000,
} as const;

// Deprecated alias kept to minimise blast radius; prefer MONTHLY_CREDIT_LIMITS.
export const CREDIT_LIMITS = MONTHLY_CREDIT_LIMITS;

export const CREDIT_COSTS = {
  text_analysis: 1,
  youtube_caption_analysis: 2,
  video_transcription_per_min: 5,
  short_transcription: 3,
  reroll_analysis: 3,
  podcast_transcript_analysis: 2,
} as const;

// Unlock costs (credits deducted on unlock, persistent per user)
// Calibrated: 100 credits at Pro 5000/mo = 50 L3 unlocks max, creates visible Max upsell pressure.
export const UNLOCK_COSTS = {
  layer3_stock_page: 100,
} as const;

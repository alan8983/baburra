// User 領域模型

import { composeCost } from './credit-blocks';

export type SubscriptionTier = 'free' | 'pro' | 'max';
export type ColorPalette = 'american' | 'asian';

/**
 * Period key used by the performance metrics UI. Matches the four buckets on
 * `WinRateStats` (`day5` / `day30` / `day90` / `day365`), but keyed by the
 * human-readable short form so it can round-trip through URL params, settings
 * UI, and the `profiles.default_win_rate_period` column.
 */
export type WinRatePeriod = '5d' | '30d' | '90d' | '365d';
export const WIN_RATE_PERIODS: readonly WinRatePeriod[] = ['5d', '30d', '90d', '365d'] as const;
export const DEFAULT_WIN_RATE_PERIOD: WinRatePeriod = '30d';

/** Maps a UI period key to the corresponding `WinRateStats` bucket key. */
export const WIN_RATE_PERIOD_TO_BUCKET: Record<
  WinRatePeriod,
  'day5' | 'day30' | 'day90' | 'day365'
> = {
  '5d': 'day5',
  '30d': 'day30',
  '90d': 'day90',
  '365d': 'day365',
};

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  colorPalette: ColorPalette;
  defaultWinRatePeriod: WinRatePeriod;
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
  defaultWinRatePeriod?: WinRatePeriod;
}

// Credit system constants — monthly allotments (calibrated 2026-04-08, tasks.md 0.2)
export const MONTHLY_CREDIT_LIMITS = {
  free: 500,
  pro: 5000,
  max: 25000,
} as const;

// Deprecated alias kept to minimise blast radius; prefer MONTHLY_CREDIT_LIMITS.
export const CREDIT_LIMITS = MONTHLY_CREDIT_LIMITS;

/**
 * @deprecated Use `composeCost` from `./credit-blocks` with an explicit recipe
 * instead. This constant is kept as a thin shim for one release while call
 * sites migrate to the lego model. Values are derived from `composeCost` on
 * the canonical recipes for each legacy input type.
 *
 * Numeric deltas vs. the previous flat values (documented in the
 * `rework-credit-cost-lego` change):
 *   text_analysis:                1  -> 2  (+1)
 *   youtube_caption_analysis:     2  -> 2
 *   video_transcription_per_min:  5  -> 3  (-2)  per-minute marginal cost
 *   short_transcription:          3  -> 3
 *   reroll_analysis:              3  -> 2  (-1)
 *   podcast_transcript_analysis:  2  -> 2
 */
export const CREDIT_COSTS = {
  // scrape.html(0.2) + ai.analyze.short(1.0) -> ceil -> 2
  text_analysis: composeCost([
    { block: 'scrape.html', units: 1 },
    { block: 'ai.analyze.short', units: 1 },
  ]),
  // scrape.youtube_meta(0.2) + scrape.youtube_captions(0.5) + ai.analyze.short(1.0) -> ceil -> 2
  youtube_caption_analysis: composeCost([
    { block: 'scrape.youtube_meta', units: 1 },
    { block: 'scrape.youtube_captions', units: 1 },
    { block: 'ai.analyze.short', units: 1 },
  ]),
  // download.audio.long(0.1) + transcribe.audio(1.5) per minute, plus a flat
  // ai.analyze.short amortised in. Per-minute marginal recipe:
  //   download.audio.long*1 + transcribe.audio*1 = 1.6 -> 2
  // Legacy callers multiply by minutes themselves, so this is per-minute only.
  video_transcription_per_min: composeCost([
    { block: 'download.audio.long', units: 1 },
    { block: 'transcribe.audio', units: 1 },
  ]),
  // scrape.youtube_meta(0.2) + download.audio.short(0.3) + transcribe.audio(1.5) + ai.analyze.short(1.0) = 3
  short_transcription: composeCost([
    { block: 'scrape.youtube_meta', units: 1 },
    { block: 'download.audio.short', units: 1 },
    { block: 'transcribe.audio', units: 1 },
    { block: 'ai.analyze.short', units: 1 },
  ]),
  // ai.reroll(2.0) -> 2
  reroll_analysis: composeCost([{ block: 'ai.reroll', units: 1 }]),
  // scrape.rss(0.3) + transcribe.cached_transcript(0.2) + ai.analyze.short(1.0) -> ceil -> 2
  podcast_transcript_analysis: composeCost([
    { block: 'scrape.rss', units: 1 },
    { block: 'transcribe.cached_transcript', units: 1 },
    { block: 'ai.analyze.short', units: 1 },
  ]),
} as const;

// Unlock costs (credits deducted on unlock, persistent per user)
// Calibrated: 100 credits at Pro 5000/mo = 50 L3 unlocks max, creates visible Max upsell pressure.
export const UNLOCK_COSTS = {
  layer3_stock_page: 100,
} as const;

/**
 * WinRate service
 *
 * Composes the pure win-rate classifier with an injected `VolatilityProvider`.
 * For each (post, stock, period) tuple it:
 *   1. Resolves the per-post 1σ threshold via `getVolatilityThreshold(ticker, period, postedAt)`.
 *   2. Classifies the outcome using `classifyOutcome`.
 *   3. Aggregates per-period buckets into `WinRateStats`.
 *
 * The provider is injected so unit tests can supply a fake. The default
 * production provider is `StockPriceVolatilityProvider`, which lives in
 * `infrastructure/` to avoid leaking I/O into the domain layer.
 */

import {
  aggregateBucket,
  classifyOutcome,
  emptyStats,
  getVolatilityThreshold,
  type ClassifiedSample,
  type PeriodDays,
  type ThresholdRef,
  type VolatilityProvider,
  type WinRateStats,
  UnsupportedMarketError,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models/post';

export interface PostForWinRate {
  id: string;
  sentiment: Sentiment;
  postedAt: Date;
  stockSentiments?: Record<string, Sentiment>;
  /** stockId → ticker */
  tickerByStockId: Record<string, string>;
  /** stockId → priceChanges (day5/30/90/365 + status) */
  priceChanges: Record<string, PriceChangeByPeriod>;
}

export interface ComputeWinRateArgs {
  posts: PostForWinRate[];
  provider: VolatilityProvider;
}

const PERIODS: PeriodDays[] = [5, 30, 90, 365];
const PERIOD_KEYS: Record<PeriodDays, keyof PriceChangeByPeriod> = {
  5: 'day5',
  30: 'day30',
  90: 'day90',
  365: 'day365',
};
export async function computeWinRateStats(args: ComputeWinRateArgs): Promise<WinRateStats> {
  const { posts, provider } = args;
  if (posts.length === 0) return emptyStats();

  const samplesByPeriod: Record<PeriodDays, ClassifiedSample[]> = {
    5: [],
    30: [],
    90: [],
    365: [],
  };

  for (const post of posts) {
    const stockIds = Object.keys(post.priceChanges);
    for (const stockId of stockIds) {
      const effectiveSentiment = post.stockSentiments?.[stockId] ?? post.sentiment;
      const ticker = post.tickerByStockId[stockId];
      const pc = post.priceChanges[stockId];
      if (!ticker || !pc) continue;

      for (const period of PERIODS) {
        const periodKey = PERIOD_KEYS[period];
        const priceChange = pc[periodKey] as number | null;

        // Excluded short-circuit: skip σ lookup entirely.
        if (effectiveSentiment === 0 || priceChange === null) {
          samplesByPeriod[period].push({ outcome: 'excluded', threshold: null });
          continue;
        }

        let threshold: ThresholdRef | null = null;
        try {
          const result = await getVolatilityThreshold({
            ticker,
            periodDays: period,
            asOfDate: post.postedAt,
            provider,
          });
          threshold = { value: result.value, source: result.source };
        } catch (err) {
          if (err instanceof UnsupportedMarketError) {
            // HK / unknown markets can't be classified — treat as excluded.
            samplesByPeriod[period].push({ outcome: 'excluded', threshold: null });
            continue;
          }
          throw err;
        }

        if (threshold === null || threshold.value === 0) {
          // Degenerate threshold (no history at all) — exclude.
          samplesByPeriod[period].push({ outcome: 'excluded', threshold: null });
          continue;
        }

        const outcome = classifyOutcome({
          sentiment: effectiveSentiment,
          priceChange,
          threshold: threshold.value,
        });
        samplesByPeriod[period].push({ outcome, threshold });
      }
    }
  }

  return {
    day5: aggregateBucket(samplesByPeriod[5]),
    day30: aggregateBucket(samplesByPeriod[30]),
    day90: aggregateBucket(samplesByPeriod[90]),
    day365: aggregateBucket(samplesByPeriod[365]),
  };
}

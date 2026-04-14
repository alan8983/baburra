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
 *
 * When an optional `sampleRepo` is supplied, the pipeline becomes read-first:
 *   1. Load every persisted sample row for the input post IDs in one query.
 *   2. Classify only the missing (post, stock, period) tuples (sparse fill).
 *   3. Batch-upsert the fresh rows so future calls hit the cache.
 * Samples are immutable per `(post, stock, period, classifier_version)`, so
 * concurrent writes are idempotent (last write wins with the same payload).
 */

import {
  aggregateBucket,
  classifyOutcome,
  computeExcessReturn,
  CLASSIFIER_VERSION,
  emptyStats,
  getVolatilityThreshold,
  type ClassifiedSample,
  type PeriodDays,
  type ThresholdRef,
  type VolatilityProvider,
  type WinRateBucket,
  type WinRateStats,
  UnsupportedMarketError,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models/post';
import type { WinRateSampleRow } from '@/infrastructure/repositories/win-rate-sample.repository';

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

/**
 * Minimal repository contract the service consumes. The real implementation
 * lives in `infrastructure/repositories/win-rate-sample.repository.ts` but
 * tests plug in an in-memory fake.
 */
export interface WinRateSampleRepo {
  loadSamplesByPostIds(
    postIds: string[],
    classifierVersion: number
  ): Promise<Map<string, WinRateSampleRow>>;
  upsertSamples(rows: WinRateSampleRow[]): Promise<void>;
}

export interface ComputeWinRateArgs {
  posts: PostForWinRate[];
  provider: VolatilityProvider;
  /**
   * Optional sample repository. When supplied, the pipeline reads cached
   * classification rows before touching the provider and upserts freshly
   * classified tuples afterward.
   */
  sampleRepo?: WinRateSampleRepo;
  /**
   * When true, the returned stats include `bucketsByStock` — a per-stock
   * WinRateStats breakdown computed from the same sample set.
   */
  includeBucketsByStock?: boolean;
}

const PERIODS: PeriodDays[] = [5, 30, 90, 365];
const PERIOD_KEYS: Record<PeriodDays, keyof PriceChangeByPeriod> = {
  5: 'day5',
  30: 'day30',
  90: 'day90',
  365: 'day365',
};

function sampleKey(postId: string, stockId: string, period: PeriodDays): string {
  return `${postId}:${stockId}:${period}`;
}

/** Convert a persisted sample row into the ClassifiedSample shape used by aggregators. */
function rowToClassified(row: WinRateSampleRow): ClassifiedSample {
  const threshold: ThresholdRef | null =
    row.thresholdValue !== null && row.thresholdSource !== null
      ? { value: row.thresholdValue, source: row.thresholdSource }
      : null;
  return {
    outcome: row.outcome,
    threshold,
    excessReturn: row.excessReturn,
  };
}

/** Build a persisted row payload from a freshly classified sample. */
function classifiedToRow(
  postId: string,
  stockId: string,
  period: PeriodDays,
  sample: ClassifiedSample
): WinRateSampleRow {
  return {
    postId,
    stockId,
    periodDays: period,
    outcome: sample.outcome,
    excessReturn: sample.excessReturn,
    thresholdValue: sample.threshold?.value ?? null,
    thresholdSource: sample.threshold?.source ?? null,
    classifierVersion: CLASSIFIER_VERSION,
  };
}

type PerPeriodBag = Record<PeriodDays, ClassifiedSample[]>;
type PerStockPerPeriodBag = Record<string, PerPeriodBag>;

function newPerPeriodBag(): PerPeriodBag {
  return { 5: [], 30: [], 90: [], 365: [] };
}

function aggregateByPeriod(bag: PerPeriodBag): WinRateStats {
  return {
    day5: aggregateBucket(bag[5]),
    day30: aggregateBucket(bag[30]),
    day90: aggregateBucket(bag[90]),
    day365: aggregateBucket(bag[365]),
  };
}

function aggregateByStock(byStock: PerStockPerPeriodBag): Record<string, WinRateStats> {
  const out: Record<string, WinRateStats> = {};
  for (const [stockId, bag] of Object.entries(byStock)) {
    out[stockId] = aggregateByPeriod(bag);
  }
  return out;
}

export async function computeWinRateStats(args: ComputeWinRateArgs): Promise<WinRateStats> {
  const { posts, provider, sampleRepo, includeBucketsByStock } = args;
  if (posts.length === 0) return emptyStats();

  // Step 1: Load any already-cached samples for these posts in one query.
  const loadedSamples = sampleRepo
    ? await sampleRepo.loadSamplesByPostIds(
        posts.map((p) => p.id),
        CLASSIFIER_VERSION
      )
    : new Map<string, WinRateSampleRow>();

  const samplesByPeriod = newPerPeriodBag();
  const samplesByStock: PerStockPerPeriodBag = {};
  const freshRows: WinRateSampleRow[] = [];

  const recordSample = (stockId: string, period: PeriodDays, sample: ClassifiedSample): void => {
    samplesByPeriod[period].push(sample);
    if (includeBucketsByStock) {
      if (!samplesByStock[stockId]) samplesByStock[stockId] = newPerPeriodBag();
      samplesByStock[stockId][period].push(sample);
    }
  };

  for (const post of posts) {
    const stockIds = Object.keys(post.priceChanges);
    for (const stockId of stockIds) {
      const effectiveSentiment = post.stockSentiments?.[stockId] ?? post.sentiment;
      const ticker = post.tickerByStockId[stockId];
      const pc = post.priceChanges[stockId];
      if (!ticker || !pc) continue;

      for (const period of PERIODS) {
        // Cache hit — reuse stored classification directly.
        const cached = loadedSamples.get(sampleKey(post.id, stockId, period));
        if (cached) {
          recordSample(stockId, period, rowToClassified(cached));
          continue;
        }

        const periodKey = PERIOD_KEYS[period];
        const priceChange = pc[periodKey] as number | null;

        // Excluded short-circuit: skip σ lookup entirely.
        if (effectiveSentiment === 0 || priceChange === null) {
          const sample: ClassifiedSample = {
            outcome: 'excluded',
            threshold: null,
            excessReturn: null,
          };
          recordSample(stockId, period, sample);
          if (sampleRepo) freshRows.push(classifiedToRow(post.id, stockId, period, sample));
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
            const sample: ClassifiedSample = {
              outcome: 'excluded',
              threshold: null,
              excessReturn: null,
            };
            recordSample(stockId, period, sample);
            if (sampleRepo) freshRows.push(classifiedToRow(post.id, stockId, period, sample));
            continue;
          }
          throw err;
        }

        if (threshold === null || threshold.value === 0) {
          // Degenerate threshold (no history at all) — exclude.
          const sample: ClassifiedSample = {
            outcome: 'excluded',
            threshold: null,
            excessReturn: null,
          };
          recordSample(stockId, period, sample);
          if (sampleRepo) freshRows.push(classifiedToRow(post.id, stockId, period, sample));
          continue;
        }

        const classifyArgs = {
          sentiment: effectiveSentiment,
          priceChange,
          threshold: threshold.value,
        };
        const outcome = classifyOutcome(classifyArgs);
        const excessReturn = outcome === 'excluded' ? null : computeExcessReturn(classifyArgs);
        const sample: ClassifiedSample = { outcome, threshold, excessReturn };
        recordSample(stockId, period, sample);
        if (sampleRepo) freshRows.push(classifiedToRow(post.id, stockId, period, sample));
      }
    }
  }

  // Step 3: persist fresh rows so future reads hit the cache.
  if (sampleRepo && freshRows.length > 0) {
    try {
      await sampleRepo.upsertSamples(freshRows);
    } catch (err) {
      console.warn(
        '[win-rate.service] sample upsert failed:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // Step 4: aggregate globally and (optionally) per-stock.
  const stats = aggregateByPeriod(samplesByPeriod);
  if (includeBucketsByStock) {
    (stats as WinRateStats & { bucketsByStock?: Record<string, WinRateStats> }).bucketsByStock =
      aggregateByStock(samplesByStock);
  }
  return stats;
}

export type { WinRateBucket };

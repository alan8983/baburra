/**
 * Win-rate classifier + performance metrics
 *
 * Pure functions that classify a single (sentiment, priceChange, threshold) tuple
 * into win/lose/noise/excluded, compute σ-normalized excess returns, and aggregate
 * per-period performance metrics (Hit Rate, Precision, Avg Excess Win/Lose, SQR).
 *
 * Semantics:
 * - Bullish (sentiment > 0):  change > +threshold → win, < -threshold → lose, else noise.
 * - Bearish (sentiment < 0):  change < -threshold → win, > +threshold → lose, else noise.
 * - Neutral (sentiment === 0) or null change → excluded.
 * - Noise band is the closed interval [-threshold, +threshold].
 * - excessReturn = directionSign * priceChange / threshold  (positive when winning).
 * - hitRate     = wins / (wins + noise + loses)   // primary UI metric
 * - precision   = wins / (wins + loses)           // legacy winRate definition
 * - SQR         = mean(excessReturn) / stdev(excessReturn) over all non-excluded samples.
 * - A period is `sufficientData` only when (wins + loses) >= MIN_RESOLVED_POSTS_PER_PERIOD.
 */

import type { PriceChangeStatus, Sentiment } from '@/domain/models/post';

export type { PriceChangeStatus };

export type WinRateOutcome = 'win' | 'lose' | 'noise' | 'excluded';

/** Minimum (wins + loses) required for a period to expose derived metrics. */
export const MIN_RESOLVED_POSTS_PER_PERIOD = 10;

/**
 * Version tag stamped onto every persisted sample row so the win-rate API can
 * filter rows produced by the current classifier math. Bump when the
 * classification logic (noise-band formula, σ-multiplier, excluded short-circuit)
 * changes; old rows become invisible and an opt-in backfill regenerates at the
 * new version. Queries MUST pin this value — never read rows unconditionally.
 *
 * Version history:
 * - 1 → 2: Fix %-space vs fraction-space units mismatch between `priceChange`
 *   and `threshold`. Pre-v2 rows carry 100×-inflated `excess_return` values and
 *   mis-classified `outcome` assignments in the noise-band neighborhood. See
 *   openspec/changes/fix-win-rate-units-mismatch/.
 */
export const CLASSIFIER_VERSION = 2;

export interface ClassifyArgs {
  sentiment: Sentiment;
  priceChange: number | null;
  threshold: number;
}

export function classifyOutcome(args: ClassifyArgs): WinRateOutcome {
  const { sentiment, priceChange, threshold } = args;
  if (priceChange === null || sentiment === 0) return 'excluded';
  // Closed-interval noise band
  if (priceChange >= -threshold && priceChange <= threshold) return 'noise';
  if (sentiment > 0) {
    return priceChange > threshold ? 'win' : 'lose';
  }
  // sentiment < 0
  return priceChange < -threshold ? 'win' : 'lose';
}

/**
 * σ-normalized excess return for a single (sentiment, priceChange, threshold) tuple.
 * Returns null when the sample is excluded (neutral sentiment, null return, or
 * degenerate threshold). The sign is flipped for bearish sentiment so that a
 * "winning" sample always produces a positive number.
 */
export function computeExcessReturn(args: ClassifyArgs): number | null {
  const { sentiment, priceChange, threshold } = args;
  if (priceChange === null || sentiment === 0 || threshold === 0) return null;
  const sign = sentiment > 0 ? 1 : -1;
  return (sign * priceChange) / threshold;
}

export interface ThresholdRef {
  value: number;
  source: 'ticker' | 'index-fallback';
}

export interface ClassifiedSample {
  outcome: WinRateOutcome;
  threshold: ThresholdRef | null;
  /** σ-normalized excess return; null for excluded samples. */
  excessReturn: number | null;
  /**
   * Raw fractional price change over `period_days` (e.g., 0.05 = +5%), prior
   * to σ-normalization. Null when `priceChangeStatus !== 'value'`. Used for
   * Return aggregation so Return, Hit Rate, and SQR derive from the same
   * classified sample set.
   */
  priceChange?: number | null;
  /** Resolution state of the raw price change. Defaults to `'value'` when omitted (legacy rows). */
  priceChangeStatus?: PriceChangeStatus;
}

/**
 * Per-period performance metrics. Hit Rate is the primary UI metric;
 * Precision, Avg Excess Win/Lose, and SQR are secondary details exposed
 * through the performance metrics popover.
 */
export interface WinRateBucket {
  total: number; // win + lose + noise
  winCount: number;
  loseCount: number;
  noiseCount: number;
  excludedCount: number;
  wins: number;
  noise: number;
  loses: number;
  /** wins / (wins + noise + loses); null if !sufficientData. */
  hitRate: number | null;
  /** wins / (wins + loses); null if !sufficientData. */
  precision: number | null;
  /** Mean σ-normalized return over win samples; null if no wins. */
  avgExcessWin: number | null;
  /** Mean σ-normalized return over lose samples (negative); null if no loses. */
  avgExcessLose: number | null;
  /** Signal Quality Ratio over all non-excluded samples; null if undefined. */
  sqr: number | null;
  /**
   * Mean raw return = `mean(priceChange * sign(sentiment))` over samples with
   * outcome ∈ {win, lose, noise} and `priceChangeStatus === 'value'`. Null when
   * no samples qualify. The sign is already baked in at classification time
   * via `excessReturn` — see `computeReturn` for details.
   */
  avgReturn: number | null;
  /** Count of samples contributing to `avgReturn`. */
  returnSampleSize: number;
  /**
   * Count of non-excluded samples whose price window hasn't closed yet
   * (`priceChangeStatus === 'pending'`). Reported separately so the UI can
   * show "N 件待計算" without lying by counting them as noise.
   */
  pendingCount: number;
  /** True iff (winCount + loseCount) >= MIN_RESOLVED_POSTS_PER_PERIOD. */
  sufficientData: boolean;
  threshold: ThresholdRef | null; // representative (median) for the bucket
}

export interface WinRateStats {
  day5: WinRateBucket;
  day30: WinRateBucket;
  day90: WinRateBucket;
  day365: WinRateBucket;
  /**
   * Optional per-stock breakdown of the same four-period buckets. Populated
   * when the caller requests `includeBucketsByStock` on `computeWinRateStats`
   * and consumed by the KOL-detail per-stock ring. The nested values are
   * plain `WinRateStats` but, by convention, never carry their own
   * `bucketsByStock` (no recursion).
   */
  bucketsByStock?: Record<string, WinRateStats>;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
}

// ── Pure helpers for PeriodMetrics ──

export function computeHitRate(wins: number, noise: number, loses: number): number | null {
  const denom = wins + noise + loses;
  if (denom === 0) return null;
  return wins / denom;
}

export function computePrecision(wins: number, loses: number): number | null {
  const denom = wins + loses;
  if (denom === 0) return null;
  return wins / denom;
}

/**
 * Mean σ-normalized return over samples matching `outcome`. Returns null when
 * there are no matching non-null values.
 */
export function computeAvgExcess(
  samples: ClassifiedSample[],
  outcome: 'win' | 'lose'
): number | null {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    if (s.outcome === outcome && s.excessReturn !== null) {
      sum += s.excessReturn;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * Signal Quality Ratio: mean / stdev over all non-excluded classified samples,
 * using sample standard deviation (Bessel's correction). Returns null when the
 * ratio is undefined (n < 2 or stdev === 0).
 */
export function computeSqr(samples: ClassifiedSample[]): number | null {
  const values: number[] = [];
  for (const s of samples) {
    if (s.outcome === 'excluded') continue;
    if (s.excessReturn === null) continue;
    values.push(s.excessReturn);
  }
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let sq = 0;
  for (const v of values) {
    const d = v - mean;
    sq += d * d;
  }
  const stdev = Math.sqrt(sq / (n - 1));
  if (stdev === 0) return null;
  return mean / stdev;
}

/**
 * Mean raw return over non-excluded samples with a resolved `priceChange`.
 * `excessReturn` already carries `sign(sentiment) × priceChange / threshold`,
 * so reversing the σ normalization gives us `sign(sentiment) × priceChange`
 * directly without needing `sentiment` again. For samples that carry the
 * explicit `priceChange` field, we use that × direction sign recovered from
 * excessReturn's sign (ties broken to + when excessReturn is 0). Samples with
 * `priceChangeStatus === 'pending'` or `'no_data'` are excluded from the
 * mean; `'pending'` counts toward the returned `pendingCount` so the UI can
 * surface "N 件待計算".
 */
export function computeReturn(samples: ClassifiedSample[]): {
  avgReturn: number | null;
  sampleSize: number;
  pendingCount: number;
} {
  let sum = 0;
  let n = 0;
  let pending = 0;
  for (const s of samples) {
    if (s.outcome === 'excluded') continue;
    if (s.priceChangeStatus === 'pending') {
      pending++;
      continue;
    }
    if (s.priceChangeStatus === 'no_data') continue;
    // priceChangeStatus is 'value' or undefined (legacy row — treat as value)
    // Prefer the raw priceChange field. Reconstruct signed return from it via
    // `sign(excessReturn) × abs(priceChange)` — when the sample carries both,
    // `excessReturn = direction × priceChange / threshold` so the signs align
    // and the product already has the correct sign baked in.
    if (s.priceChange === null || s.priceChange === undefined) {
      // No raw priceChange persisted (legacy row predating the price_change
      // column). Reconstruct via `excessReturn × threshold`. The stored
      // `excess_return = direction × priceChange_percent / threshold_fraction`,
      // so `excessReturn × threshold.value` recovers `direction × priceChange`
      // directly in percent-space — which is the same space new rows persist
      // priceChange in. NO ×100 scaling needed; adding one would inflate the
      // contribution by 100×.
      if (s.excessReturn !== null && s.threshold) {
        sum += s.excessReturn * s.threshold.value;
        n++;
      }
      continue;
    }
    // `excessReturn` has sign(direction × priceChange); for win/lose it is
    // non-zero so its sign tells us direction. For noise it can be zero — in
    // that case use +|priceChange| (noise contributes a small magnitude and
    // the sign is not meaningful for "correctness" but still contributes to
    // mean return; we treat it as the signed fractional move as observed).
    const direction =
      s.excessReturn === null || s.excessReturn === 0 ? 1 : s.excessReturn > 0 ? 1 : -1;
    sum += direction * Math.abs(s.priceChange);
    n++;
  }
  return { avgReturn: n === 0 ? null : sum / n, sampleSize: n, pendingCount: pending };
}

export function aggregateBucket(samples: ClassifiedSample[]): WinRateBucket {
  let winCount = 0;
  let loseCount = 0;
  let noiseCount = 0;
  let excludedCount = 0;
  const thresholdValues: number[] = [];
  let anyFallback = false;
  let anySource = false;

  for (const s of samples) {
    switch (s.outcome) {
      case 'win':
        winCount++;
        break;
      case 'lose':
        loseCount++;
        break;
      case 'noise':
        noiseCount++;
        break;
      case 'excluded':
        excludedCount++;
        break;
    }
    if (s.threshold && s.outcome !== 'excluded') {
      thresholdValues.push(s.threshold.value);
      anySource = true;
      if (s.threshold.source === 'index-fallback') anyFallback = true;
    }
  }

  const sufficientData = winCount + loseCount >= MIN_RESOLVED_POSTS_PER_PERIOD;
  const precision = sufficientData ? computePrecision(winCount, loseCount) : null;
  const hitRate = sufficientData ? computeHitRate(winCount, noiseCount, loseCount) : null;
  const avgExcessWin = sufficientData ? computeAvgExcess(samples, 'win') : null;
  const avgExcessLose = sufficientData ? computeAvgExcess(samples, 'lose') : null;
  const sqr = sufficientData ? computeSqr(samples) : null;
  const returnStats = computeReturn(samples);

  const threshold: ThresholdRef | null = anySource
    ? { value: median(thresholdValues), source: anyFallback ? 'index-fallback' : 'ticker' }
    : null;

  return {
    total: winCount + loseCount + noiseCount,
    winCount,
    loseCount,
    noiseCount,
    excludedCount,
    wins: winCount,
    noise: noiseCount,
    loses: loseCount,
    hitRate,
    precision,
    avgExcessWin,
    avgExcessLose,
    sqr,
    avgReturn: returnStats.avgReturn,
    returnSampleSize: returnStats.sampleSize,
    pendingCount: returnStats.pendingCount,
    sufficientData,
    threshold,
  };
}

export function emptyBucket(): WinRateBucket {
  return {
    total: 0,
    winCount: 0,
    loseCount: 0,
    noiseCount: 0,
    excludedCount: 0,
    wins: 0,
    noise: 0,
    loses: 0,
    hitRate: null,
    precision: null,
    avgExcessWin: null,
    avgExcessLose: null,
    sqr: null,
    avgReturn: null,
    returnSampleSize: 0,
    pendingCount: 0,
    sufficientData: false,
    threshold: null,
  };
}

export function emptyStats(): WinRateStats {
  return {
    day5: emptyBucket(),
    day30: emptyBucket(),
    day90: emptyBucket(),
    day365: emptyBucket(),
  };
}

/**
 * Qualitative label for a Signal Quality Ratio value. Thresholds mirror the
 * Information-Ratio framing in `openspec/changes/kol-overall-performance-metrics`:
 *   > 1.0      → excellent
 *   0.5 – 1.0  → decent
 *   < 0.5      → unstable
 *   null       → none (insufficient data / undefined)
 */
export type SqrQualitativeKey = 'excellent' | 'decent' | 'unstable' | 'none';

export function getSqrQualitativeLabel(sqr: number | null): SqrQualitativeKey {
  if (sqr === null) return 'none';
  if (sqr > 1) return 'excellent';
  if (sqr >= 0.5) return 'decent';
  return 'unstable';
}

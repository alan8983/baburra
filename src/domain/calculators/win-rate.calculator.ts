/**
 * Win-rate classifier
 *
 * Pure functions that classify a single (sentiment, priceChange, threshold) tuple
 * into win/lose/noise/excluded, plus a bucket aggregator. Decoupled from I/O so the
 * service layer can fan out asynchronously to fetch volatility thresholds.
 *
 * Semantics (see openspec/changes/dynamic-volatility-threshold/spec):
 * - Bullish (sentiment > 0):  change > +threshold → win, < -threshold → lose, else noise.
 * - Bearish (sentiment < 0):  change < -threshold → win, > +threshold → lose, else noise.
 * - Neutral (sentiment === 0) or null change → excluded.
 * - Noise band is the closed interval [-threshold, +threshold].
 * - winRate = winCount / (winCount + loseCount); null if denom is 0. Noise excluded.
 */

import type { Sentiment } from '@/domain/models/post';

export type WinRateOutcome = 'win' | 'lose' | 'noise' | 'excluded';

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

export interface ThresholdRef {
  value: number;
  source: 'ticker' | 'index-fallback';
}

export interface ClassifiedSample {
  outcome: WinRateOutcome;
  threshold: ThresholdRef | null;
}

export interface WinRateBucket {
  total: number; // win + lose + noise
  winCount: number;
  loseCount: number;
  noiseCount: number;
  excludedCount: number;
  winRate: number | null;
  threshold: ThresholdRef | null; // representative (median) for the bucket
}

export interface WinRateStats {
  day5: WinRateBucket;
  day30: WinRateBucket;
  day90: WinRateBucket;
  day365: WinRateBucket;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
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

  const denom = winCount + loseCount;
  const winRate = denom === 0 ? null : winCount / denom;
  const threshold: ThresholdRef | null = anySource
    ? { value: median(thresholdValues), source: anyFallback ? 'index-fallback' : 'ticker' }
    : null;

  return {
    total: winCount + loseCount + noiseCount,
    winCount,
    loseCount,
    noiseCount,
    excludedCount,
    winRate,
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
    winRate: null,
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

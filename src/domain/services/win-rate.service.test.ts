import { describe, it, expect, beforeEach } from 'vitest';
import { computeWinRateStats, type PostForWinRate } from './win-rate.service';
import {
  __resetVolatilityCache,
  MIN_RESOLVED_POSTS_PER_PERIOD,
  type VolatilityProvider,
  type PriceSeriesPoint,
  type Market,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models/post';

function fakeProvider(
  constSigmaSeries: PriceSeriesPoint[],
  market: Market = 'US'
): VolatilityProvider {
  return {
    async getMarket() {
      return market;
    },
    async getSeries() {
      return constSigmaSeries;
    },
  };
}

// Build a series long enough that all four periods have sufficient samples and
// non-zero stdev.
function buildSeries(): PriceSeriesPoint[] {
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < 1200; i++) {
    p *= 1 + (((i * 17) % 11) - 5) / 1000;
    closes.push(p);
  }
  const start = new Date('2020-01-01');
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

const fullPC = (val: number): PriceChangeByPeriod => ({
  day5: val,
  day30: val,
  day90: val,
  day365: val,
  day5Status: 'value',
  day30Status: 'value',
  day90Status: 'value',
  day365Status: 'value',
});

// Build N posts each with `val` priceChange and `sentiment`, mapping to one stock.
function buildPosts(n: number, sentiment: Sentiment, val: number): PostForWinRate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    sentiment,
    postedAt: new Date('2024-12-31'),
    tickerByStockId: { s1: 'AAPL' },
    priceChanges: { s1: fullPC(val) },
  }));
}

describe('computeWinRateStats', () => {
  beforeEach(() => __resetVolatilityCache());

  it('returns empty stats for empty posts', async () => {
    const stats = await computeWinRateStats({ posts: [], provider: fakeProvider([]) });
    expect(stats.day30.total).toBe(0);
    expect(stats.day30.hitRate).toBeNull();
    expect(stats.day30.precision).toBeNull();
    expect(stats.day30.sufficientData).toBe(false);
  });

  it('single winning post stays below the sample floor', async () => {
    const stats = await computeWinRateStats({
      posts: buildPosts(1, 2, 0.5),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.winCount).toBe(1);
    expect(stats.day30.sufficientData).toBe(false);
    expect(stats.day30.hitRate).toBeNull();
    expect(stats.day30.precision).toBeNull();
  });

  it('meets the floor with >= MIN resolved wins', async () => {
    const stats = await computeWinRateStats({
      posts: buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 0.5),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.sufficientData).toBe(true);
    expect(stats.day30.winCount).toBe(MIN_RESOLVED_POSTS_PER_PERIOD);
    expect(stats.day30.precision).toBe(1);
    expect(stats.day30.hitRate).toBe(1);
    expect(stats.day30.avgExcessWin).not.toBeNull();
  });

  it('per-period independence: 5d sufficient, 365d insufficient', async () => {
    // Build 12 posts where day5 has a value but day365 is null → day5 gets
    // classified samples, day365 accumulates `excluded` only.
    const posts: PostForWinRate[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      sentiment: 2,
      postedAt: new Date('2024-12-31'),
      tickerByStockId: { s1: 'AAPL' },
      priceChanges: {
        s1: {
          day5: 0.5,
          day30: 0.5,
          day90: 0.5,
          day365: null,
          day5Status: 'value',
          day30Status: 'value',
          day90Status: 'value',
          day365Status: 'pending',
        },
      },
    }));
    const stats = await computeWinRateStats({
      posts,
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day5.sufficientData).toBe(true);
    expect(stats.day5.hitRate).toBe(1);
    expect(stats.day365.sufficientData).toBe(false);
    expect(stats.day365.winCount).toBe(0);
    expect(stats.day365.excludedCount).toBe(12);
    expect(stats.day365.hitRate).toBeNull();
  });

  it('noise-dominated KOL: counts visible but derived metrics null', async () => {
    // A tiny priceChange that will fall inside the ±1σ band for every period.
    const stats = await computeWinRateStats({
      posts: buildPosts(20, 2, 0.0001),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.noiseCount).toBeGreaterThan(0);
    expect(stats.day30.winCount + stats.day30.loseCount).toBeLessThan(
      MIN_RESOLVED_POSTS_PER_PERIOD
    );
    expect(stats.day30.sufficientData).toBe(false);
    expect(stats.day30.hitRate).toBeNull();
    expect(stats.day30.precision).toBeNull();
  });

  it('classifies neutral/null as excluded across all periods', async () => {
    const stats = await computeWinRateStats({
      posts: buildPosts(1, 0, 0.5),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.excludedCount).toBe(1);
    expect(stats.day30.winCount).toBe(0);
  });
});

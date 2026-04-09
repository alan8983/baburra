import { describe, it, expect, beforeEach } from 'vitest';
import { computeWinRateStats, type PostForWinRate } from './win-rate.service';
import {
  __resetVolatilityCache,
  type VolatilityProvider,
  type PriceSeriesPoint,
  type Market,
} from '@/domain/calculators';
import type { PriceChangeByPeriod } from '@/domain/models/post';

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

describe('computeWinRateStats', () => {
  beforeEach(() => __resetVolatilityCache());

  it('returns empty stats for empty posts', async () => {
    const stats = await computeWinRateStats({ posts: [], provider: fakeProvider([]) });
    expect(stats.day30.total).toBe(0);
    expect(stats.day30.winRate).toBeNull();
  });

  it('classifies a clearly winning bullish post as win', async () => {
    const posts: PostForWinRate[] = [
      {
        id: 'p1',
        sentiment: 2,
        postedAt: new Date('2024-12-31'),
        tickerByStockId: { s1: 'AAPL' },
        priceChanges: { s1: fullPC(0.5) }, // +50% — way above any reasonable σ
      },
    ];
    const stats = await computeWinRateStats({
      posts,
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.winCount).toBe(1);
    expect(stats.day30.winRate).toBe(1);
  });

  it('classifies neutral/null as excluded across all periods', async () => {
    const posts: PostForWinRate[] = [
      {
        id: 'p1',
        sentiment: 0,
        postedAt: new Date('2024-12-31'),
        tickerByStockId: { s1: 'AAPL' },
        priceChanges: { s1: fullPC(0.5) },
      },
    ];
    const stats = await computeWinRateStats({
      posts,
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.excludedCount).toBe(1);
    expect(stats.day30.winCount).toBe(0);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeWinRateStats,
  type PostForWinRate,
  type WinRateSampleRepo,
} from './win-rate.service';
import {
  __resetVolatilityCache,
  CLASSIFIER_VERSION,
  MIN_RESOLVED_POSTS_PER_PERIOD,
  type VolatilityProvider,
  type PriceSeriesPoint,
  type Market,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models/post';
import type { WinRateSampleRow } from '@/infrastructure/repositories/win-rate-sample.repository';

function fakeProvider(
  constSigmaSeries: PriceSeriesPoint[],
  market: Market = 'US'
): VolatilityProvider & { calls: { getSeries: number; getMarket: number } } {
  const calls = { getSeries: 0, getMarket: 0 };
  return {
    calls,
    async getMarket() {
      calls.getMarket++;
      return market;
    },
    async getSeries() {
      calls.getSeries++;
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

/** In-memory sample repo — supports cache-hit and mixed-path tests. */
function makeFakeRepo(seed: WinRateSampleRow[] = []): WinRateSampleRepo & {
  loaded: WinRateSampleRow[];
  upserts: WinRateSampleRow[];
  calls: { load: number; upsert: number };
} {
  const loaded = [...seed];
  const upserts: WinRateSampleRow[] = [];
  const calls = { load: 0, upsert: 0 };
  return {
    loaded,
    upserts,
    calls,
    async loadSamplesByPostIds(postIds, classifierVersion) {
      calls.load++;
      const map = new Map<string, WinRateSampleRow>();
      for (const row of loaded) {
        if (row.classifierVersion !== classifierVersion) continue;
        if (!postIds.includes(row.postId)) continue;
        map.set(`${row.postId}:${row.stockId}:${row.periodDays}`, row);
      }
      return map;
    },
    async upsertSamples(rows) {
      calls.upsert++;
      upserts.push(...rows);
    },
  };
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

  // ─── Persistent-sample pipeline ─────────────────────────────────────────────

  it('fully cached samples: provider is never called and no upserts happen', async () => {
    const provider = fakeProvider(buildSeries());
    const posts = buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 0.5);
    // Seed one 'win' row per (post, stock, period).
    const seed: WinRateSampleRow[] = [];
    for (const p of posts) {
      for (const period of [5, 30, 90, 365] as const) {
        seed.push({
          postId: p.id,
          stockId: 's1',
          periodDays: period,
          outcome: 'win',
          excessReturn: 2,
          thresholdValue: 0.1,
          thresholdSource: 'ticker',
          classifierVersion: CLASSIFIER_VERSION,
        });
      }
    }
    const repo = makeFakeRepo(seed);
    const stats = await computeWinRateStats({ posts, provider, sampleRepo: repo });

    expect(provider.calls.getSeries).toBe(0);
    expect(provider.calls.getMarket).toBe(0);
    expect(repo.calls.load).toBe(1);
    expect(repo.calls.upsert).toBe(0);
    expect(stats.day30.winCount).toBe(MIN_RESOLVED_POSTS_PER_PERIOD);
    expect(stats.day30.sufficientData).toBe(true);
  });

  it('mixed path: provider called only for uncached tuples; fresh rows upserted', async () => {
    const provider = fakeProvider(buildSeries());
    const posts = buildPosts(2, 2, 0.5);
    // Seed only the first post's samples (all four periods), leave the second uncached.
    const seed: WinRateSampleRow[] = [];
    for (const period of [5, 30, 90, 365] as const) {
      seed.push({
        postId: 'p0',
        stockId: 's1',
        periodDays: period,
        outcome: 'win',
        excessReturn: 2,
        thresholdValue: 0.05,
        thresholdSource: 'ticker',
        classifierVersion: CLASSIFIER_VERSION,
      });
    }
    const repo = makeFakeRepo(seed);

    const stats = await computeWinRateStats({ posts, provider, sampleRepo: repo });

    // Four periods × one uncached post = 4 threshold computes.
    expect(provider.calls.getSeries).toBeGreaterThan(0);
    expect(repo.calls.upsert).toBe(1);
    expect(repo.upserts).toHaveLength(4);
    for (const row of repo.upserts) {
      expect(row.postId).toBe('p1');
      expect(row.classifierVersion).toBe(CLASSIFIER_VERSION);
    }
    expect(stats.day30.winCount).toBe(2);
  });

  it('stale classifier_version rows are ignored and re-classified', async () => {
    const provider = fakeProvider(buildSeries());
    const posts = buildPosts(1, 2, 0.5);
    // Seed a row at an older version — should be filtered out by the repo.
    const repo = makeFakeRepo([
      {
        postId: 'p0',
        stockId: 's1',
        periodDays: 30,
        outcome: 'lose',
        excessReturn: -2,
        thresholdValue: 0.05,
        thresholdSource: 'ticker',
        classifierVersion: CLASSIFIER_VERSION - 1,
      },
    ]);

    const stats = await computeWinRateStats({ posts, provider, sampleRepo: repo });

    expect(provider.calls.getSeries).toBeGreaterThan(0);
    // Fresh classification wins over the stale seed.
    expect(stats.day30.winCount).toBe(1);
    expect(stats.day30.loseCount).toBe(0);
    expect(repo.upserts.every((r) => r.classifierVersion === CLASSIFIER_VERSION)).toBe(true);
  });

  it('includeBucketsByStock returns a per-stock breakdown consistent with globals', async () => {
    const provider = fakeProvider(buildSeries());
    const posts: PostForWinRate[] = Array.from(
      { length: MIN_RESOLVED_POSTS_PER_PERIOD },
      (_, i) => ({
        id: `p${i}`,
        sentiment: 2,
        postedAt: new Date('2024-12-31'),
        tickerByStockId: { sA: 'AAPL', sB: 'MSFT' },
        priceChanges: { sA: fullPC(0.5), sB: fullPC(-0.5) },
      })
    );

    const stats = await computeWinRateStats({
      posts,
      provider,
      includeBucketsByStock: true,
    });

    expect(stats.bucketsByStock).toBeDefined();
    const byStock = stats.bucketsByStock!;
    expect(Object.keys(byStock).sort()).toEqual(['sA', 'sB']);
    // Global winCount should equal sum of per-stock winCounts.
    const perStockWins = byStock.sA.day30.winCount + byStock.sB.day30.winCount;
    expect(perStockWins).toBe(stats.day30.winCount);
  });

  it('upsert errors are swallowed so aggregation still returns', async () => {
    const provider = fakeProvider(buildSeries());
    const posts = buildPosts(1, 2, 0.5);
    const repo: WinRateSampleRepo = {
      async loadSamplesByPostIds() {
        return new Map();
      },
      async upsertSamples() {
        throw new Error('db dead');
      },
    };
    // Silence the warn.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stats = await computeWinRateStats({ posts, provider, sampleRepo: repo });
    expect(stats.day30.winCount).toBe(1);
    warn.mockRestore();
  });
});

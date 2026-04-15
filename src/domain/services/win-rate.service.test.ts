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
  type PeriodDays,
  type VolatilityProvider,
  type VolatilityResult,
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

/**
 * Provider that returns a fixed σ per period via the optional L2 cache hook.
 * Lets tests pin an exact threshold and assert precise σ-normalized output
 * without having to construct a price series whose realized vol matches.
 */
function fixedThresholdProvider(
  thresholdByPeriod: Record<number, number>,
  market: Market = 'US'
): VolatilityProvider {
  return {
    async getMarket() {
      return market;
    },
    async getSeries() {
      return [];
    },
    async getCachedThreshold(ticker, periodDays, asOfDate) {
      const value = thresholdByPeriod[periodDays];
      if (value === undefined) return null;
      const result: VolatilityResult = {
        value,
        source: 'ticker',
        sampleSize: 252,
        asOfDate,
        ticker,
        periodDays: periodDays as PeriodDays,
      };
      return result;
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
      // priceChange = 15 (%-space, i.e., a 15% move) → 0.15 in fraction-space,
      // clearly above any threshold derivable from `buildSeries()`.
      posts: buildPosts(1, 2, 15),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.winCount).toBe(1);
    expect(stats.day30.sufficientData).toBe(false);
    expect(stats.day30.hitRate).toBeNull();
    expect(stats.day30.precision).toBeNull();
  });

  it('meets the floor with >= MIN resolved wins', async () => {
    const stats = await computeWinRateStats({
      posts: buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 15),
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
          // 15% %-space moves → 0.15 fraction-space, comfortably above any
          // buildSeries-derived threshold.
          day5: 15,
          day30: 15,
          day90: 15,
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
      posts: buildPosts(1, 0, 15),
      provider: fakeProvider(buildSeries()),
    });
    expect(stats.day30.excludedCount).toBe(1);
    expect(stats.day30.winCount).toBe(0);
  });

  // ─── Persistent-sample pipeline ─────────────────────────────────────────────

  it('fully cached samples: provider is never called and no upserts happen', async () => {
    const provider = fakeProvider(buildSeries());
    const posts = buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 15);
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
          priceChange: 0.2,
          priceChangeStatus: 'value',
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
    const posts = buildPosts(2, 2, 15);
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
        priceChange: 0.1,
        priceChangeStatus: 'value',
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
    const posts = buildPosts(1, 2, 15);
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
        priceChange: -0.1,
        priceChangeStatus: 'value',
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
        priceChanges: { sA: fullPC(15), sB: fullPC(-15) },
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
    const posts = buildPosts(1, 2, 15);
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

  // ─── Units-mismatch regression guards ───────────────────────────────────────
  // Guards the %-space (priceChange) vs fraction-space (threshold) normalization
  // in computeWinRateStats. Prior to the fix, the service fed %-space priceChange
  // directly into the classifier, producing ±60σ excessReturn values and
  // effectively disabling the noise band. See
  // openspec/changes/fix-win-rate-units-mismatch/specs/win-rate-classification/spec.md.

  it('normalizes %-space priceChange against fraction-space threshold', async () => {
    // priceChange = 8.0 (%-space, i.e., 8% realized move)
    // threshold   = 0.046 (fraction-space, i.e., 4.6% σ — from the screenshot)
    // Fraction-space priceChange = 0.08 → excessReturn = 0.08 / 0.046 ≈ 1.74σ.
    // Pre-fix this was 8.0 / 0.046 ≈ 173.9σ — two orders of magnitude too large.
    const provider = fixedThresholdProvider({ 5: 0.02, 30: 0.046, 90: 0.08, 365: 0.15 });
    const posts = buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 8.0);

    const stats = await computeWinRateStats({ posts, provider });

    expect(stats.day30.winCount).toBe(MIN_RESOLVED_POSTS_PER_PERIOD);
    expect(stats.day30.avgExcessWin).not.toBeNull();
    const sigma = stats.day30.avgExcessWin!;
    expect(sigma).toBeGreaterThan(0);
    expect(sigma).toBeLessThan(10); // pre-fix value was ~174 — this bound catches regressions
    expect(sigma).toBeCloseTo(0.08 / 0.046, 2);
  });

  it('SQR is scale-invariant: unaffected by the fix (ratio cancels)', async () => {
    // Mix 8% wins with 10% wins against a 4.6% threshold so stdev > 0.
    // SQR = mean / stdev: any uniform multiplicative scaling cancels, so SQR is
    // identical before and after the units fix.
    const provider = fixedThresholdProvider({ 5: 0.02, 30: 0.046, 90: 0.08, 365: 0.15 });
    const posts: PostForWinRate[] = Array.from(
      { length: MIN_RESOLVED_POSTS_PER_PERIOD },
      (_, i) => ({
        id: `p${i}`,
        sentiment: 2,
        postedAt: new Date('2024-12-31'),
        tickerByStockId: { s1: 'AAPL' },
        priceChanges: { s1: fullPC(i % 2 === 0 ? 8.0 : 10.0) },
      })
    );

    const stats = await computeWinRateStats({ posts, provider });

    expect(stats.day30.sqr).not.toBeNull();
    // SQR for {8, 10}/100/0.046 = {1.739, 2.174}: mean ≈ 1.957, stdev ≈ 0.307
    // → SQR ≈ 6.37. Same ratio you'd get if the values were {174, 217} (pre-fix).
    const sqr = stats.day30.sqr!;
    expect(sqr).toBeGreaterThan(0);
    expect(sqr).toBeLessThan(100); // sanity bound — real signal ratios are small single digits
  });

  it('noise band catches sub-threshold moves (2.0% vs 4.6% σ)', async () => {
    // priceChange = 2.0% → 0.02 fraction-space; threshold 0.046 → 0.02 ∈ [-0.046, +0.046]
    // → outcome must be noise. Pre-fix this was mis-classified as a win.
    const provider = fixedThresholdProvider({ 5: 0.02, 30: 0.046, 90: 0.08, 365: 0.15 });
    const posts = buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 2.0);

    const stats = await computeWinRateStats({ posts, provider });

    expect(stats.day30.noiseCount).toBe(MIN_RESOLVED_POSTS_PER_PERIOD);
    expect(stats.day30.winCount).toBe(0);
    expect(stats.day30.loseCount).toBe(0);
  });

  it('noise band boundary is inclusive (priceChange exactly at threshold)', async () => {
    // priceChange = 4.6% → 0.046 fraction-space; threshold 0.046 → closed
    // interval check should put this sample in the noise bucket, not win.
    const provider = fixedThresholdProvider({ 5: 0.02, 30: 0.046, 90: 0.08, 365: 0.15 });
    const posts = buildPosts(MIN_RESOLVED_POSTS_PER_PERIOD, 2, 4.6);

    const stats = await computeWinRateStats({ posts, provider });

    expect(stats.day30.noiseCount).toBe(MIN_RESOLVED_POSTS_PER_PERIOD);
    expect(stats.day30.winCount).toBe(0);
  });

  it('stored priceChange on persisted rows stays in %-space', async () => {
    // The classifier normalizes to fraction-space internally, but the row
    // written back to `post_win_rate_samples` must keep the raw %-space value
    // so `computeReturn` → `avgReturn` percentage display stays correct.
    const provider = fixedThresholdProvider({ 5: 0.02, 30: 0.046, 90: 0.08, 365: 0.15 });
    const posts = buildPosts(1, 2, 8.0);
    const repo = makeFakeRepo();

    await computeWinRateStats({ posts, provider, sampleRepo: repo });

    const day30Row = repo.upserts.find((r) => r.periodDays === 30);
    expect(day30Row).toBeDefined();
    expect(day30Row!.priceChange).toBe(8.0); // %-space, not 0.08 fraction-space
    expect(day30Row!.classifierVersion).toBe(CLASSIFIER_VERSION);
  });
});

// GET /api/kols/[id]/win-rate
//
// Read-through against `kol_scorecard_cache`. On a warm row returns the
// aggregated blob with `status: 'ready'`. On a miss (no row, stale flag,
// TTL-expired, or mismatched classifier version) returns `status: 'computing'`
// and enqueues a background recompute. Clients poll until ready.
//
// When the `USE_SCORECARD_CACHE` feature flag is off, falls back to the
// pre-change inline-compute path (retained temporarily during rollout).

import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/error';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import { CLASSIFIER_VERSION, calculatePriceChanges, emptyStats } from '@/domain/calculators';
import { computeWinRateStats, type PostForWinRate } from '@/domain/services/win-rate.service';
import { StockPriceVolatilityProvider } from '@/infrastructure/providers/stock-price-volatility.provider';
import { PersistentVolatilityProvider } from '@/infrastructure/providers/persistent-volatility.provider';
import {
  loadSamplesByPostIds,
  upsertSamples,
} from '@/infrastructure/repositories/win-rate-sample.repository';
import { getKolScorecard } from '@/infrastructure/repositories/scorecard-cache.repository';
import { enqueueKolScorecardCompute } from '@/domain/services/scorecard.service';
import { isScorecardCacheEnabled, isWinRateSampleCacheEnabled } from '@/lib/feature-flags';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // ── Fast path: read from Layer 3 aggregate cache ──
    if (isScorecardCacheEnabled()) {
      const cached = await getKolScorecard(id, CLASSIFIER_VERSION);
      if (cached) {
        return NextResponse.json({
          status: 'ready',
          computedAt: cached.computedAt,
          day5: cached.day5,
          day30: cached.day30,
          day90: cached.day90,
          day365: cached.day365,
          bucketsByStock: cached.bucketsByStock,
        });
      }
      // Miss: trigger async compute; client polls.
      enqueueKolScorecardCompute(id);
      return NextResponse.json({ status: 'computing', computedAt: null });
    }

    // ── Legacy path (flag off) ── identical to pre-change behavior.
    return legacyCompute(id);
  } catch (error) {
    return internalError(error, 'Failed to fetch scorecard');
  }
}

/**
 * Pre-change inline-compute path, retained temporarily so we can flip the
 * feature flag on/off during rollout. Once 10.3 runs this block is deleted.
 */
async function legacyCompute(kolId: string): Promise<NextResponse> {
  const { data: posts } = await listPosts({ kolId, limit: 1000 });
  if (posts.length === 0) return NextResponse.json(emptyStats());

  const useCache = isWinRateSampleCacheEnabled();
  const tickerByStockId = new Map<string, string>();
  for (const post of posts) {
    for (const stock of post.stocks) tickerByStockId.set(stock.id, stock.ticker);
  }

  const cachedSamples = useCache
    ? await loadSamplesByPostIds(
        posts.map((p) => p.id),
        CLASSIFIER_VERSION
      )
    : null;

  const missingStockIds = new Set<string>();
  if (cachedSamples) {
    for (const post of posts) {
      for (const stock of post.stocks) {
        let missing = false;
        for (const period of [5, 30, 90, 365] as const) {
          if (!cachedSamples.has(`${post.id}:${stock.id}:${period}`)) {
            missing = true;
            break;
          }
        }
        if (missing) missingStockIds.add(stock.id);
      }
    }
  } else {
    for (const stockId of tickerByStockId.keys()) missingStockIds.add(stockId);
  }

  const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> = {};
  if (missingStockIds.size > 0) {
    const earliestDate = posts.reduce((min, post) => {
      const d = new Date(post.postedAt);
      return d < min ? d : min;
    }, new Date());
    const startDate = new Date(earliestDate);
    startDate.setDate(startDate.getDate() - 7);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    const entries = Array.from(missingStockIds).map(
      (stockId) => [stockId, tickerByStockId.get(stockId)!] as const
    );
    const results = await Promise.allSettled(
      entries.map(([, ticker]) =>
        withTimeout(getStockPrices(ticker, { startDate: startDateStr }), 5000)
      )
    );
    for (let i = 0; i < entries.length; i++) {
      const [stockId] = entries[i];
      const result = results[i];
      candlesByStock[stockId] = result.status === 'fulfilled' ? result.value.candles : [];
    }
  }

  const postsForWinRate: PostForWinRate[] = posts.map((post) => {
    const priceChanges: Record<string, PriceChangeByPeriod> = {};
    const tickerMap: Record<string, string> = {};
    for (const stock of post.stocks) {
      tickerMap[stock.id] = stock.ticker;
      const candles = candlesByStock[stock.id];
      priceChanges[stock.id] =
        candles && candles.length > 0
          ? calculatePriceChanges(candles, new Date(post.postedAt))
          : {
              day5: null,
              day30: null,
              day90: null,
              day365: null,
              day5Status: 'no_data',
              day30Status: 'no_data',
              day90Status: 'no_data',
              day365Status: 'no_data',
            };
    }
    const stockSentiments: Record<string, Sentiment> = {};
    for (const s of post.stocks) if (s.sentiment !== null) stockSentiments[s.id] = s.sentiment;
    return {
      id: post.id,
      sentiment: post.sentiment,
      postedAt: new Date(post.postedAt),
      ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
      tickerByStockId: tickerMap,
      priceChanges,
    };
  });

  const provider = useCache
    ? new PersistentVolatilityProvider()
    : new StockPriceVolatilityProvider();
  const sampleRepo = useCache ? { loadSamplesByPostIds, upsertSamples } : undefined;

  const stats = await computeWinRateStats({
    posts: postsForWinRate,
    provider,
    sampleRepo,
    includeBucketsByStock: true,
  });

  return NextResponse.json(stats);
}

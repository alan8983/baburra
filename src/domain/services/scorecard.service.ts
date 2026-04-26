/**
 * Scorecard service
 *
 * The single writer for `kol_scorecard_cache` and `stock_scorecard_cache`.
 * Lifts the aggregation code that previously lived inline in the win-rate
 * API route into a cohesive service callable from three sites:
 *
 *   1. API read-through: on miss, `fireAndForgetCompute*()` enqueues an async
 *      compute so the UI's next poll resolves to a warm row.
 *   2. Scraper ingestion: after post insert, `invalidateScorecardsForPost`
 *      flips `stale = TRUE`, then enqueues a recompute so the next visitor
 *      doesn't eat a fresh cold-start.
 *   3. Tests / scripts: direct `computeKolScorecard(kolId)` call.
 *
 * An in-process `Set<string>` deduplicates concurrent computes for the same
 * key — if 10 users hit a cold KOL within the same compute window, only one
 * Tiingo round-trip fires.
 */

import { CLASSIFIER_VERSION, calculatePriceChanges } from '@/domain/calculators';
import { computeWinRateStats, type PostForWinRate } from './win-rate.service';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { PersistentVolatilityProvider } from '@/infrastructure/providers/persistent-volatility.provider';
import {
  loadSamplesByPostIds,
  upsertSamples,
} from '@/infrastructure/repositories/win-rate-sample.repository';
import {
  upsertKolScorecard,
  upsertStockScorecard,
  type KolScorecardBlob,
  type StockScorecardBlob,
  type ScorecardBucket,
} from '@/infrastructure/repositories/scorecard-cache.repository';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';

// On Vercel: waitUntil holds the sandbox open until the promise settles,
// up to the function's remaining time budget (60 s on Pro, 10 s on Hobby).
// Without it, Node is frozen the moment the HTTP response is written —
// background computes never land and cold-KOL polls loop forever.
// In dev / non-Vercel runtimes the require throws; we fall back to `void`.
let _waitUntil: ((p: Promise<unknown>) => void) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _waitUntil = require('@vercel/functions').waitUntil;
} catch {
  /* running outside Vercel — no-op fallback is fine */
}

// Per R12: must be generous enough that getStockPrices's own internal
// stale-cache fallback (stock-price.repository.ts step 5) finishes before
// this outer race rejects. The previous 5_000 caused the race to drop
// real candles from the stale cache for slow Tiingo calls.
const COMPUTE_TIMEOUT_MS = 30_000;

// In-process dedupe locks — per-key promise reuse.
const kolComputing = new Map<string, Promise<void>>();
const stockComputing = new Map<string, Promise<void>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Fetch candles for a set of stocks, returning an id→candles map with a per-stock timeout. */
async function fetchCandlesForStocks(
  tickerByStockId: Map<string, string>,
  earliestDate: Date
): Promise<Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']>> {
  const startDate = new Date(earliestDate);
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const entries = Array.from(tickerByStockId.entries());
  const results = await Promise.allSettled(
    entries.map(([, ticker]) =>
      withTimeout(getStockPrices(ticker, { startDate: startDateStr }), COMPUTE_TIMEOUT_MS)
    )
  );

  const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> = {};
  for (let i = 0; i < entries.length; i++) {
    const [stockId] = entries[i];
    const result = results[i];
    candlesByStock[stockId] = result.status === 'fulfilled' ? result.value.candles : [];
  }
  return candlesByStock;
}

/** Build the postsForWinRate input — factored out so stock compute can reuse it. */
function buildPostsForWinRate(
  posts: Awaited<ReturnType<typeof listPosts>>['data'],
  candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']>
): PostForWinRate[] {
  return posts.map((post) => {
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
    for (const s of post.stocks) {
      if (s.sentiment !== null) stockSentiments[s.id] = s.sentiment;
    }
    return {
      id: post.id,
      sentiment: post.sentiment,
      postedAt: new Date(post.postedAt),
      ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
      tickerByStockId: tickerMap,
      priceChanges,
    };
  });
}

// ─── KOL scorecard ───────────────────────────────────────────────────────────

/**
 * Compute + persist the scorecard blob for a KOL. Reads posts, fills in
 * missing classification samples, aggregates buckets + per-stock breakdowns,
 * upserts into `kol_scorecard_cache`. Dedupes concurrent calls per kolId.
 */
export async function computeKolScorecard(kolId: string): Promise<void> {
  const inflight = kolComputing.get(kolId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const { data: posts } = await listPosts({ kolId, limit: 1000 });
      if (posts.length === 0) return;

      const tickerByStockId = new Map<string, string>();
      for (const post of posts) {
        for (const stock of post.stocks) {
          tickerByStockId.set(stock.id, stock.ticker);
        }
      }

      const earliestDate = posts.reduce((min, post) => {
        const d = new Date(post.postedAt);
        return d < min ? d : min;
      }, new Date());

      const candlesByStock =
        tickerByStockId.size > 0 ? await fetchCandlesForStocks(tickerByStockId, earliestDate) : {};

      const postsForWinRate = buildPostsForWinRate(posts, candlesByStock);

      const stats = await computeWinRateStats({
        posts: postsForWinRate,
        provider: new PersistentVolatilityProvider(),
        sampleRepo: { loadSamplesByPostIds, upsertSamples },
        includeBucketsByStock: true,
      });

      const lastPostAt = posts.reduce<string | null>((latest, post) => {
        const t = new Date(post.postedAt).toISOString();
        return latest === null || t > latest ? t : latest;
      }, null);

      const statsWithBreakdown = stats as typeof stats & {
        bucketsByStock?: Record<
          string,
          {
            day5: ScorecardBucket;
            day30: ScorecardBucket;
            day90: ScorecardBucket;
            day365: ScorecardBucket;
          }
        >;
      };

      const blob: KolScorecardBlob = {
        day5: stats.day5,
        day30: stats.day30,
        day90: stats.day90,
        day365: stats.day365,
        bucketsByStock: statsWithBreakdown.bucketsByStock ?? {},
        postCount: posts.length,
        lastPostAt,
      };

      await upsertKolScorecard(kolId, CLASSIFIER_VERSION, blob);
    } catch (err) {
      console.warn(
        `[scorecard.service] computeKolScorecard(${kolId}) failed:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      kolComputing.delete(kolId);
    }
  })();

  kolComputing.set(kolId, task);
  return task;
}

/**
 * Fire-and-forget variant used from the read-through API path.
 * Uses waitUntil() on Vercel so the sandbox stays alive past the response
 * write; falls back to void for dev / non-Vercel runtimes where freezing
 * is not an issue.
 */
export function enqueueKolScorecardCompute(kolId: string): void {
  if (_waitUntil) {
    _waitUntil(computeKolScorecard(kolId));
  } else {
    void computeKolScorecard(kolId);
  }
}

// ─── Stock scorecard ─────────────────────────────────────────────────────────

/**
 * Compute + persist the scorecard blob for a Stock. Aggregates samples from
 * every KOL that posted about the stock.
 */
export async function computeStockScorecard(stockId: string): Promise<void> {
  const inflight = stockComputing.get(stockId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      // Resolve ticker → then listPosts filters by stock_ticker. We keep the
      // 1000-post cap consistent with KOL compute; a single stock across
      // every KOL is unlikely to exceed this in practice.
      const supabase = createAdminClient();
      const { data: stock } = await supabase
        .from('stocks')
        .select('ticker')
        .eq('id', stockId)
        .maybeSingle();
      if (!stock?.ticker) return;

      const { data: relevant } = await listPosts({ stockTicker: stock.ticker, limit: 1000 });
      if (relevant.length === 0) return;

      const tickerByStockId = new Map<string, string>();
      for (const post of relevant) {
        for (const stock of post.stocks) {
          tickerByStockId.set(stock.id, stock.ticker);
        }
      }

      const earliestDate = relevant.reduce((min, post) => {
        const d = new Date(post.postedAt);
        return d < min ? d : min;
      }, new Date());

      const candlesByStock = await fetchCandlesForStocks(tickerByStockId, earliestDate);
      const postsForWinRate = buildPostsForWinRate(relevant, candlesByStock);

      // Compute per-KOL stats by grouping posts by kolId. The global
      // aggregation still runs, then we re-group per KOL.
      const statsAll = await computeWinRateStats({
        posts: postsForWinRate,
        provider: new PersistentVolatilityProvider(),
        sampleRepo: { loadSamplesByPostIds, upsertSamples },
        includeBucketsByStock: false,
      });

      // Per-KOL breakdown: partition posts by kolId, run per subset.
      const postsByKol = new Map<string, PostForWinRate[]>();
      for (let i = 0; i < relevant.length; i++) {
        const kolId = relevant[i].kolId;
        const list = postsByKol.get(kolId) ?? [];
        list.push(postsForWinRate[i]);
        postsByKol.set(kolId, list);
      }
      const bucketsByKol: StockScorecardBlob['bucketsByKol'] = {};
      for (const [kolId, subset] of postsByKol.entries()) {
        const subsetStats = await computeWinRateStats({
          posts: subset,
          provider: new PersistentVolatilityProvider(),
          // Samples already persisted above; skip double-fetch here.
          sampleRepo: { loadSamplesByPostIds, upsertSamples },
          includeBucketsByStock: false,
        });
        bucketsByKol[kolId] = {
          day5: subsetStats.day5,
          day30: subsetStats.day30,
          day90: subsetStats.day90,
          day365: subsetStats.day365,
        };
      }

      const lastPostAt = relevant.reduce<string | null>((latest, post) => {
        const t = new Date(post.postedAt).toISOString();
        return latest === null || t > latest ? t : latest;
      }, null);

      const blob: StockScorecardBlob = {
        day5: statsAll.day5,
        day30: statsAll.day30,
        day90: statsAll.day90,
        day365: statsAll.day365,
        bucketsByKol,
        postCount: relevant.length,
        lastPostAt,
      };

      await upsertStockScorecard(stockId, CLASSIFIER_VERSION, blob);
    } catch (err) {
      console.warn(
        `[scorecard.service] computeStockScorecard(${stockId}) failed:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      stockComputing.delete(stockId);
    }
  })();

  stockComputing.set(stockId, task);
  return task;
}

/**
 * Fire-and-forget variant for the stock scorecard read-through path.
 * Same waitUntil() pattern as enqueueKolScorecardCompute — Vercel sandbox
 * is frozen on response write; without this, stock recomputes never land.
 */
export function enqueueStockScorecardCompute(stockId: string): void {
  if (_waitUntil) {
    _waitUntil(computeStockScorecard(stockId));
  } else {
    void computeStockScorecard(stockId);
  }
}

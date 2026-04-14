#!/usr/bin/env tsx
/**
 * Backfill Win-Rate Samples Script
 *
 * Walks every post (or posts for a specific KOL) in batches and runs the
 * persistent win-rate pipeline so `post_win_rate_samples` and
 * `volatility_thresholds` get populated.  Idempotent: the pipeline's sample
 * lookup short-circuits tuples already cached, so re-running is safe and will
 * only fill the gap.
 *
 * Usage:
 *   npx tsx scripts/backfill-win-rate-samples.ts                # every post
 *   npx tsx scripts/backfill-win-rate-samples.ts --kol <kolId>  # scoped to one KOL
 *   npx tsx scripts/backfill-win-rate-samples.ts --dry-run      # no DB writes;
 *                                                                 reports what
 *                                                                 would be done
 *
 * Pre-reqs: `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`, and (if KOL has TW stocks) `TIINGO_API_TOKEN`.
 */

import 'dotenv/config';

import { createAdminClient } from '../src/infrastructure/supabase/admin';
import { listPosts } from '../src/infrastructure/repositories/post.repository';
import { getStockPrices } from '../src/infrastructure/repositories/stock-price.repository';
import { PersistentVolatilityProvider } from '../src/infrastructure/providers/persistent-volatility.provider';
import {
  loadSamplesByPostIds,
  upsertSamples,
} from '../src/infrastructure/repositories/win-rate-sample.repository';
import { computeWinRateStats, type PostForWinRate } from '../src/domain/services/win-rate.service';
import { calculatePriceChanges } from '../src/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '../src/domain/models';

// ── CLI args ──

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { kolId: null as string | null, dryRun: false, batchSize: 50 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--kol') out.kolId = args[++i] ?? null;
    else if (a === '--batch') out.batchSize = Math.max(1, Number(args[++i]) || 50);
  }
  return out;
}

const { kolId, dryRun, batchSize } = parseArgs();

// ── Helpers ──

async function countTargetPosts(filterKolId: string | null): Promise<number> {
  const supabase = createAdminClient();
  let q = supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .is('primary_post_id', null);
  if (filterKolId) q = q.eq('kol_id', filterKolId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchPostIdsPage(
  filterKolId: string | null,
  offset: number,
  limit: number
): Promise<string[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from('posts')
    .select('id')
    .is('primary_post_id', null)
    .order('posted_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (filterKolId) q = q.eq('kol_id', filterKolId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

async function buildInputsForPostIds(postIds: string[]): Promise<PostForWinRate[]> {
  // listPosts handles the FK embedding for post_stocks / stocks already.
  const out: PostForWinRate[] = [];
  if (postIds.length === 0) return out;

  // listPosts doesn't have a `postIds in` filter — we walk in per-KOL batches
  // or via a dedicated query. Simplest: reuse the per-KOL paged list from
  // listPosts and filter on the caller side.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, sentiment, posted_at, post_stocks(stock_id, sentiment, stocks(id, ticker))')
    .in('id', postIds);
  if (error) throw new Error(error.message);

  type StockEmbed = { id: string; ticker: string } | null;
  type PostStockEmbed = {
    stock_id: string;
    sentiment: number | null;
    stocks: StockEmbed | StockEmbed[] | null;
  };
  type PostRowEmbed = {
    id: string;
    sentiment: number;
    posted_at: string;
    post_stocks: PostStockEmbed[];
  };

  function firstStock(row: PostStockEmbed): { id: string; ticker: string } | null {
    const s = row.stocks;
    if (!s) return null;
    if (Array.isArray(s)) return s[0] ?? null;
    return s;
  }

  const rows = (data ?? []) as unknown as PostRowEmbed[];

  // Build candle cache per ticker (per-post candle fetch would be overkill).
  const uniqueTickers = new Set<string>();
  for (const row of rows) {
    for (const ps of row.post_stocks ?? []) {
      const stock = firstStock(ps);
      if (stock) uniqueTickers.add(stock.ticker);
    }
  }

  const candlesByTicker = new Map<string, Awaited<ReturnType<typeof getStockPrices>>['candles']>();
  for (const ticker of uniqueTickers) {
    try {
      const { candles } = await getStockPrices(ticker);
      candlesByTicker.set(ticker, candles);
    } catch {
      candlesByTicker.set(ticker, []);
    }
  }

  for (const row of rows) {
    const stockSentiments: Record<string, Sentiment> = {};
    const tickerByStockId: Record<string, string> = {};
    const priceChanges: Record<string, PriceChangeByPeriod> = {};
    for (const ps of row.post_stocks ?? []) {
      const stock = firstStock(ps);
      if (!stock) continue;
      const stockId = stock.id;
      tickerByStockId[stockId] = stock.ticker;
      if (ps.sentiment !== null) stockSentiments[stockId] = ps.sentiment as Sentiment;
      const candles = candlesByTicker.get(stock.ticker) ?? [];
      priceChanges[stockId] =
        candles.length > 0
          ? calculatePriceChanges(candles, new Date(row.posted_at))
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
    out.push({
      id: row.id,
      sentiment: row.sentiment as Sentiment,
      postedAt: new Date(row.posted_at),
      ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
      tickerByStockId,
      priceChanges,
    });
  }

  // listPosts is imported above for parity with the API route; silence
  // unused-import warnings.
  void listPosts;

  return out;
}

// ── Main ──

async function main() {
  const total = await countTargetPosts(kolId);
  console.log(
    `[backfill] starting${dryRun ? ' (dry-run)' : ''} — ${total} posts to scan${
      kolId ? ` (kol=${kolId})` : ''
    }, batch=${batchSize}`
  );
  if (total === 0) return;

  const provider = new PersistentVolatilityProvider();
  const sampleRepo = dryRun
    ? undefined
    : {
        loadSamplesByPostIds,
        upsertSamples,
      };

  let processed = 0;
  for (let offset = 0; offset < total; offset += batchSize) {
    const postIds = await fetchPostIdsPage(kolId, offset, batchSize);
    if (postIds.length === 0) break;

    const posts = await buildInputsForPostIds(postIds);
    if (posts.length === 0) continue;

    const startedAt = Date.now();
    try {
      await computeWinRateStats({ posts, provider, sampleRepo });
    } catch (err) {
      console.warn(
        `[backfill] batch at offset ${offset} failed:`,
        err instanceof Error ? err.message : err
      );
    }
    processed += posts.length;
    const ms = Date.now() - startedAt;
    console.log(
      `[backfill] ${processed}/${total} (${Math.round((processed / total) * 100)}%) — batch ${ms}ms`
    );
  }

  console.log(`[backfill] done — processed ${processed} posts${dryRun ? ' (no writes)' : ''}`);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});

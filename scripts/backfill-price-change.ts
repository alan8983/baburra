#!/usr/bin/env tsx
/**
 * Backfill price_change on post_win_rate_samples.
 *
 * The `persist-kol-scorecard-cache` migration extends `post_win_rate_samples`
 * with `price_change` and `price_change_status` columns. Pre-existing rows
 * default to `status = 'value'` but have `price_change IS NULL`. This script
 * recomputes `price_change` from candle data for every affected row.
 *
 * Usage:
 *   npx tsx scripts/backfill-price-change.ts            # run against prod
 *   npx tsx scripts/backfill-price-change.ts --dry-run  # report only
 *
 * Pre-reqs: `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`, `TIINGO_API_TOKEN`.
 */

import 'dotenv/config';

import { createAdminClient } from '../src/infrastructure/supabase/admin';
import { getStockPrices } from '../src/infrastructure/repositories/stock-price.repository';
import { calculatePriceChanges } from '../src/domain/calculators';
import type { PriceChangeStatus } from '../src/domain/models/post';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, batchSize: 200 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--batch') out.batchSize = Math.max(1, Number(args[++i]) || 200);
  }
  return out;
}

const { dryRun, batchSize } = parseArgs();

interface SampleRow {
  post_id: string;
  stock_id: string;
  period_days: number;
  ticker: string;
  posted_at: string;
}

async function fetchPendingRows(offset: number, limit: number): Promise<SampleRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('post_win_rate_samples')
    .select('post_id, stock_id, period_days, posts!inner(posted_at), stocks!inner(ticker)')
    .is('price_change', null)
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const posts = (row as unknown as { posts: { posted_at: string } }).posts;
    const stocks = (row as unknown as { stocks: { ticker: string } }).stocks;
    return {
      post_id: row.post_id as string,
      stock_id: row.stock_id as string,
      period_days: row.period_days as number,
      ticker: stocks.ticker,
      posted_at: posts.posted_at,
    };
  });
}

async function main() {
  console.log(`[backfill-price-change] mode: ${dryRun ? 'DRY-RUN' : 'WRITE'}, batch: ${batchSize}`);

  const supabase = createAdminClient();

  // Count pending rows for reporting.
  const { count: totalPending } = await supabase
    .from('post_win_rate_samples')
    .select('*', { count: 'exact', head: true })
    .is('price_change', null);
  console.log(`[backfill-price-change] pending rows: ${totalPending ?? 0}`);

  if (!totalPending) {
    console.log('[backfill-price-change] nothing to do.');
    return;
  }

  // Group by ticker × earliest post so we fetch candles once per ticker batch.
  let processed = 0;
  let updated = 0;
  let offset = 0;

  while (offset < totalPending) {
    const rows = await fetchPendingRows(offset, batchSize);
    if (rows.length === 0) break;

    // Collect tickers + earliest posted_at per ticker
    const tickerEarliest = new Map<string, Date>();
    for (const r of rows) {
      const existing = tickerEarliest.get(r.ticker);
      const d = new Date(r.posted_at);
      if (!existing || d < existing) tickerEarliest.set(r.ticker, d);
    }

    // Fetch candles per ticker, with a 7-day lookback.
    const candlesByTicker = new Map<string, Awaited<ReturnType<typeof getStockPrices>>['candles']>();
    for (const [ticker, earliest] of tickerEarliest.entries()) {
      const start = new Date(earliest);
      start.setDate(start.getDate() - 7);
      try {
        const { candles } = await getStockPrices(ticker, {
          startDate: start.toISOString().slice(0, 10),
        });
        candlesByTicker.set(ticker, candles);
      } catch (err) {
        console.warn(
          `[backfill-price-change] failed to fetch candles for ${ticker}:`,
          err instanceof Error ? err.message : err
        );
        candlesByTicker.set(ticker, []);
      }
    }

    // For each row, compute priceChange from candles.
    const updates: Array<{
      post_id: string;
      stock_id: string;
      period_days: number;
      price_change: number | null;
      price_change_status: PriceChangeStatus;
    }> = [];
    for (const row of rows) {
      const candles = candlesByTicker.get(row.ticker) ?? [];
      const pc =
        candles.length > 0
          ? calculatePriceChanges(candles, new Date(row.posted_at))
          : null;
      const periodKey = (`day${row.period_days}` as 'day5' | 'day30' | 'day90' | 'day365');
      const statusKey = `${periodKey}Status` as const;
      if (!pc) {
        updates.push({
          post_id: row.post_id,
          stock_id: row.stock_id,
          period_days: row.period_days,
          price_change: null,
          price_change_status: 'no_data',
        });
        continue;
      }
      updates.push({
        post_id: row.post_id,
        stock_id: row.stock_id,
        period_days: row.period_days,
        price_change: pc[periodKey],
        price_change_status: pc[statusKey] as PriceChangeStatus,
      });
    }

    processed += rows.length;

    if (dryRun) {
      console.log(
        `[backfill-price-change] DRY-RUN: would update ${updates.length} rows (offset ${offset})`
      );
    } else {
      // Apply updates one-by-one (composite PK → no bulk upsert shortcut).
      for (const u of updates) {
        const { error } = await supabase
          .from('post_win_rate_samples')
          .update({
            price_change: u.price_change,
            price_change_status: u.price_change_status,
          })
          .eq('post_id', u.post_id)
          .eq('stock_id', u.stock_id)
          .eq('period_days', u.period_days);
        if (error) {
          console.warn(
            `[backfill-price-change] update failed for (${u.post_id}, ${u.stock_id}, ${u.period_days}):`,
            error.message
          );
        } else {
          updated++;
        }
      }
      console.log(
        `[backfill-price-change] batch done: processed=${processed}/${totalPending}, updated=${updated}`
      );
    }

    offset += rows.length;
  }

  console.log(
    `[backfill-price-change] finished. processed=${processed}, updated=${updated}, mode=${dryRun ? 'dry-run' : 'write'}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Backfill Scorecard Cache Script
 *
 * Pre-warms `kol_scorecard_cache` and (optionally) `stock_scorecard_cache`
 * so that the first user visit to any KOL/stock detail page is a fast PK
 * lookup rather than a cold Tiingo+Supabase compute round-trip.
 *
 * This is the production rollout script for the scorecard cache feature.
 * Run it BEFORE flipping USE_SCORECARD_CACHE=true in Vercel to avoid a
 * thundering-herd of concurrent Tiingo fetches on the first wave of requests.
 *
 * Usage:
 *   npx tsx scripts/backfill-scorecards.ts --kol <slug|id>      # one KOL
 *   npx tsx scripts/backfill-scorecards.ts --kol all             # all KOLs with posts
 *   npx tsx scripts/backfill-scorecards.ts --kol all --stocks    # all KOLs + all stocks
 *   npx tsx scripts/backfill-scorecards.ts --kol all --dry-run   # preview only
 *
 * Pre-reqs: `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`, and `TIINGO_API_TOKEN`.
 */

// Load .env.local (Next.js convention) before any other imports that read env.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // also load .env as fallback

import { createAdminClient } from '../src/infrastructure/supabase/admin';
import {
  computeKolScorecard,
  computeStockScorecard,
} from '../src/domain/services/scorecard.service';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(): { kolArg: string; stocks: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  let kolArg: string | null = null;
  let dryRun = false;
  let stocks = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--stocks') stocks = true;
    else if (a === '--kol') {
      const val = args[++i];
      if (!val) {
        console.error('[backfill] --kol requires a value: <slug|id|all>');
        process.exit(1);
      }
      kolArg = val;
    }
  }
  if (!kolArg) {
    console.error('[backfill] --kol <slug|id|all> is required');
    process.exit(1);
  }
  // process.exit(1) above guarantees kolArg is non-null here.
  return { kolArg, stocks, dryRun };
}

const { kolArg, stocks: includeStocks, dryRun } = parseArgs();

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Return all KOL IDs that have at least one post. */
async function fetchAllKolIdsWithPosts(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('posts')
    .select('kol_id')
    .is('primary_post_id', null);
  if (error) throw new Error(`fetchAllKolIdsWithPosts: ${error.message}`);
  const unique = new Set((data ?? []).map((r) => r.kol_id as string));
  return Array.from(unique);
}

/** Resolve a single KOL by slug OR uuid. Returns { id, slug }. */
async function resolveKol(slugOrId: string): Promise<{ id: string; slug: string } | null> {
  const supabase = createAdminClient();
  // Try slug first, then id.
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data, error } = await supabase
    .from('kols')
    .select('id, slug')
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  if (error) throw new Error(`resolveKol(${slugOrId}): ${error.message}`);
  return data ?? null;
}

/** Return slug for a KOL id (for logging). */
async function fetchKolSlug(kolId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('kols')
    .select('slug')
    .eq('id', kolId)
    .maybeSingle();
  return data?.slug ?? kolId;
}

/** Return all stock IDs referenced by any post from the given KOL IDs. */
async function fetchStockIdsForKols(kolIds: string[]): Promise<string[]> {
  const supabase = createAdminClient();
  // post_stocks → posts → filter by kol_id in (...)
  const { data: postRows, error: postErr } = await supabase
    .from('posts')
    .select('id')
    .in('kol_id', kolIds)
    .is('primary_post_id', null);
  if (postErr) throw new Error(`fetchPostIds: ${postErr.message}`);
  const postIds = (postRows ?? []).map((r) => r.id as string);
  if (postIds.length === 0) return [];

  const { data, error } = await supabase
    .from('post_stocks')
    .select('stock_id')
    .in('post_id', postIds);
  if (error) throw new Error(`fetchStockIds: ${error.message}`);
  const unique = new Set((data ?? []).map((r) => r.stock_id as string));
  return Array.from(unique);
}

/** Return post count for a KOL (for progress log). */
async function fetchPostCount(kolId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('kol_id', kolId)
    .is('primary_post_id', null);
  if (error) return 0;
  return count ?? 0;
}

/** Return ticker for a stock id (for logging). */
async function fetchStockTicker(stockId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('stocks')
    .select('ticker')
    .eq('id', stockId)
    .maybeSingle();
  return data?.ticker ?? stockId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `[backfill] starting${dryRun ? ' (dry-run)' : ''} — kol=${kolArg}${includeStocks ? ' --stocks' : ''}`
  );

  // ── Resolve KOL list ───────────────────────────────────────────────────────

  let kolIds: string[];

  if (kolArg === 'all') {
    kolIds = await fetchAllKolIdsWithPosts();
    console.log(`[backfill] found ${kolIds.length} KOLs with posts`);
  } else {
    const resolved = await resolveKol(kolArg);
    if (!resolved) {
      console.error(`[backfill] KOL not found: ${kolArg}`);
      process.exit(1);
    }
    kolIds = [resolved.id];
    console.log(`[backfill] resolved KOL: ${resolved.slug} (${resolved.id})`);
  }

  if (kolIds.length === 0) {
    console.log('[backfill] no KOLs to process — done.');
    return;
  }

  // ── Dry-run preview ────────────────────────────────────────────────────────

  if (dryRun) {
    console.log('[backfill] dry-run: would compute scorecard for:');
    for (const kolId of kolIds) {
      const slug = await fetchKolSlug(kolId);
      const postCount = await fetchPostCount(kolId);
      console.log(`  KOL  ${slug} (${kolId}) — ${postCount} posts`);
    }
    if (includeStocks) {
      const stockIds = await fetchStockIdsForKols(kolIds);
      console.log(`[backfill] dry-run: would compute stock scorecard for ${stockIds.length} stocks`);
      for (const stockId of stockIds) {
        const ticker = await fetchStockTicker(stockId);
        console.log(`  Stock  ${ticker} (${stockId})`);
      }
    }
    console.log('[backfill] dry-run complete — no writes made.');
    return;
  }

  // ── KOL backfill ───────────────────────────────────────────────────────────

  const kolTotal = kolIds.length;
  let kolDone = 0;
  const kolFailures: string[] = [];
  const kolStart = Date.now();

  for (const kolId of kolIds) {
    const slug = await fetchKolSlug(kolId);
    const postCount = await fetchPostCount(kolId);
    const t0 = Date.now();
    try {
      await computeKolScorecard(kolId);
      const ms = Date.now() - t0;
      kolDone++;
      console.log(
        `[backfill] KOL ${kolDone}/${kolTotal}: ${slug} — computed in ${ms}ms (posts=${postCount})`
      );
    } catch (err) {
      kolFailures.push(kolId);
      console.warn(
        `[backfill] KOL ${slug} (${kolId}) FAILED:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const kolElapsed = Math.round((Date.now() - kolStart) / 1000);
  console.log(
    `[backfill] KOLs complete: ${kolDone}/${kolTotal} in ${kolElapsed}s${
      kolFailures.length > 0 ? `; ${kolFailures.length} failures (${kolFailures.join(', ')})` : ''
    }`
  );

  // ── Stock backfill ─────────────────────────────────────────────────────────

  if (!includeStocks) {
    console.log('[backfill] done (--stocks not passed; skipping stock scorecard backfill).');
    return;
  }

  const stockIds = await fetchStockIdsForKols(kolIds);
  console.log(`[backfill] found ${stockIds.length} stocks to backfill`);

  const stockTotal = stockIds.length;
  let stockDone = 0;
  const stockFailures: string[] = [];
  const stockStart = Date.now();

  for (const stockId of stockIds) {
    const ticker = await fetchStockTicker(stockId);
    const t0 = Date.now();
    try {
      await computeStockScorecard(stockId);
      const ms = Date.now() - t0;
      stockDone++;
      console.log(
        `[backfill] Stock ${stockDone}/${stockTotal}: ${ticker} — computed in ${ms}ms`
      );
    } catch (err) {
      stockFailures.push(stockId);
      console.warn(
        `[backfill] Stock ${ticker} (${stockId}) FAILED:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const stockElapsed = Math.round((Date.now() - stockStart) / 1000);
  console.log(
    `[backfill] Stocks complete: ${stockDone}/${stockTotal} in ${stockElapsed}s${
      stockFailures.length > 0
        ? `; ${stockFailures.length} failures (${stockFailures.join(', ')})`
        : ''
    }`
  );

  // ── Final summary ──────────────────────────────────────────────────────────

  console.log(
    `[backfill] Summary — KOLs: ${kolDone}/${kolTotal} in ${kolElapsed}s; Stocks: ${stockDone}/${stockTotal} in ${stockElapsed}s.${
      kolFailures.length + stockFailures.length > 0
        ? ` Failures: ${[...kolFailures, ...stockFailures].join(', ')}`
        : ' No failures.'
    }`
  );
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});

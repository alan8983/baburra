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
 *   npx tsx scripts/backfill-scorecards.ts --kol <slug|id>          # one KOL
 *   npx tsx scripts/backfill-scorecards.ts --kol all                 # all KOLs with posts
 *   npx tsx scripts/backfill-scorecards.ts --kol all --stocks        # all KOLs + all stocks
 *   npx tsx scripts/backfill-scorecards.ts --kol all --dry-run       # preview only
 *   npx tsx scripts/backfill-scorecards.ts --kol all --skip-warm     # resume: skip rows already at current schema
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
import { CLASSIFIER_VERSION } from '../src/domain/calculators';
import { isCurrentBlobSchema } from '../src/infrastructure/repositories/scorecard-cache.repository';

// ── CLI args ──────────────────────────────────────────────────────────────────

interface CliArgs {
  kolArg: string;
  stocks: boolean;
  dryRun: boolean;
  skipWarm: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let kolArg: string | null = null;
  let dryRun = false;
  let stocks = false;
  let skipWarm = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--stocks') stocks = true;
    else if (a === '--skip-warm') skipWarm = true;
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
  return { kolArg, stocks, dryRun, skipWarm };
}

const { kolArg, stocks: includeStocks, dryRun, skipWarm } = parseArgs();

// ── Retry policy ──────────────────────────────────────────────────────────────
// computeKolScorecard / computeStockScorecard swallow internal errors and just
// log a warning. So "did the work succeed" is determined by reading the row
// back and checking the schema sentinel — not by exception handling. We retry
// with exponential backoff (2s, 4s) when the verify check fails after compute,
// which covers transient Tiingo 429s, network blips, and Supabase upsert errors.
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** Return post count for a stock (used to differentiate "no posts" from compute failure). */
async function fetchStockPostCount(stockId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('post_stocks')
    .select('post_id')
    .eq('stock_id', stockId);
  if (error) return 0;
  return (data ?? []).length;
}

/**
 * True iff the persisted row exists with `classifier_version === CLASSIFIER_VERSION`,
 * `stale === false`, and the JSONB blob is at the current schema (carries a
 * 6-bin `histogram`). Mirrors `getKolScorecard`'s freshness check exactly,
 * minus the TTL — backfill should not skip rows that are merely TTL-stale,
 * since the whole point of the script is to refresh them.
 */
async function isKolRowWarm(kolId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('kol_scorecard_cache')
    .select('classifier_version, stale, day5')
    .eq('kol_id', kolId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.classifier_version !== CLASSIFIER_VERSION) return false;
  if (data.stale) return false;
  return isCurrentBlobSchema(data.day5);
}

async function isStockRowWarm(stockId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stock_scorecard_cache')
    .select('classifier_version, stale, day5')
    .eq('stock_id', stockId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.classifier_version !== CLASSIFIER_VERSION) return false;
  if (data.stale) return false;
  return isCurrentBlobSchema(data.day5);
}

/**
 * Run `compute` and verify with `isWarm`. Retry up to MAX_ATTEMPTS with
 * exponential backoff (2s, 4s) when the row isn't warm after compute.
 *
 * Returns `'done'` on first warm verification, `'failed'` if all attempts
 * exhausted. The compute service swallows internal errors so we can't rely
 * on thrown exceptions — verification is the source of truth.
 */
async function computeWithVerify(
  label: string,
  compute: () => Promise<void>,
  isWarm: () => Promise<boolean>
): Promise<{ status: 'done' | 'failed'; attempts: number; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await compute();
    } catch (err) {
      // Service should swallow, but guard anyway so a thrown error doesn't
      // skip the verify-and-retry path.
      console.warn(
        `[backfill] ${label} compute attempt ${attempt}/${MAX_ATTEMPTS} threw:`,
        err instanceof Error ? err.message : err
      );
    }
    if (await isWarm()) {
      return { status: 'done', attempts: attempt, ms: Date.now() - t0 };
    }
    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[backfill] ${label} attempt ${attempt}/${MAX_ATTEMPTS} did not produce a warm row — retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }
  return { status: 'failed', attempts: MAX_ATTEMPTS, ms: Date.now() - t0 };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `[backfill] starting${dryRun ? ' (dry-run)' : ''} — kol=${kolArg}${includeStocks ? ' --stocks' : ''}${skipWarm ? ' --skip-warm' : ''}`
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
    let kolPlanned = 0;
    let kolWouldSkip = 0;
    for (const kolId of kolIds) {
      const slug = await fetchKolSlug(kolId);
      const postCount = await fetchPostCount(kolId);
      const warm = skipWarm ? await isKolRowWarm(kolId) : false;
      const note = postCount === 0 ? ' [skip: no posts]' : warm ? ' [skip: already warm]' : '';
      if (postCount === 0 || warm) kolWouldSkip++;
      else kolPlanned++;
      console.log(`  KOL  ${slug} (${kolId}) — ${postCount} posts${note}`);
    }
    console.log(
      `[backfill] dry-run KOL plan: ${kolPlanned} to compute, ${kolWouldSkip} to skip`
    );
    if (includeStocks) {
      const stockIds = await fetchStockIdsForKols(kolIds);
      console.log(`[backfill] dry-run: would compute stock scorecard for ${stockIds.length} stocks`);
      let stockPlanned = 0;
      let stockWouldSkip = 0;
      for (const stockId of stockIds) {
        const ticker = await fetchStockTicker(stockId);
        const postCount = await fetchStockPostCount(stockId);
        const warm = skipWarm ? await isStockRowWarm(stockId) : false;
        const note = postCount === 0 ? ' [skip: no posts]' : warm ? ' [skip: already warm]' : '';
        if (postCount === 0 || warm) stockWouldSkip++;
        else stockPlanned++;
        console.log(`  Stock  ${ticker} (${stockId})${note}`);
      }
      console.log(
        `[backfill] dry-run stock plan: ${stockPlanned} to compute, ${stockWouldSkip} to skip`
      );
    }
    console.log('[backfill] dry-run complete — no writes made.');
    return;
  }

  // ── KOL backfill ───────────────────────────────────────────────────────────

  const kolTotal = kolIds.length;
  let kolDone = 0;
  let kolSkipped = 0;
  const kolFailures: string[] = [];
  const kolStart = Date.now();

  for (let i = 0; i < kolIds.length; i++) {
    const kolId = kolIds[i];
    const slug = await fetchKolSlug(kolId);
    const postCount = await fetchPostCount(kolId);

    if (postCount === 0) {
      kolSkipped++;
      console.log(`[backfill] KOL ${i + 1}/${kolTotal}: ${slug} — skipped (no posts)`);
      continue;
    }

    if (skipWarm && (await isKolRowWarm(kolId))) {
      kolSkipped++;
      console.log(
        `[backfill] KOL ${i + 1}/${kolTotal}: ${slug} — skipped (already warm at current schema)`
      );
      continue;
    }

    const result = await computeWithVerify(
      `KOL ${slug}`,
      () => computeKolScorecard(kolId),
      () => isKolRowWarm(kolId)
    );
    if (result.status === 'done') {
      kolDone++;
      console.log(
        `[backfill] KOL ${i + 1}/${kolTotal}: ${slug} — computed in ${result.ms}ms (posts=${postCount}, attempts=${result.attempts})`
      );
    } else {
      kolFailures.push(kolId);
      console.warn(
        `[backfill] KOL ${slug} (${kolId}) FAILED after ${MAX_ATTEMPTS} attempts in ${result.ms}ms`
      );
    }
  }

  const kolElapsed = Math.round((Date.now() - kolStart) / 1000);
  console.log(
    `[backfill] KOLs complete: ${kolDone}/${kolTotal} done, ${kolSkipped} skipped in ${kolElapsed}s${
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
  let stockSkipped = 0;
  const stockFailures: string[] = [];
  const stockStart = Date.now();

  for (let i = 0; i < stockIds.length; i++) {
    const stockId = stockIds[i];
    const ticker = await fetchStockTicker(stockId);

    const postCount = await fetchStockPostCount(stockId);
    if (postCount === 0) {
      stockSkipped++;
      console.log(`[backfill] Stock ${i + 1}/${stockTotal}: ${ticker} — skipped (no posts)`);
      continue;
    }

    if (skipWarm && (await isStockRowWarm(stockId))) {
      stockSkipped++;
      console.log(
        `[backfill] Stock ${i + 1}/${stockTotal}: ${ticker} — skipped (already warm at current schema)`
      );
      continue;
    }

    const result = await computeWithVerify(
      `Stock ${ticker}`,
      () => computeStockScorecard(stockId),
      () => isStockRowWarm(stockId)
    );
    if (result.status === 'done') {
      stockDone++;
      console.log(
        `[backfill] Stock ${i + 1}/${stockTotal}: ${ticker} — computed in ${result.ms}ms (attempts=${result.attempts})`
      );
    } else {
      stockFailures.push(stockId);
      console.warn(
        `[backfill] Stock ${ticker} (${stockId}) FAILED after ${MAX_ATTEMPTS} attempts in ${result.ms}ms`
      );
    }
  }

  const stockElapsed = Math.round((Date.now() - stockStart) / 1000);
  console.log(
    `[backfill] Stocks complete: ${stockDone}/${stockTotal} done, ${stockSkipped} skipped in ${stockElapsed}s${
      stockFailures.length > 0
        ? `; ${stockFailures.length} failures (${stockFailures.join(', ')})`
        : ''
    }`
  );

  // ── Final summary ──────────────────────────────────────────────────────────

  console.log(
    `[backfill] Summary — KOLs: ${kolDone}/${kolTotal} done (${kolSkipped} skipped) in ${kolElapsed}s; Stocks: ${stockDone}/${stockTotal} done (${stockSkipped} skipped) in ${stockElapsed}s.${
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

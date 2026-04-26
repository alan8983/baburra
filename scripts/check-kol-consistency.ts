#!/usr/bin/env tsx
/**
 * KOL detail page consistency checker.
 *
 * Asserts the four invariants from openspec/changes/kol-detail-consistency-qa-gate
 * (Q1) for a given kolId. Exits 0 on all-pass, 1 on any-fail. Prints a
 * human-readable diff table on failure; pass --json for structured output.
 *
 * Usage:
 *   npx tsx scripts/check-kol-consistency.ts <kolId>
 *   npx tsx scripts/check-kol-consistency.ts <kolId> --json
 *
 * Invariants:
 *   I-1  kol_stats.post_count   === COUNT(posts WHERE kol_id=…)
 *   I-2  cache.post_count       === that count, AND stale=false, AND now()-computed_at < 12h
 *   I-3  for every stock with ≥3 (kolId, stock) posts:
 *           buckets_by_stock[stockId].day30.total ≥ 1
 *           (short-circuit pass if volatility_thresholds has zero rows for the (ticker, 30) pair)
 *   I-4  listPosts({kolId, limit: 1000}).total === kol_stats.post_count
 *
 * Wired into:
 *   - tail of every Gooaye scrape script (Q2)
 *   - validate-podcast-pipeline-with-gooaye/tasks.md validation hook (Q4)
 *   - src/scripts/__tests__/check-kol-consistency.test.ts (Vitest)
 */

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv();

import { createAdminClient } from '../src/infrastructure/supabase/admin';
import { listPosts } from '../src/infrastructure/repositories/post.repository';
import { SCORECARD_TTL_MS } from '../src/infrastructure/repositories/scorecard-cache.repository';
import { CLASSIFIER_VERSION } from '../src/domain/calculators';

const I3_MIN_POSTS = 3; // fewer than this, "all excluded" is plausible noise

type CheckResult = {
  invariant: 'I-1' | 'I-2' | 'I-3' | 'I-4';
  pass: boolean;
  detail: Record<string, unknown>;
};

export interface ConsistencyReport {
  kolId: string;
  ranAt: string;
  results: CheckResult[];
  pass: boolean;
}

export async function checkKolConsistency(kolId: string): Promise<ConsistencyReport> {
  const supabase = createAdminClient();
  const results: CheckResult[] = [];

  // Ground truth: actual post count
  const { count: actualCount, error: countErr } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('kol_id', kolId);
  if (countErr) {
    throw new Error(`Failed to count posts for ${kolId}: ${countErr.message}`);
  }
  const dbCount = actualCount ?? 0;

  // I-1: kol_stats denorm
  const { data: statsRow, error: statsErr } = await supabase
    .from('kol_stats')
    .select('post_count')
    .eq('kol_id', kolId)
    .maybeSingle();
  if (statsErr) {
    throw new Error(`Failed to load kol_stats for ${kolId}: ${statsErr.message}`);
  }
  const denormCount = (statsRow?.post_count as number | null) ?? 0;
  results.push({
    invariant: 'I-1',
    pass: denormCount === dbCount,
    detail: { kol_stats_post_count: denormCount, db_post_count: dbCount },
  });

  // I-2: scorecard cache freshness + count match
  const { data: cacheRow, error: cacheErr } = await supabase
    .from('kol_scorecard_cache')
    .select('post_count, stale, computed_at, classifier_version, buckets_by_stock')
    .eq('kol_id', kolId)
    .maybeSingle();
  if (cacheErr) {
    throw new Error(`Failed to load kol_scorecard_cache for ${kolId}: ${cacheErr.message}`);
  }

  if (!cacheRow) {
    results.push({
      invariant: 'I-2',
      pass: false,
      detail: { error: 'no kol_scorecard_cache row' },
    });
  } else {
    const ageMs = Date.now() - new Date(cacheRow.computed_at as string).getTime();
    const fresh = ageMs < SCORECARD_TTL_MS;
    const versionMatches = (cacheRow.classifier_version as number) === CLASSIFIER_VERSION;
    const i2Pass =
      (cacheRow.post_count as number) === dbCount &&
      cacheRow.stale === false &&
      fresh &&
      versionMatches;
    results.push({
      invariant: 'I-2',
      pass: i2Pass,
      detail: {
        cache_post_count: cacheRow.post_count,
        db_post_count: dbCount,
        stale: cacheRow.stale,
        computed_at: cacheRow.computed_at,
        age_ms: ageMs,
        ttl_ms: SCORECARD_TTL_MS,
        classifier_version: cacheRow.classifier_version,
        expected_classifier_version: CLASSIFIER_VERSION,
      },
    });
  }

  // I-3: per-stock bucket coverage
  const { data: stockCountsRows, error: stockErr } = await supabase
    .from('post_stocks')
    .select('stock_id, posts!inner(kol_id), stocks!inner(id, ticker)')
    .eq('posts.kol_id', kolId);
  if (stockErr) {
    throw new Error(`Failed to load post_stocks for ${kolId}: ${stockErr.message}`);
  }

  type StockMeta = { count: number; ticker: string };
  const stockMeta = new Map<string, StockMeta>();
  for (const row of (stockCountsRows ?? []) as unknown as Array<{
    stock_id: string;
    stocks: { id: string; ticker: string };
  }>) {
    const sid = row.stock_id;
    const meta = stockMeta.get(sid);
    if (meta) {
      meta.count++;
    } else {
      stockMeta.set(sid, { count: 1, ticker: row.stocks?.ticker ?? sid.slice(0, 8) });
    }
  }

  const eligibleStocks: { stockId: string; ticker: string; count: number }[] = [];
  for (const [stockId, meta] of stockMeta.entries()) {
    if (meta.count >= I3_MIN_POSTS) {
      eligibleStocks.push({ stockId, ticker: meta.ticker, count: meta.count });
    }
  }

  const buckets =
    (cacheRow?.buckets_by_stock as Record<
      string,
      { day30?: { total?: number } } | undefined
    > | null) ?? {};

  // For tickers whose volatility_thresholds table has no rows for period 30,
  // I-3 short-circuits to "no signal yet, not a bug". Probe each eligible
  // ticker independently with `head: true` so a single ticker's existence
  // costs one count query, not N rows of payload — and so we can't be tripped
  // up by a single shared `.limit()` masking some tickers' rows.
  const thresholdTickers = new Set<string>();
  await Promise.all(
    eligibleStocks.map(async (s) => {
      const { count, error } = await supabase
        .from('volatility_thresholds')
        .select('ticker', { count: 'exact', head: true })
        .eq('ticker', s.ticker)
        .eq('period_days', 30);
      if (error) {
        throw new Error(`Failed to probe volatility_thresholds for ${s.ticker}: ${error.message}`);
      }
      if ((count ?? 0) > 0) thresholdTickers.add(s.ticker);
    })
  );

  const i3Failures: { stockId: string; ticker: string; postCount: number; bucketTotal: number }[] =
    [];
  for (const eligible of eligibleStocks) {
    const bucket = buckets[eligible.stockId];
    const bucketTotal = bucket?.day30?.total ?? 0;
    if (bucketTotal >= 1) continue; // healthy
    if (!thresholdTickers.has(eligible.ticker)) continue; // cold-start short-circuit
    i3Failures.push({
      stockId: eligible.stockId,
      ticker: eligible.ticker,
      postCount: eligible.count,
      bucketTotal,
    });
  }

  results.push({
    invariant: 'I-3',
    pass: i3Failures.length === 0,
    detail: {
      eligible_stocks: eligibleStocks.length,
      min_posts_threshold: I3_MIN_POSTS,
      failures: i3Failures,
    },
  });

  // I-4: listPosts({kolId, limit: 1000}).total === denorm count
  const listResult = await listPosts({ kolId, limit: 1000 });
  results.push({
    invariant: 'I-4',
    pass: listResult.total === denormCount,
    detail: {
      list_posts_total: listResult.total,
      list_posts_returned: listResult.data.length,
      kol_stats_post_count: denormCount,
    },
  });

  return {
    kolId,
    ranAt: new Date().toISOString(),
    results,
    pass: results.every((r) => r.pass),
  };
}

function printHumanReport(report: ConsistencyReport): void {
  console.log('');
  console.log(`KOL consistency check — ${report.kolId}`);
  console.log(`Ran at ${report.ranAt}`);
  console.log('');
  for (const r of report.results) {
    const tag = r.pass ? 'OK ' : 'FAIL';
    console.log(`  [${tag}] ${r.invariant}`);
    if (!r.pass) {
      for (const [k, v] of Object.entries(r.detail)) {
        console.log(`         ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
  console.log('');
  console.log(report.pass ? 'OK — all invariants pass' : 'FAIL — see invariants above');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const kolId = args.find((a) => !a.startsWith('--'));
  if (!kolId) {
    console.error(
      'Usage: npx tsx scripts/check-kol-consistency.ts <kolId> [--json]'
    );
    process.exit(2);
  }

  const report = await checkKolConsistency(kolId);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exit(report.pass ? 0 : 1);
}

// Allow import for the Vitest spec without auto-running.
const isDirectInvocation =
  process.argv[1]?.endsWith('check-kol-consistency.ts') ||
  process.argv[1]?.endsWith('check-kol-consistency.js');
if (isDirectInvocation) {
  main().catch((err) => {
    console.error('[check-kol-consistency] fatal:', err);
    process.exit(2);
  });
}

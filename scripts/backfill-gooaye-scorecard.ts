#!/usr/bin/env tsx
/**
 * One-off backfill for Gooaye's scorecard caches.
 *
 * Default (no flags): invalidates + recomputes the KOL scorecard for Gooaye.
 * With --stocks: also recomputes stock_scorecard_cache for every stock Gooaye
 *                has posted about (expensive — each stock runs a per-KOL
 *                sub-aggregation loop over every KOL that posted it).
 *
 * Usage:
 *   npx tsx scripts/backfill-gooaye-scorecard.ts           # KOL only
 *   npx tsx scripts/backfill-gooaye-scorecard.ts --stocks  # KOL + all Gooaye stocks
 */

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
loadDotenv(); // fall back to .env

import { createAdminClient } from '../src/infrastructure/supabase/admin';
import {
  computeKolScorecard,
  computeStockScorecard,
} from '../src/domain/services/scorecard.service';

const GOOAYE_KOL_ID = 'b7a958c4-f9f4-48e1-8dbf-a8966bf1484e';

async function main() {
  const includeStocks = process.argv.includes('--stocks');
  const supabase = createAdminClient();

  // 1) Invalidate the KOL scorecard so the recompute path re-writes it.
  const { error: invalErr } = await supabase
    .from('kol_scorecard_cache')
    .update({ stale: true })
    .eq('kol_id', GOOAYE_KOL_ID);
  if (invalErr) console.warn('[backfill] invalidate failed:', invalErr.message);

  console.log(`[backfill] recomputing KOL scorecard for Gooaye (${GOOAYE_KOL_ID})...`);
  const kolStart = Date.now();
  await computeKolScorecard(GOOAYE_KOL_ID);
  console.log(`[backfill] KOL scorecard done in ${Date.now() - kolStart}ms`);

  if (!includeStocks) {
    console.log('[backfill] skipping stock scorecards (pass --stocks to include)');
    return;
  }

  // 2) Find every stock Gooaye has posted about, then compute each.
  const { data: rows, error } = await supabase
    .from('post_stocks')
    .select('stock_id, posts!inner(kol_id, primary_post_id)')
    .eq('posts.kol_id', GOOAYE_KOL_ID)
    .is('posts.primary_post_id', null);
  if (error) throw new Error(error.message);

  const stockIds = Array.from(
    new Set((rows ?? []).map((r) => (r as { stock_id: string }).stock_id))
  );
  console.log(`[backfill] recomputing ${stockIds.length} stock scorecards...`);

  let done = 0;
  for (const stockId of stockIds) {
    const t0 = Date.now();
    try {
      await computeStockScorecard(stockId);
    } catch (err) {
      console.warn(`[backfill] stock ${stockId} failed:`, err instanceof Error ? err.message : err);
    }
    done++;
    console.log(
      `[backfill] ${done}/${stockIds.length} — ${stockId} (${Date.now() - t0}ms)`
    );
  }

  console.log('[backfill] done.');
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});

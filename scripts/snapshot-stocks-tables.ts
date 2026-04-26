#!/usr/bin/env tsx
/**
 * Snapshot the stocks + post_stocks tables to a JSON file before any
 * destructive cleanup runs. Used as a local rollback safety net.
 *
 * Output: openspec/changes/fix-ticker-mapping-quality/cleanup-snapshot.json
 *
 * The file is structured as:
 *   { taken_at: ISO, stocks: [...], post_stocks: [...] }
 *
 * Restoration (if needed) is a manual SQL re-INSERT — see comments in the
 * snapshot file header for the exact restore steps.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

import { createAdminClient } from '../src/infrastructure/supabase/admin';

const OUT_PATH = path.join(
  __dirname,
  '..',
  'openspec',
  'changes',
  'fix-ticker-mapping-quality',
  'cleanup-snapshot.json'
);

async function main() {
  const supabase = createAdminClient();

  console.log('[snapshot] fetching stocks…');
  const { data: stocks, error: stocksErr } = await supabase
    .from('stocks')
    .select('id, ticker, name, market, logo_url, created_at, updated_at')
    .order('ticker');
  if (stocksErr) throw stocksErr;
  console.log(`[snapshot] stocks: ${stocks?.length ?? 0} rows`);

  console.log('[snapshot] fetching post_stocks (paginated)…');
  const PAGE = 1000;
  const postStocks: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('post_stocks')
      .select('id, post_id, stock_id, source, sentiment, inference_reason')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    postStocks.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`[snapshot] post_stocks: ${postStocks.length} rows`);

  const snapshot = {
    taken_at: new Date().toISOString(),
    project: 'jinxqfsejfrhmvlhrfjj',
    purpose:
      'Pre-cleanup safety snapshot for openspec/changes/fix-ticker-mapping-quality §4.5 apply.',
    restore_steps: [
      'If cleanup --apply produced an unrecoverable state:',
      '  1. TRUNCATE post_stocks; TRUNCATE stocks CASCADE;',
      '  2. Re-INSERT from this file (use jq + psql, or scripts/restore-snapshot.ts).',
      '  3. Re-run scripts/seed-stocks-master.ts to ensure stocks_master is intact.',
      'Recovery is destructive of any post-cleanup writes; coordinate with the user.',
    ],
    counts: {
      stocks: stocks?.length ?? 0,
      post_stocks: postStocks?.length ?? 0,
    },
    stocks,
    post_stocks: postStocks,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  console.log(`[snapshot] wrote ${path.relative(process.cwd(), OUT_PATH)}`);
  const sizeMb = fs.statSync(OUT_PATH).size / (1024 * 1024);
  console.log(`[snapshot] size: ${sizeMb.toFixed(2)} MB`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

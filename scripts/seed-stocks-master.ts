#!/usr/bin/env tsx
/**
 * Seed (or refresh) stocks_master from the four JSON sources.
 *
 *   src/infrastructure/data/tw_master.json        (TWSE + TPEX listings)
 *   src/infrastructure/data/us_master.json        (NASDAQ Trader symbol dirs)
 *   src/infrastructure/data/manual_us_master.json (US tickers missed by NASDAQ Trader)
 *   src/infrastructure/data/crypto_master.json    (curated crypto list)
 *
 * Idempotent: ON CONFLICT DO UPDATE keeps existing rows, refreshes their name,
 * and bumps updated_at. Running twice produces no DB changes after the first
 * apply (other than updated_at).
 *
 * Run sequence:
 *   1. Refresh source JSONs:
 *        npx tsx scripts/build-tw-master.ts
 *        npx tsx scripts/build-us-master.ts
 *   2. Seed:
 *        npx tsx scripts/seed-stocks-master.ts            # writes to prod
 *        npx tsx scripts/seed-stocks-master.ts --dry-run  # counts only
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load env BEFORE other imports
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

interface MasterRow {
  ticker: string;
  name: string;
  market: 'US' | 'TW' | 'CRYPTO';
  source: 'twse' | 'tpex' | 'tiingo' | 'manual';
  aliases?: string[];
}

const DATA_DIR = path.join(__dirname, '..', 'src', 'infrastructure', 'data');
// Order matters: manual files come AFTER the bulk source they augment, so
// manual entries win on key conflict (manual is the canonical override layer).
const SOURCES = [
  { file: 'tw_master.json', label: 'TW' },
  { file: 'manual_tw_master.json', label: 'TW (manual)' },
  { file: 'us_master.json', label: 'US' },
  { file: 'manual_us_master.json', label: 'US (manual)' },
  { file: 'crypto_master.json', label: 'CRYPTO' },
];

/** Strip JSON file fields that aren't part of the DB row schema. */
function stripJsonOnlyFields(r: MasterRow & { _note?: string }): MasterRow {
  const { _note, ...rest } = r;
  // Normalize aliases to uppercase + dedup. Empty array if absent.
  const aliases = (rest.aliases ?? [])
    .map((a) => a.trim().toUpperCase())
    .filter((a, i, arr) => a && arr.indexOf(a) === i);
  return { ...rest, aliases };
}

const BATCH = 1000;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const all: MasterRow[] = [];
  for (const { file, label } of SOURCES) {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) {
      console.warn(`[seed] ${file} not found — run scripts/build-${label.toLowerCase().split(' ')[0]}-master.ts first?`);
      continue;
    }
    const rows = (JSON.parse(fs.readFileSync(p, 'utf-8')) as Array<MasterRow & { _note?: string }>).map(stripJsonOnlyFields);
    console.log(`[seed] ${label.padEnd(14)} ${rows.length.toString().padStart(6)} entries from ${file}`);
    all.push(...rows);
  }

  // Dedup by (ticker, market) — same ticker CAN legitimately exist in two
  // markets (STX is Seagate/US and Stacks/CRYPTO). Manual override entries
  // win by virtue of being read AFTER the bulk source for the same market.
  const byKey = new Map<string, MasterRow>();
  for (const r of all) byKey.set(`${r.ticker}::${r.market}`, r);
  const merged = Array.from(byKey.values());

  console.log(`[seed] merged-unique total: ${merged.length}`);
  const byMarket = merged.reduce<Record<string, number>>((acc, r) => {
    acc[r.market] = (acc[r.market] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[seed] by market: ${JSON.stringify(byMarket)}`);

  if (dryRun) {
    console.log('[seed] --dry-run: no writes performed.');
    return;
  }

  const supabase = createAdminClient();

  let inserted = 0;
  for (let i = 0; i < merged.length; i += BATCH) {
    const chunk = merged.slice(i, i + BATCH);
    const { error } = await supabase.from('stocks_master').upsert(chunk, {
      onConflict: 'ticker,market',
      ignoreDuplicates: false,
    });
    if (error) {
      console.error(`[seed] batch ${i / BATCH + 1} failed:`, error.message);
      throw error;
    }
    inserted += chunk.length;
    process.stdout.write(`\r[seed] upserted ${inserted}/${merged.length}…`);
  }
  process.stdout.write('\n');

  // Final count check from DB.
  const { count } = await supabase
    .from('stocks_master')
    .select('*', { count: 'exact', head: true });
  console.log(`[seed] DB now has ${count} rows in stocks_master.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

#!/usr/bin/env tsx
/**
 * Cleanup of fabricated/mis-named stocks rows produced before resolveStock
 * was wired in. Three buckets per the openspec design (D3):
 *
 *   A. Remap to canonical: ticker has a known correct equivalent. Rewrite
 *      post_stocks.stock_id to the canonical row, then delete the orphan.
 *   B. Pure delete: ticker is not in stocks_master at the stock's market
 *      (including non-existent tickers like 馮君/CHROME/MODEL 3 and rows
 *      with the wrong market like ERG/HK or DYNA/TW). Cascade-delete
 *      post_stocks linkages, then delete the stock row.
 *   C. Re-canonicalize name only: ticker IS in master at the right market
 *      but stocks.name disagrees (e.g. 2353.TW: "宏捷" → "宏碁"). UPDATE
 *      name to the master value.
 *
 * No-op (intentionally): ticker is in master at the right market AND
 * stocks.name already matches. Skipped silently.
 *
 * Defaults to --dry-run; --apply mutates. Logs every action to
 *   scripts/cleanup-fabricated-stocks.log
 *
 * Idempotent: a second --apply run after the first produces no further DB
 * changes.
 *
 * Pre-requisites:
 *   - Migration 20260425100000_create_stocks_master.sql applied.
 *   - scripts/seed-stocks-master.ts has populated stocks_master.
 *   - Database snapshot taken (Supabase backup or stocks/post_stocks export)
 *     before --apply.
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

interface StockRow {
  id: string;
  ticker: string;
  name: string;
  market: string;
}

interface MasterRow {
  ticker: string;
  name: string;
  market: string;
}

interface PlanRow {
  stock: StockRow;
  bucket: 'A_remap' | 'B_delete' | 'C_rename' | 'noop';
  remapTo?: string; // for A
  newName?: string; // for C
  reason: string;
  postStocksCount: number;
}

// Hardcoded bucket A remap table — wrong/oversize ticker → canonical equivalent.
// Reviewed against production dry-run on 2026-04-25.
const REMAP: Record<string, string> = {
  // US: long-form name-as-ticker → real ticker
  PALANTIR: 'PLTR',
  PANTR: 'PLTR',
  PNTIR: 'PLTR',
  CLOUDFLARE: 'NET',
  CLOUDFRE: 'NET',
  FLARE: 'NET',
  FLCL: 'NET',
  BROADCOM: 'AVGO',
  BRCM: 'AVGO',
  CONFLUENT: 'CFLT',
  CNFL: 'CFLT',
  SALESFORCE: 'CRM',
  SFDC: 'CRM',
  SERVICENOW: 'NOW',
  STELLANTIS: 'STLA',
  SEAGATE: 'STX',
  CORNING: 'GLW',
  CELSIUS: 'CELH',
  IMPINJ: 'PI',
  MARVELL: 'MRVL',
  PAYPAL: 'PYPL',
  AMAZON: 'AMZN',
  AIRBUS: 'EADSY',
  ORACLE: 'ORCL',
  FORTUNE: 'FTNT',
  'PURE.US': 'PSTG',
  // TW: bare numeric → .TW canonical form (also covers ETF letter-tranche 00631L)
  '2357': '2357.TW',
  '2408': '2408.TW',
  '3596': '3596.TW',
  '4966': '4966.TW',
  '566': '566.TW',
  '6531': '6531.TW',
  '8299': '8299.TW',
  '00631L': '00631L.TW',
};

// Hardcoded delete blacklist — these rows are pure hallucinations or
// conceptually invalid (private companies, product names, indices).
const PURE_DELETE = new Set<string>([
  'CLAUDE',
  'CHROME',
  'YOUTUBE',
  'ANDROID',
  'SPACEX',
  'MODEL 3',
  'MODEL X',
  'MODEL Y',
  'UNIQLO',
  'VMWARE',
  '^TWII',
  'DI0T',
  'DIOT',
  '366',
  '366 E',
  '569',
  '2542',
  'US',
  'CRYSTAL',
  'ASTERRA LABS',
  'CMO',
  'CNMRBL',
  'PLANTLY',
  'PANTRY',
  'STARLBS',
  'GPT-4',
  'ERG',
  'ASUS',
  'AP MEMORY',
  'APMEMORY',
  'PSMC',
  'DYNA',
  '2888.TW', // 新光金 merged into 2887.TW; delisted
]);

const SUSPECT_NAMES_TO_DELETE = new Set<string>([
  '馮君', // 9-ticker hallucination
  '寶', // 11-ticker hallucination on 9970-9995.TW range
]);

// Explicit per-row renames. These are stocks whose name is wrong in a way
// that only a human reviewer can identify (the diagnostic surfaced them, but
// they don't fit any pattern rule). The master IS the source of truth for
// the new name — we just need to flag these tickers as suspect so the
// classifier looks them up.
const EXPLICIT_RENAME_TICKERS = new Set<string>([
  '2353.TW', // currently '宏捷' → master '宏碁' (Acer); the headline diagnostic finding
  '8086.TW', // currently '宏捷' → master '宏捷科' (the real 宏捷科技, AWSC)
]);

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createAdminClient();
  const logPath = path.join(__dirname, 'cleanup-fabricated-stocks.log');
  const logLines: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    logLines.push(line);
  };

  log(`mode: ${apply ? 'APPLY (DB writes ENABLED)' : 'DRY-RUN (no writes)'}`);

  // Step 1: load all stocks.
  const { data: stocksRaw, error: stocksErr } = await supabase
    .from('stocks')
    .select('id, ticker, name, market');
  if (stocksErr) throw stocksErr;
  const allStocks = (stocksRaw ?? []) as StockRow[];
  log(`stocks total: ${allStocks.length}`);

  // Step 2: bulk-load master rows for every distinct ticker we have.
  const distinctTickers = Array.from(new Set(allStocks.map((s) => s.ticker)));
  const { data: masterRaw, error: masterErr } = await supabase
    .from('stocks_master')
    .select('ticker, name, market')
    .in('ticker', distinctTickers);
  if (masterErr) throw masterErr;
  const masters = (masterRaw ?? []) as MasterRow[];
  const masterByKey = new Map<string, MasterRow>(
    masters.map((m) => [`${m.ticker}::${m.market}`, m])
  );
  const masterByTicker = new Map<string, MasterRow[]>();
  for (const m of masters) {
    const arr = masterByTicker.get(m.ticker) ?? [];
    arr.push(m);
    masterByTicker.set(m.ticker, arr);
  }
  log(`master rows hit by current tickers: ${masters.length}`);

  // Build name-frequency map for the duplicate-name-group rule.
  const nameFreq = new Map<string, number>();
  for (const s of allStocks) {
    if (!s.name) continue;
    nameFreq.set(s.name.trim(), (nameFreq.get(s.name.trim()) ?? 0) + 1);
  }

  // Suspect filter — only rows that look broken go through classification.
  // Everything else stays untouched (including real-but-name-slightly-different
  // entries like TSLA="特斯拉" or NVDA="Nvidia" — too aggressive to overwrite).
  function isSuspect(s: StockRow): boolean {
    if (PURE_DELETE.has(s.ticker)) return true;
    if (s.name && SUSPECT_NAMES_TO_DELETE.has(s.name.trim())) return true;
    if (REMAP[s.ticker.toUpperCase()]) return true;
    if (EXPLICIT_RENAME_TICKERS.has(s.ticker)) return true;
    // Malformed shapes
    if (s.market === 'US' && s.ticker.length > 5) return true;
    if (s.market === 'TW' && !s.ticker.endsWith('.TW') && /^\d{4,6}[A-Z]?$/.test(s.ticker)) {
      return true; // missing-suffix on numeric TW code
    }
    if (s.market === 'TW' && !s.ticker.endsWith('.TW') && !/^\d/.test(s.ticker)) {
      return true; // non-numeric TW market ticker (ASUS, UMC, …)
    }
    if (s.market === 'HK') return true; // unsupported market
    if (s.ticker === s.name) return true; // ticker-as-name (CRCL, AAOI, IBM, …)
    // Duplicate-name group of 3+ — catches the First Financial × 11 case
    if (s.name && (nameFreq.get(s.name.trim()) ?? 0) >= 3) return true;
    return false;
  }

  const suspects = allStocks.filter(isSuspect);
  log(`suspect rows: ${suspects.length}`);

  // Step 3: classify each suspect.
  const plan: PlanRow[] = [];
  for (const stock of suspects) {
    // Hard delete blacklists.
    if (
      PURE_DELETE.has(stock.ticker) ||
      (stock.name && SUSPECT_NAMES_TO_DELETE.has(stock.name.trim()))
    ) {
      plan.push({
        stock,
        bucket: 'B_delete',
        reason: 'blacklisted',
        postStocksCount: 0,
      });
      continue;
    }

    // Hard remap.
    const remapTo = REMAP[stock.ticker.toUpperCase()];
    if (remapTo) {
      plan.push({
        stock,
        bucket: 'A_remap',
        remapTo,
        reason: 'remap-table',
        postStocksCount: 0,
      });
      continue;
    }

    // Master lookup at the EXACT market.
    const masterMatch = masterByKey.get(`${stock.ticker}::${stock.market}`);
    if (masterMatch) {
      if (masterMatch.name === stock.name) {
        plan.push({
          stock,
          bucket: 'noop',
          reason: 'canonical (suspect by another rule, name already correct)',
          postStocksCount: 0,
        });
        continue;
      }
      plan.push({
        stock,
        bucket: 'C_rename',
        newName: masterMatch.name,
        reason: 'master-name-disagrees',
        postStocksCount: 0,
      });
      continue;
    }

    // Same ticker exists in master at a DIFFERENT market → market is wrong → delete.
    const otherMarket = masterByTicker.get(stock.ticker);
    if (otherMarket && otherMarket.length > 0) {
      plan.push({
        stock,
        bucket: 'B_delete',
        reason: `wrong-market (master has ${stock.ticker} in ${otherMarket.map((m) => m.market).join(',')})`,
        postStocksCount: 0,
      });
      continue;
    }

    // Not in master at all → delete.
    plan.push({
      stock,
      bucket: 'B_delete',
      reason: 'not-in-master',
      postStocksCount: 0,
    });
  }

  // Step 4: count post_stocks linkages for non-noop rows (sequential is fine).
  for (const p of plan) {
    if (p.bucket === 'noop') continue;
    const { count } = await supabase
      .from('post_stocks')
      .select('*', { count: 'exact', head: true })
      .eq('stock_id', p.stock.id);
    p.postStocksCount = count ?? 0;
  }

  // Step 5: report.
  const groupBy = (b: PlanRow['bucket']) => plan.filter((p) => p.bucket === b);
  log(`bucket A (remap):     ${groupBy('A_remap').length}`);
  log(`bucket B (delete):    ${groupBy('B_delete').length}`);
  log(`bucket C (rename):    ${groupBy('C_rename').length}`);
  log(`bucket   (noop):      ${groupBy('noop').length} (canonical rows skipped)`);

  for (const p of plan) {
    if (p.bucket === 'noop') continue;
    const tag = `[${p.bucket}]`;
    const line = `${tag.padEnd(15)} ${p.stock.ticker.padEnd(15)} name="${p.stock.name}" market=${p.stock.market} post_stocks=${p.postStocksCount} (${p.reason})`;
    if (p.bucket === 'A_remap') log(`${line} → remap to ${p.remapTo}`);
    else if (p.bucket === 'C_rename') log(`${line} → rename "${p.stock.name}" → "${p.newName}"`);
    else log(line);
  }

  // Step 6: apply if asked.
  if (!apply) {
    log('DRY-RUN complete. Re-run with --apply to perform DB writes.');
    fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf-8');
    log(`log written to ${path.relative(process.cwd(), logPath)}`);
    return;
  }

  log('--- APPLYING CHANGES ---');

  // Bucket A: remap then delete orphan.
  for (const p of plan.filter((x) => x.bucket === 'A_remap')) {
    const { data: target } = await supabase
      .from('stocks')
      .select('id')
      .eq('ticker', p.remapTo!)
      .maybeSingle();
    if (!target) {
      // Target doesn't exist yet — it'll be created on next user-driven import
      // for that ticker. Drop the orphan now.
      log(`  [A_remap] target ${p.remapTo} not yet in stocks; deleting source ${p.stock.ticker}`);
      await supabase.from('post_stocks').delete().eq('stock_id', p.stock.id);
      await supabase.from('stocks').delete().eq('id', p.stock.id);
      continue;
    }
    // Move every post_stocks row from old → new. Conflict on (post_id, stock_id)
    // unique constraint can happen if BOTH the source and the canonical were
    // already linked to the same post; in that case drop the duplicate source.
    const { data: existingLinks } = await supabase
      .from('post_stocks')
      .select('post_id')
      .eq('stock_id', p.stock.id);
    for (const row of (existingLinks ?? []) as Array<{ post_id: string }>) {
      const { error: updErr } = await supabase
        .from('post_stocks')
        .update({ stock_id: target.id })
        .eq('post_id', row.post_id)
        .eq('stock_id', p.stock.id);
      if (updErr) {
        await supabase
          .from('post_stocks')
          .delete()
          .eq('post_id', row.post_id)
          .eq('stock_id', p.stock.id);
      }
    }
    await supabase.from('stocks').delete().eq('id', p.stock.id);
    log(`  [A_remap] ${p.stock.ticker} → ${p.remapTo} done`);
  }

  // Bucket B: cascade-delete linkages then the stock row.
  for (const p of plan.filter((x) => x.bucket === 'B_delete')) {
    await supabase.from('post_stocks').delete().eq('stock_id', p.stock.id);
    await supabase.from('stocks').delete().eq('id', p.stock.id);
    log(`  [B_delete] ${p.stock.ticker} (${p.stock.name}) deleted [${p.reason}]`);
  }

  // Bucket C: just update the name.
  for (const p of plan.filter((x) => x.bucket === 'C_rename')) {
    const { error } = await supabase
      .from('stocks')
      .update({ name: p.newName })
      .eq('id', p.stock.id);
    if (error) log(`  [C_rename] ${p.stock.ticker} FAILED: ${error.message}`);
    else log(`  [C_rename] ${p.stock.ticker} name → "${p.newName}"`);
  }

  log('--- APPLY DONE ---');
  fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf-8');
  log(`log written to ${path.relative(process.cwd(), logPath)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

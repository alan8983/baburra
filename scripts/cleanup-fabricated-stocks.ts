#!/usr/bin/env tsx
/**
 * Cleanup of fabricated/mis-named stocks rows produced before resolveStock
 * was wired in. Three buckets per the openspec design (D3):
 *
 *   A. Remap to canonical: ticker has a known correct equivalent. Rewrite
 *      post_stocks.stock_id to the canonical row, then delete the orphan.
 *   B. Pure delete: no canonical equivalent exists OR the "ticker" was never
 *      tradable (馮君, CHROME, MODEL 3, SPACEX, ^TWII, DI0T). Cascade-delete
 *      post_stocks linkages, then delete the stock row.
 *   C. Re-canonicalize name only: ticker is valid but stocks.name is wrong
 *      (e.g. 2353.TW: "宏捷" → "宏碁"). UPDATE name to the master value.
 *
 * Defaults to --dry-run; --apply mutates. Logs every action to
 *   scripts/cleanup-fabricated-stocks.log
 *
 * Idempotent: a second --apply run after the first produces no further DB
 * changes (every targeted row is gone or already canonical).
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

interface SuspectStock {
  id: string;
  ticker: string;
  name: string;
  market: string;
}

interface PlanRow {
  stock: SuspectStock;
  bucket: 'A_remap' | 'B_delete' | 'C_rename' | 'unhandled';
  /** For bucket A: canonical ticker to remap to. */
  remapTo?: string;
  /** For bucket C: new name from master. */
  newName?: string;
  /** Number of post_stocks rows referencing this stock. */
  postStocksCount: number;
}

// Hardcoded bucket A remap table — wrong/oversize ticker → canonical equivalent.
// Reviewed 2026-04-25 against current production data. Add new entries here
// before running --apply if the dry-run surfaces additional cases.
const REMAP: Record<string, string> = {
  // Long-form US "tickers" that are really company names → canonical ticker
  PALANTIR: 'PLTR',
  PANTR: 'PLTR',
  PNTIR: 'PLTR',
  CLOUDFLARE: 'NET',
  CLOUDFRE: 'NET',
  FLARE: 'NET',
  FLCL: 'NET',
  BROADCOM: 'AVGO',
  BRCM: 'AVGO',
  CONFLUENT: 'CFLT', // requires manual_us_master.json override
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
  AIRBUS: 'EADSY', // requires manual_us_master.json override
  ORACLE: 'ORCL',
  // Bare numeric TW codes → .TW canonical form
  '2357': '2357.TW',
  '2408': '2408.TW',
  '3596': '2408.TW' /* placeholder; verify */, // intentionally absent — see ad-hoc adjustments below
};
// Pure numeric .TW twin remaps generated from the SQL audit at proposal-time.
// "2408" → "2408.TW" follows from `EXISTS (twin)` cross-check.
const TW_DOT_TWINS = ['2357', '2408', '3596', '4966', '566', '6531', '8299'];
for (const code of TW_DOT_TWINS) {
  REMAP[code] = `${code}.TW`;
}
// 3596 entry above was a typo in the initial draft; clean up:
delete (REMAP as Record<string, string | undefined>)['3596'];
REMAP['3596'] = '3596.TW';

// "Pure orphan" tickers: no canonical equivalent exists or the underlying
// company is private/non-traded/conceptual. These get deleted.
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
  'VMWARE', // acquired by Broadcom 2023; AVGO already canonical
  '^TWII', // index, not a stock
  'DI0T', // transcription artifact
  '366',
  '366 E',
  '569',
  // The 馮君 group — 9 fabrications. Pure deletes: every (馮君, <ticker>) pair.
  // Identified by name match below rather than enumerated tickers, so we
  // don't accidentally delete a real ticker that happened to overlap.
]);

const SUSPECT_NAMES_TO_DELETE = new Set<string>(['馮君']);

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

  // Step 1: identify suspects via the same SQL as the proposal.
  const { data: suspectStocksRaw, error: suspectErr } = await supabase
    .from('stocks')
    .select('id, ticker, name, market');
  if (suspectErr) throw suspectErr;
  const allStocks = (suspectStocksRaw ?? []) as SuspectStock[];
  log(`stocks total: ${allStocks.length}`);

  // Build name-frequency map for the duplicate-name-group rule.
  const nameFreq = new Map<string, number>();
  for (const s of allStocks) {
    if (!s.name) continue;
    nameFreq.set(s.name.trim(), (nameFreq.get(s.name.trim()) ?? 0) + 1);
  }

  const suspects = allStocks.filter((s) => {
    // (a) US "ticker" longer than 5 chars
    if (s.market === 'US' && s.ticker.length > 5) return true;
    // (b) TW non-numeric or missing-suffix
    if (s.market === 'TW' && !s.ticker.endsWith('.TW') && !/^\d{4,6}[A-Z]?$/.test(s.ticker)) return true;
    if (s.market === 'TW' && !s.ticker.endsWith('.TW') && /^\d{4,6}[A-Z]?$/.test(s.ticker)) return true; // missing-suffix
    // (c) name in a duplicate-name group of 3+ tickers (worst hallucinations)
    if (s.name && (nameFreq.get(s.name.trim()) ?? 0) >= 3) return true;
    // (d) explicit name-based blacklist
    if (s.name && SUSPECT_NAMES_TO_DELETE.has(s.name.trim())) return true;
    // (e) explicit ticker-based blacklist
    if (PURE_DELETE.has(s.ticker)) return true;
    // (f) named-with-its-own-ticker (e.g. "366" with name "366" — placeholder)
    if (s.ticker === s.name) return true;
    return false;
  });

  log(`suspect rows: ${suspects.length}`);

  // Step 2: classify each suspect into a bucket.
  const plan: PlanRow[] = [];
  for (const stock of suspects) {
    // Count post_stocks linkages (small N, sequential is fine).
    const { count } = await supabase
      .from('post_stocks')
      .select('*', { count: 'exact', head: true })
      .eq('stock_id', stock.id);
    const postStocksCount = count ?? 0;

    // Bucket B (delete): hard blacklist by name or ticker.
    if (
      (stock.name && SUSPECT_NAMES_TO_DELETE.has(stock.name.trim())) ||
      PURE_DELETE.has(stock.ticker)
    ) {
      plan.push({ stock, bucket: 'B_delete', postStocksCount });
      continue;
    }

    // Bucket A (remap): explicit map.
    const remapTo = REMAP[stock.ticker.toUpperCase()];
    if (remapTo) {
      plan.push({ stock, bucket: 'A_remap', remapTo, postStocksCount });
      continue;
    }

    // Bucket C (rename only): ticker is in master with a different (correct) name.
    const { data: master } = await supabase
      .from('stocks_master')
      .select('ticker, name')
      .eq('ticker', stock.ticker)
      .maybeSingle();
    if (master && master.name && master.name !== stock.name) {
      plan.push({ stock, bucket: 'C_rename', newName: master.name, postStocksCount });
      continue;
    }

    // Anything else — log for human review. The duplicate-name-group catch
    // above will surface "First Financial Holding" stocks; if the master has
    // them with the right names, they fall into bucket C; otherwise unhandled.
    plan.push({ stock, bucket: 'unhandled', postStocksCount });
  }

  // Step 3: report.
  const groupBy = (b: PlanRow['bucket']) => plan.filter((p) => p.bucket === b);
  log(`bucket A (remap):     ${groupBy('A_remap').length}`);
  log(`bucket B (delete):    ${groupBy('B_delete').length}`);
  log(`bucket C (rename):    ${groupBy('C_rename').length}`);
  log(`bucket - (unhandled): ${groupBy('unhandled').length}`);

  for (const p of plan) {
    const tag = `[${p.bucket}]`;
    const line = `${tag.padEnd(15)} ${p.stock.ticker.padEnd(15)} name="${p.stock.name}" market=${p.stock.market} post_stocks=${p.postStocksCount}`;
    if (p.bucket === 'A_remap') log(`${line} → remap to ${p.remapTo}`);
    else if (p.bucket === 'C_rename') log(`${line} → rename "${p.stock.name}" → "${p.newName}"`);
    else log(line);
  }

  // Step 4: apply if asked.
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
      // Target doesn't exist yet — it will once the next import for that
      // ticker happens. For cleanup, we'll just delete the orphan; the next
      // user-driven import will create a fresh, correctly-named row.
      log(`  [A_remap] target ${p.remapTo} not yet in stocks; deleting source ${p.stock.ticker}`);
      await supabase.from('post_stocks').delete().eq('stock_id', p.stock.id);
      await supabase.from('stocks').delete().eq('id', p.stock.id);
      continue;
    }
    // Move every post_stocks row from old → new. ON CONFLICT (post_id, stock_id)
    // means a row may already exist for that pair — drop the dupe in that case.
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
        // Most likely cause: a (post_id, target.id) row already exists →
        // unique-constraint violation. Drop the source row instead.
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
    log(`  [B_delete] ${p.stock.ticker} (${p.stock.name}) deleted`);
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

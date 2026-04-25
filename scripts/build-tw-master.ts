#!/usr/bin/env tsx
/**
 * Build the TW (Taiwan) ticker master from TWSE's ISIN listing pages.
 *
 * Output: src/infrastructure/data/tw_master.json
 *
 *   [{ ticker: '2330.TW', name: '台積電', market: 'TW', source: 'twse' }, ...]
 *
 * Source pages (Big5-encoded HTML, no auth, stable URLs):
 *   - 上市 (TWSE main board): https://isin.twse.com.tw/isin/C_public.jsp?strMode=2
 *   - 上櫃 (TPEX OTC):       https://isin.twse.com.tw/isin/C_public.jsp?strMode=4
 *
 * Why ISIN and not TWSE/TPEX OpenAPIs:
 *   - TPEX's openapi.tpex.org.tw returns 403 (Cloudflare-blocked) from server fetches.
 *   - ISIN.twse.com.tw covers both boards in a single, stable HTML format.
 *
 * Idempotent: re-running overwrites tw_master.json. Safe to re-run any time.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface MasterEntry {
  ticker: string;
  name: string;
  market: 'TW';
  source: 'twse' | 'tpex';
}

const ISIN_URL = (strMode: 2 | 4) =>
  `https://isin.twse.com.tw/isin/C_public.jsp?strMode=${strMode}`;

const OUT_PATH = path.join(__dirname, '..', 'src', 'infrastructure', 'data', 'tw_master.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchBig5(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('big5').decode(buf);
}

/**
 * The ISIN HTML uses fixed-format rows. Each tradable row's first <td> contains
 * "<code>　<name>" separated by an ideographic space (U+3000). Header rows (e.g.
 * 股票, ETF, 受益證券) have a single <td> with `colspan` and no embedded　space.
 *
 * We extract by finding all `<tr>` blocks, taking the first `<td>` of each, and
 * matching the "code　name" pattern. Anything else is skipped.
 */
function parseIsinHtml(
  html: string,
  source: 'twse' | 'tpex'
): { entries: MasterEntry[]; skippedTrs: number } {
  const entries: MasterEntry[] = [];
  let skippedTrs = 0;

  // Robust matching against the table — split on </tr> and inspect each chunk.
  const trChunks = html.split(/<\/tr>/i);
  for (const chunk of trChunks) {
    // Pull the first <td>...</td> contents from this row.
    const tdMatch = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (!tdMatch) {
      skippedTrs++;
      continue;
    }
    // Strip inner tags (e.g. <font>, <b>) and decode the few entities ISIN uses.
    const tdText = tdMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    // "<code>　<name>" with U+3000 ideographic space.
    const m = tdText.match(/^([0-9A-Za-z]{4,8})　(.+)$/);
    if (!m) {
      skippedTrs++;
      continue;
    }
    const code = m[1].trim();
    const name = m[2].trim();
    if (!/^[0-9A-Za-z]{4,8}$/.test(code) || !name) {
      skippedTrs++;
      continue;
    }
    // Only keep what resolveStock would plausibly need to validate:
    //   - 4-digit ordinary stocks (1234)
    //   - 5-digit ETFs starting with 00 (00636)
    //   - Letter-suffixed ETF tranches (00400A, 00631L) — codes ≤ 6 chars
    // Drop warrants (6-digit numeric, often starting with 0/7/8) and preferred
    // shares (4-digit + Z/Y suffix). The signal on warrants is in the name —
    // they always contain 購/售 (call/put) or 牛/熊 (bull/bear).
    // Tradable instruments we care about:
    //   - 4-digit ordinary (1234, 2330, 0050)
    //   - 5-digit ETFs (00636, 00688)
    //   - 5/6-digit + letter tranches (00400A, 00688L, 00981A)
    //   - 6-digit 00xxxx ETFs (006204, 009816)
    // Excluded (handled by code-shape, with warrant-name filter as belt-and-suspenders):
    //   - 6-digit warrants (most start with 02-08xxx, names contain 購/售)
    //   - 7-digit warrants (names contain 購/售)
    const codeIsOrdinary = /^\d{4}$/.test(code);
    const codeIsEtf5 = /^00\d{3}$/.test(code);
    const codeIsEtfTranche5 = /^00\d{3}[A-Z]$/.test(code);
    const codeIsEtf6 = /^00\d{4}$/.test(code);
    const codeIsEtfTranche6 = /^00\d{4}[A-Z]$/.test(code);
    if (!codeIsOrdinary && !codeIsEtf5 && !codeIsEtfTranche5 && !codeIsEtf6 && !codeIsEtfTranche6) {
      skippedTrs++;
      continue;
    }
    // Belt-and-suspenders: drop warrants by name keyword.
    if (/購\d|售\d|牛\d|熊\d/.test(name)) {
      skippedTrs++;
      continue;
    }
    entries.push({
      ticker: `${code}.TW`,
      name,
      market: 'TW',
      source,
    });
  }

  return { entries, skippedTrs };
}

async function main() {
  console.log('[tw-master] fetching TWSE 上市 + 上櫃 from ISIN.twse.com.tw…');

  const [twseHtml, tpexHtml] = await Promise.all([fetchBig5(ISIN_URL(2)), fetchBig5(ISIN_URL(4))]);

  const twse = parseIsinHtml(twseHtml, 'twse');
  const tpex = parseIsinHtml(tpexHtml, 'tpex');

  console.log(
    `[twse 上市] parsed ${twse.entries.length} entries, skipped ${twse.skippedTrs} non-data rows`
  );
  console.log(
    `[tpex 上櫃] parsed ${tpex.entries.length} entries, skipped ${tpex.skippedTrs} non-data rows`
  );

  // Dedup by ticker — TWSE wins if a code appears in both.
  const byTicker = new Map<string, MasterEntry>();
  for (const e of tpex.entries) byTicker.set(e.ticker, e);
  for (const e of twse.entries) byTicker.set(e.ticker, e);

  const merged = Array.from(byTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  console.log(
    `[tw-master] wrote ${merged.length} entries to ${path.relative(process.cwd(), OUT_PATH)}`
  );

  // Sanity-check well-known tickers from both boards.
  const knowns: Record<string, string> = {
    '2330.TW': '台積電 (TWSE)',
    '2317.TW': '鴻海 (TWSE)',
    '2454.TW': '聯發科 (TWSE)',
    '0050.TW': '元大台灣50 (TWSE ETF)',
    '6533.TW': '晶心科 (TPEX)',
    '8086.TW': '宏捷科 (TPEX) — important for 2353/8086 disambiguation',
  };
  for (const [t, label] of Object.entries(knowns)) {
    const hit = merged.find((e) => e.ticker === t);
    console.log(`           sanity: ${t} (${label}) → ${hit ? hit.name : '(MISSING)'}`);
  }
  // The critical fix-target: 2353.TW must resolve to 宏碁 (Acer), not 宏捷.
  const t2353 = merged.find((e) => e.ticker === '2353.TW');
  console.log(
    `           sanity: 2353.TW (should be 宏碁/Acer, NOT 宏捷) → ${t2353 ? t2353.name : '(MISSING)'}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[tw-master] failed:', e);
    process.exit(1);
  });

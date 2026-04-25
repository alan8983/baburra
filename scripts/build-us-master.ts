#!/usr/bin/env tsx
/**
 * Build the US ticker master from NASDAQ Trader's official symbol directory.
 *
 * Output: src/infrastructure/data/us_master.json
 *
 *   [{ ticker: 'AAPL', name: 'Apple Inc.', market: 'US', source: 'tiingo' }, ...]
 *   ('source' is labeled 'tiingo' in the master schema for the US side; the
 *    actual feed used here is NASDAQ Trader, which is the same authoritative
 *    list Tiingo and IEX rebadge. Kept under the 'tiingo' source label so the
 *    DB CHECK constraint stays narrow.)
 *
 * Sources (pipe-delimited TXT, no auth, public):
 *   - https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt   (NASDAQ-listed)
 *   - https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt    (NYSE/AMEX/ARCA/BATS)
 *
 * Dropped:
 *   - Test issues (Test Issue=Y)
 *   - Anything with non-ticker characters (warrants, units, rights — codes
 *     ending in W/U/R or containing '$' or '.').
 *
 * Idempotent: re-running overwrites us_master.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface MasterEntry {
  ticker: string;
  name: string;
  market: 'US';
  source: 'tiingo';
}

const NASDAQ_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt';
const OTHER_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt';

const OUT_PATH = path.join(__dirname, '..', 'src', 'infrastructure', 'data', 'us_master.json');

const UA = 'Mozilla/5.0 baburra-stocks-master-builder/1.0';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Strip the trailing security-type qualifier from a name. Inputs look like:
 *   "Apple Inc. - Common Stock"
 *   "Tesla, Inc. - Common Stock"
 *   "Microsoft Corporation - Common Stock"
 *   "SPDR S&P 500 ETF Trust"
 * The "- <type>" suffix is noise for our purposes.
 */
function cleanName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  // Strip " - Common Stock", " - Class A Ordinary Shares", etc. Conservative —
  // only strips when the dash-separated tail looks like a security descriptor.
  const m = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (m && /Common Stock|Ordinary Shares|Depositary|Preferred|Units?|Rights?|Warrants?|ETF/i.test(m[2])) {
    return m[1];
  }
  return trimmed;
}

/**
 * Heuristic: is this code a tradable ticker we want resolveStock to accept?
 * NASDAQ Trader includes warrants, units, rights, preferred shares, etc. — we
 * keep equity + ETF and drop the rest.
 */
function isTradableTicker(symbol: string, etf: string): boolean {
  if (!/^[A-Z]{1,5}$/.test(symbol)) return false; // exclude AAPL.W, BRK.A-style codes
  if (symbol.length === 5 && /[WURP]$/.test(symbol)) {
    // W=warrant, U=unit, R=right, P=preferred — drop the obvious non-equity tail.
    // ETFs fortunately do NOT use these suffixes (Y can be ADR, that's fine — keep).
    if (etf !== 'Y') return false;
  }
  return true;
}

interface ParsedRow {
  ticker: string;
  name: string;
  isTest: boolean;
  isEtf: boolean;
}

interface ColumnMap {
  symbol: number;
  name: number;
  test: number;
  etf: number;
}

function parsePipeFile(content: string, cols: ColumnMap): ParsedRow[] {
  const lines = content.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let headerSeen = false;
  for (const line of lines) {
    if (!line || line.startsWith('File Creation Time')) continue;
    const fields = line.split('|');
    if (fields.length < 4) continue;
    if (!headerSeen) {
      // First non-empty data line is the header row (e.g. "Symbol|Security Name|...").
      headerSeen = true;
      continue;
    }
    const symbol = fields[cols.symbol]?.trim();
    const name = fields[cols.name]?.trim();
    const isTest = (fields[cols.test] ?? 'N').trim() === 'Y';
    const isEtf = (fields[cols.etf] ?? 'N').trim() === 'Y';
    if (!symbol || !name) continue;
    rows.push({ ticker: symbol, name, isTest, isEtf });
  }
  return rows;
}

async function main() {
  console.log('[us-master] fetching NASDAQ + NYSE/Other listings…');

  const [nasdaqText, otherText] = await Promise.all([fetchText(NASDAQ_URL), fetchText(OTHER_URL)]);

  // nasdaqlisted.txt header:
  //   Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  const nasdaqRows = parsePipeFile(nasdaqText, { symbol: 0, name: 1, test: 3, etf: 6 });

  // otherlisted.txt header:
  //   ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  const otherRows = parsePipeFile(otherText, { symbol: 0, name: 1, test: 6, etf: 4 });

  console.log(`[nasdaq]  ${nasdaqRows.length} raw rows`);
  console.log(`[nyse]    ${otherRows.length} raw rows`);

  const all = [...nasdaqRows, ...otherRows];
  const filtered = all.filter((r) => {
    if (r.isTest) return false;
    const etfFlag = r.isEtf ? 'Y' : 'N';
    return isTradableTicker(r.ticker, etfFlag);
  });

  const byTicker = new Map<string, MasterEntry>();
  for (const r of filtered) {
    // First write wins (NASDAQ comes first; NYSE second). For the rare ticker
    // that appears in both files, NASDAQ-listed entry is canonical.
    if (byTicker.has(r.ticker)) continue;
    byTicker.set(r.ticker, {
      ticker: r.ticker,
      name: cleanName(r.name),
      market: 'US',
      source: 'tiingo',
    });
  }

  const merged = Array.from(byTicker.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  console.log(
    `[us-master] wrote ${merged.length} entries to ${path.relative(process.cwd(), OUT_PATH)}`
  );

  // Sanity check well-known tickers.
  const knowns = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AVGO', 'PLTR', 'NET', 'CFLT', 'MRVL', 'CRM', 'NOW', 'STLA', 'STX', 'GLW', 'CELH', 'PI', 'PYPL', 'ORCL'];
  for (const t of knowns) {
    const hit = merged.find((e) => e.ticker === t);
    console.log(`           sanity: ${t} → ${hit ? hit.name : '(MISSING)'}`);
  }
  // Spot-check that obvious hallucinations are NOT in the master.
  const halluc = ['CHROME', 'YOUTUBE', 'CLAUDE', 'SPACEX', 'PALANTIR', 'CLOUDFLARE', 'MARVELL', 'CONFLUENT', 'PNTIR', 'PANTR', 'CLOUDFRE', 'FLCL', 'SFDC'];
  for (const t of halluc) {
    const hit = merged.find((e) => e.ticker === t);
    console.log(`           halluc-check: ${t} → ${hit ? `(LEAKED: ${hit.name})` : 'absent ✓'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[us-master] failed:', e);
    process.exit(1);
  });

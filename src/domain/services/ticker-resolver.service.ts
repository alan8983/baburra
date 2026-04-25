/**
 * Ticker resolver — the validation seam between AI extraction and stock upsert.
 *
 * Given a raw {ticker, market} pair from Gemini, this:
 *   1. Normalizes the ticker form (uppercase, .TW suffix on TW numerics).
 *   2. Looks it up in stocks_master.
 *   3. Returns the canonical {ticker, name, market} on hit, or null on miss.
 *
 * The canonical name OVERRIDES the AI-supplied name. This is what fixes cases
 * like 2353.TW being persisted as "宏捷" — the master says "宏碁" and we use it.
 *
 * Misses are logged at info level so we can spot-check the registry seed for
 * gaps. Misses are NOT errors; the caller drops the ticker from the post.
 *
 * Spec: openspec/specs/ai-pipeline/spec.md (invariant: registry-validated).
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';

export type ResolverMarket = 'US' | 'TW' | 'CRYPTO';

export interface ResolvedTicker {
  ticker: string;
  name: string;
  market: ResolverMarket;
}

interface MasterRow {
  ticker: string;
  name: string;
  market: ResolverMarket;
}

/**
 * In-memory positive cache: ticker → master row. Keyed by canonical ticker.
 * The master is mostly read-only at runtime (refreshed via the seed scripts),
 * so caching forever is safe within a single process. Reset only on the
 * exported clearTickerResolverCache() — used by tests.
 */
const cache = new Map<string, ResolvedTicker | null>();

export function clearTickerResolverCache(): void {
  cache.clear();
}

/**
 * Normalize a raw ticker for the given market.
 *
 *   - Uppercase, trimmed.
 *   - For market='TW': all-numeric 4–6 char codes get the '.TW' suffix.
 *     Non-numeric TW market tickers (e.g. 'ASUS', 'UMC') are NOT normalized
 *     here — they pass through and the master lookup will reject them, since
 *     real Taiwan tickers are always numeric.
 *   - For market='US' / 'CRYPTO': uppercase only.
 *
 * Returns null if the input is empty after trimming.
 */
export function normalizeTicker(rawTicker: string, market: ResolverMarket): string | null {
  if (!rawTicker) return null;
  const trimmed = rawTicker.trim().toUpperCase();
  if (!trimmed) return null;

  if (market === 'TW') {
    // Strip any existing .TW suffix to canonicalize, then re-add for numerics.
    const stripped = trimmed.endsWith('.TW') ? trimmed.slice(0, -3) : trimmed;
    if (/^\d{4,6}[A-Z]?$/.test(stripped)) {
      return `${stripped}.TW`;
    }
    return stripped; // non-numeric — will miss in master lookup, that's intended.
  }

  return trimmed;
}

/**
 * Look up a single ticker in stocks_master. Returns the canonical row on hit,
 * null on miss.
 *
 * The (ticker, market) pair is the lookup key — the same ticker string CAN
 * legitimately exist in two markets (e.g. 'STX' is both Seagate Technology
 * (US) and Stellar (CRYPTO)), and we want each market to be unambiguous.
 */
export async function resolveStock(
  rawTicker: string,
  market: ResolverMarket
): Promise<ResolvedTicker | null> {
  const ticker = normalizeTicker(rawTicker, market);
  if (!ticker) return null;

  const cacheKey = `${market}::${ticker}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stocks_master')
    .select('ticker, name, market')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();

  if (error) {
    // Connection-level errors propagate; the pipeline can decide whether to
    // skip-or-fail. Don't cache transient DB failures.
    throw new Error(
      `[ticker-resolver] master lookup failed for ${ticker} (${market}): ${error.message}`
    );
  }

  if (!data) {
    cache.set(cacheKey, null);
    console.info(`[ticker-resolver] dropped ${ticker} (${market}) — not in stocks_master`);
    return null;
  }

  const row = data as MasterRow;
  const resolved: ResolvedTicker = {
    ticker: row.ticker,
    name: row.name,
    market: row.market,
  };
  cache.set(cacheKey, resolved);
  return resolved;
}

/**
 * Bulk-resolve N tickers in one DB round-trip. Used by the import pipeline so
 * a post with 15 tickers doesn't fan out to 15 sequential master queries.
 *
 * The returned map is keyed by the ORIGINAL raw ticker so callers can preserve
 * their input order/mapping when they later need the per-ticker sentiment.
 */
export async function resolveStocksBatch(
  rawTickers: Array<{ ticker: string; market: ResolverMarket }>
): Promise<Map<string, ResolvedTicker | null>> {
  const out = new Map<string, ResolvedTicker | null>();
  if (rawTickers.length === 0) return out;

  // Normalize and cache-check.
  const toFetch: Array<{ raw: string; canonical: string; market: ResolverMarket }> = [];
  for (const { ticker, market } of rawTickers) {
    const canonical = normalizeTicker(ticker, market);
    if (!canonical) {
      out.set(ticker, null);
      continue;
    }
    const cacheKey = `${market}::${canonical}`;
    if (cache.has(cacheKey)) {
      out.set(ticker, cache.get(cacheKey) ?? null);
      continue;
    }
    toFetch.push({ raw: ticker, canonical, market });
  }

  if (toFetch.length === 0) return out;

  // Group fetches by market — Postgres OR can match (ticker IN list AND market = ?)
  // for each market separately, then we union the results.
  const byMarket = new Map<ResolverMarket, string[]>();
  for (const { canonical, market } of toFetch) {
    const arr = byMarket.get(market) ?? [];
    arr.push(canonical);
    byMarket.set(market, arr);
  }

  const supabase = createAdminClient();
  const fetched = new Map<string, ResolvedTicker>();
  for (const [market, tickers] of byMarket.entries()) {
    const { data, error } = await supabase
      .from('stocks_master')
      .select('ticker, name, market')
      .eq('market', market)
      .in('ticker', tickers);
    if (error) {
      throw new Error(`[ticker-resolver] batch lookup failed (${market}): ${error.message}`);
    }
    for (const row of (data ?? []) as MasterRow[]) {
      fetched.set(`${market}::${row.ticker}`, {
        ticker: row.ticker,
        name: row.name,
        market: row.market,
      });
    }
  }

  for (const { raw, canonical, market } of toFetch) {
    const cacheKey = `${market}::${canonical}`;
    const resolved = fetched.get(cacheKey) ?? null;
    cache.set(cacheKey, resolved);
    if (!resolved) {
      console.info(`[ticker-resolver] dropped ${canonical} (${market}) — not in stocks_master`);
    }
    out.set(raw, resolved);
  }

  return out;
}

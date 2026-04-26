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
 * Two lookup passes:
 *   1. Exact (ticker, market) — direct match.
 *   2. Alias fallback (ticker IN stocks_master.aliases AND market = $market)
 *      — handles English abbreviations and ADR/dual-listing cases. E.g.
 *      `resolveStock('UMC', 'TW')` falls back to alias and resolves to
 *      `2303.TW` (聯電), the TW primary listing for United Microelectronics.
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

  // Pass 1: direct (ticker, market) match.
  const { data: direct, error: directErr } = await supabase
    .from('stocks_master')
    .select('ticker, name, market')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();
  if (directErr) {
    // Connection-level errors propagate; don't cache transient failures.
    throw new Error(
      `[ticker-resolver] master lookup failed for ${ticker} (${market}): ${directErr.message}`
    );
  }
  if (direct) {
    const row = direct as MasterRow;
    const resolved: ResolvedTicker = {
      ticker: row.ticker,
      name: row.name,
      market: row.market,
    };
    cache.set(cacheKey, resolved);
    return resolved;
  }

  // Pass 2: alias fallback within the same market.
  const { data: aliased, error: aliasErr } = await supabase
    .from('stocks_master')
    .select('ticker, name, market')
    .eq('market', market)
    .contains('aliases', [ticker])
    .limit(1)
    .maybeSingle();
  if (aliasErr) {
    throw new Error(
      `[ticker-resolver] alias lookup failed for ${ticker} (${market}): ${aliasErr.message}`
    );
  }
  if (aliased) {
    const row = aliased as MasterRow;
    const resolved: ResolvedTicker = {
      ticker: row.ticker,
      name: row.name,
      market: row.market,
    };
    cache.set(cacheKey, resolved);
    console.info(
      `[ticker-resolver] resolved ${ticker} (${market}) via alias → ${row.ticker} ${row.name}`
    );
    return resolved;
  }

  cache.set(cacheKey, null);
  console.info(`[ticker-resolver] dropped ${ticker} (${market}) — not in stocks_master`);
  return null;
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
  // Two passes per market: direct ticker hits first, then alias fallback for
  // anything still unresolved. Each pass is one round-trip per market.
  const directByKey = new Map<string, ResolvedTicker>();
  for (const [market, tickers] of byMarket.entries()) {
    const { data, error } = await supabase
      .from('stocks_master')
      .select('ticker, name, market')
      .eq('market', market)
      .in('ticker', tickers);
    if (error) {
      throw new Error(`[ticker-resolver] batch direct lookup failed (${market}): ${error.message}`);
    }
    for (const row of (data ?? []) as MasterRow[]) {
      directByKey.set(`${market}::${row.ticker}`, {
        ticker: row.ticker,
        name: row.name,
        market: row.market,
      });
    }
  }

  // Pass 2: any (canonical, market) still missing → alias lookup.
  // `aliases && ARRAY[$1, $2, …]` (overlap) returns rows whose aliases array
  // intersects the input set; the row's ticker is the canonical for whichever
  // alias matched.
  const aliasByMarket = new Map<ResolverMarket, string[]>();
  for (const { canonical, market } of toFetch) {
    if (directByKey.has(`${market}::${canonical}`)) continue;
    const arr = aliasByMarket.get(market) ?? [];
    arr.push(canonical);
    aliasByMarket.set(market, arr);
  }

  // Map: alias (uppercased) → canonical row. Use aliases array intersection
  // (`&&`) to find any row whose aliases contain at least one of the inputs.
  const aliasResolved = new Map<string, ResolvedTicker>();
  for (const [market, aliases] of aliasByMarket.entries()) {
    if (aliases.length === 0) continue;
    const { data, error } = await supabase
      .from('stocks_master')
      .select('ticker, name, market, aliases')
      .eq('market', market)
      .overlaps('aliases', aliases);
    if (error) {
      throw new Error(`[ticker-resolver] batch alias lookup failed (${market}): ${error.message}`);
    }
    for (const row of (data ?? []) as Array<MasterRow & { aliases?: string[] }>) {
      const resolved: ResolvedTicker = {
        ticker: row.ticker,
        name: row.name,
        market: row.market,
      };
      for (const alias of row.aliases ?? []) {
        const aliasUp = alias.toUpperCase();
        if (aliases.includes(aliasUp)) {
          aliasResolved.set(`${market}::${aliasUp}`, resolved);
        }
      }
    }
  }

  for (const { raw, canonical, market } of toFetch) {
    const cacheKey = `${market}::${canonical}`;
    const resolved = directByKey.get(cacheKey) ?? aliasResolved.get(cacheKey) ?? null;
    cache.set(cacheKey, resolved);
    if (!resolved) {
      console.info(`[ticker-resolver] dropped ${canonical} (${market}) — not in stocks_master`);
    } else if (aliasResolved.has(cacheKey) && !directByKey.has(cacheKey)) {
      console.info(
        `[ticker-resolver] resolved ${canonical} (${market}) via alias → ${resolved.ticker} ${resolved.name}`
      );
    }
    out.set(raw, resolved);
  }

  return out;
}

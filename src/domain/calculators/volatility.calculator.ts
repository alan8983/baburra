/**
 * Volatility calculator
 *
 * Computes per-(ticker, period, asOfDate) realized volatility (σ) of overlapping
 * N-day returns and exposes a `getVolatilityThreshold` helper that yields the 1σ
 * dynamic threshold used by win-rate classification.
 *
 * Design notes (see openspec/changes/dynamic-volatility-threshold/design.md):
 * - σ is the sample stdev of overlapping N-day returns over a lookback window
 *   ending strictly *before* asOfDate (no look-ahead).
 * - Lookback windows scale with period: 5d/30d → 1y, 90d → 2y, 365d → 3y.
 * - No √T scaling; we estimate σ at the horizon we actually classify against.
 * - IPO fallback: if the ticker has insufficient history, fall back to the
 *   same-market index (TWSE weighted index for TW, S&P 500 for US/CRYPTO).
 *   HK is unsupported and throws.
 * - Pure math (`calculateRealizedVolatility`) is decoupled from I/O. The async
 *   `getVolatilityThreshold` takes an injected `VolatilityProvider` so it is
 *   trivially testable with fakes.
 * - Results are cached in-memory by `(ticker, periodDays, asOfDate-YYYY-MM-DD)`.
 */

export type PeriodDays = 5 | 30 | 90 | 365;

export interface PriceSeriesPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export type Market = 'TW' | 'US' | 'CRYPTO' | 'HK';

export interface VolatilityProvider {
  /** Return raw close-price series for `ticker` between `from` and `to` (inclusive). */
  getSeries(ticker: string, opts: { from: string; to: string }): Promise<PriceSeriesPoint[]>;
  /** Return the market the ticker belongs to. */
  getMarket(ticker: string): Promise<Market | null>;
}

export interface VolatilityResult {
  /** 1σ as a fractional return (e.g. 0.034 = 3.4%). */
  value: number;
  /** Whether σ was computed from the ticker's own history or from the index fallback. */
  source: 'ticker' | 'index-fallback';
  /** Number of overlapping returns used in the stdev. */
  sampleSize: number;
  /** Anchor date for which σ was computed (YYYY-MM-DD). */
  asOfDate: string;
  ticker: string;
  periodDays: PeriodDays;
}

export class UnsupportedMarketError extends Error {
  readonly market: string;
  constructor(market: string, ticker: string) {
    super(`Unsupported market "${market}" for ticker "${ticker}"`);
    this.name = 'UnsupportedMarketError';
    this.market = market;
  }
}

// ─── Lookback windows ────────────────────────────────────────────────────────

/**
 * Calendar lookback (in days) per evaluation period.
 * 5d/30d → 1 year, 90d → 2 years, 365d → 3 years.
 * The actual trading-day count falls out of the price series naturally; we add
 * a small buffer when querying so weekends/holidays don't truncate the window.
 */
const LOOKBACK_CALENDAR_DAYS: Record<PeriodDays, number> = {
  5: 365,
  30: 365,
  90: 365 * 2,
  365: 365 * 3,
};

/**
 * Minimum sample size of overlapping N-day returns required to consider the
 * ticker's own series "sufficient". Below this we fall back to the index.
 * Picked at ~85% of the expected sample count for the smallest window (252 trading days).
 */
const MIN_SAMPLE_SIZE: Record<PeriodDays, number> = {
  5: 200,
  30: 180,
  90: 350,
  365: 300,
};

export function getLookbackCalendarDays(periodDays: PeriodDays): number {
  return LOOKBACK_CALENDAR_DAYS[periodDays];
}

// ─── Index fallback mapping ──────────────────────────────────────────────────

/**
 * Same-market index ticker. Kept simple intentionally — no industry layer.
 *  - TW    → TWSE weighted index (`^TWII`)
 *  - US    → S&P 500 (`SPY`)
 *  - CRYPTO → S&P 500 (`SPY`) — imperfect but at least *some* market proxy
 */
export function getIndexTickerForMarket(market: Market): string {
  switch (market) {
    case 'TW':
      return '^TWII';
    case 'US':
    case 'CRYPTO':
      return 'SPY';
    case 'HK':
      throw new UnsupportedMarketError('HK', '<index lookup>');
  }
}

// ─── Pure math ───────────────────────────────────────────────────────────────

/**
 * Sample standard deviation (with Bessel's correction).
 * Returns 0 for series with fewer than 2 elements.
 */
function sampleStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiff = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
  return Math.sqrt(sqDiff / (values.length - 1));
}

/**
 * Compute realized N-day volatility from a price series, using overlapping
 * N-day returns: `r_i = p[i+N]/p[i] - 1`.
 *
 * Requires `prices.length > periodDays` to produce any returns. Returns `0`
 * (a degenerate threshold) if there is not enough data; the caller is expected
 * to detect insufficient history *before* calling this and to fall back to the
 * index-based path instead.
 *
 * **Pure** — no I/O, no clock, no globals. Trivially unit-testable.
 */
export function calculateRealizedVolatility(
  prices: PriceSeriesPoint[],
  periodDays: PeriodDays
): number {
  const N = periodDays;
  if (prices.length <= N) return 0;

  const returns: number[] = [];
  for (let i = 0; i + N < prices.length; i++) {
    const p0 = prices[i].close;
    const p1 = prices[i + N].close;
    if (p0 <= 0) continue;
    returns.push(p1 / p0 - 1);
  }
  return sampleStdev(returns);
}

/**
 * Number of overlapping N-day return samples that *would* be produced from a
 * given series — used for fallback detection without actually computing σ.
 */
export function countOverlappingSamples(
  prices: PriceSeriesPoint[],
  periodDays: PeriodDays
): number {
  return Math.max(0, prices.length - periodDays);
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractCalendarDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
}

/** Filter to rows strictly before `asOfDate`. The bound is exclusive. */
export function filterStrictlyBefore(
  prices: PriceSeriesPoint[],
  asOfDate: string
): PriceSeriesPoint[] {
  return prices.filter((p) => p.date < asOfDate);
}

// ─── Cache ───────────────────────────────────────────────────────────────────

/**
 * Bounded LRU keyed by `${ticker}|${periodDays}|${asOfDate}`. The historical σ
 * for a fixed asOfDate is deterministic, so caching is safe across the life of
 * a service instance (typically per request in serverless).
 */
class VolatilityCache {
  private readonly max: number;
  private readonly map = new Map<string, VolatilityResult>();

  constructor(max = 1000) {
    this.max = max;
  }

  private key(ticker: string, periodDays: PeriodDays, asOfDate: string): string {
    return `${ticker.toUpperCase()}|${periodDays}|${asOfDate}`;
  }

  get(ticker: string, periodDays: PeriodDays, asOfDate: string): VolatilityResult | undefined {
    const k = this.key(ticker, periodDays, asOfDate);
    const hit = this.map.get(k);
    if (hit !== undefined) {
      // Touch for LRU
      this.map.delete(k);
      this.map.set(k, hit);
    }
    return hit;
  }

  set(ticker: string, periodDays: PeriodDays, asOfDate: string, value: VolatilityResult): void {
    const k = this.key(ticker, periodDays, asOfDate);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, value);
    if (this.map.size > this.max) {
      // Evict oldest
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Module-level shared cache. Service instances may also pass their own. */
const sharedCache = new VolatilityCache();

/** Test helper — clears the shared cache. Not exported from `index.ts`. */
export function __resetVolatilityCache(): void {
  sharedCache.clear();
}

// ─── Main async entry point ──────────────────────────────────────────────────

export interface GetVolatilityThresholdArgs {
  ticker: string;
  periodDays: PeriodDays;
  asOfDate: Date;
  provider: VolatilityProvider;
  /** Optional override of the shared cache (mostly for tests). */
  cache?: VolatilityCache;
}

/**
 * Compute the dynamic 1σ threshold for `(ticker, periodDays, asOfDate)`.
 *
 * Steps:
 * 1. Look up cache; on hit, return immediately (no provider calls).
 * 2. Resolve the ticker's market via `provider.getMarket`. Throw on `'HK'`.
 * 3. Pull the ticker's price series for the lookback window.
 * 4. Filter strictly before `asOfDate` (no look-ahead).
 * 5. If sample count is insufficient, fall back to the same-market index.
 * 6. Compute σ on the chosen series.
 * 7. Cache and return.
 */
export async function getVolatilityThreshold(
  args: GetVolatilityThresholdArgs
): Promise<VolatilityResult> {
  const { ticker, periodDays, asOfDate, provider } = args;
  const cache = args.cache ?? sharedCache;
  const asOfStr = toIsoDate(asOfDate);

  // 1. Cache check
  const cached = cache.get(ticker, periodDays, asOfStr);
  if (cached) return cached;

  // 2. Market lookup (HK throws)
  const market = await provider.getMarket(ticker);
  if (market === 'HK') {
    throw new UnsupportedMarketError('HK', ticker);
  }
  if (market === null) {
    // Unknown market — surface as unsupported rather than guessing.
    throw new UnsupportedMarketError('UNKNOWN', ticker);
  }

  // 3. Fetch the ticker's series for the lookback window (with a small buffer
  //    so weekends/holidays don't shrink the count below the threshold).
  const lookbackDays = LOOKBACK_CALENDAR_DAYS[periodDays];
  const buffer = 14;
  const fromDate = subtractCalendarDays(asOfDate, lookbackDays + buffer);
  const tickerSeriesRaw = await provider.getSeries(ticker, {
    from: toIsoDate(fromDate),
    to: asOfStr,
  });
  // 4. Strict no-look-ahead filter
  const tickerSeries = filterStrictlyBefore(tickerSeriesRaw, asOfStr);

  let chosenSeries = tickerSeries;
  let source: VolatilityResult['source'] = 'ticker';
  let chosenTicker = ticker;

  if (countOverlappingSamples(tickerSeries, periodDays) < MIN_SAMPLE_SIZE[periodDays]) {
    // 5. Insufficient history → index fallback
    const indexTicker = getIndexTickerForMarket(market);
    const indexSeriesRaw = await provider.getSeries(indexTicker, {
      from: toIsoDate(fromDate),
      to: asOfStr,
    });
    const indexSeries = filterStrictlyBefore(indexSeriesRaw, asOfStr);
    chosenSeries = indexSeries;
    source = 'index-fallback';
    chosenTicker = indexTicker;
  }

  // 6. Compute σ
  const value = calculateRealizedVolatility(chosenSeries, periodDays);
  const sampleSize = countOverlappingSamples(chosenSeries, periodDays);

  const result: VolatilityResult = {
    value,
    source,
    sampleSize,
    asOfDate: asOfStr,
    ticker: chosenTicker,
    periodDays,
  };

  // 7. Cache and return
  cache.set(ticker, periodDays, asOfStr, result);
  return result;
}

// Re-export the cache class so the service layer can construct request-scoped instances.
export { VolatilityCache };

/**
 * Feature flags.
 *
 * Simple env-based toggles for in-flight rollouts. Each flag has a safe
 * default so forgetting to set the env var in a given environment does not
 * trigger incomplete code paths.
 */

function readBoolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

/**
 * When enabled, `/api/kols/[id]/win-rate`, `/api/stocks/[ticker]/win-rate`
 * and `/api/dashboard` use the persistent `post_win_rate_samples` cache +
 * `PersistentVolatilityProvider`. When disabled they fall back to the pure
 * stateless pipeline with `StockPriceVolatilityProvider`.
 *
 * Default ON — cache tables have been backfilled for all KOLs and stocks.
 * Set USE_WIN_RATE_SAMPLE_CACHE=false to revert to the legacy stateless path.
 */
export function isWinRateSampleCacheEnabled(): boolean {
  return readBoolEnv('USE_WIN_RATE_SAMPLE_CACHE', true);
}

/**
 * When enabled, `/api/kols/[id]/win-rate` and `/api/stocks/[ticker]/scorecard`
 * read from `kol_scorecard_cache` / `stock_scorecard_cache` (Layer 3) and
 * return `{ status: 'computing' }` on miss. When disabled, the win-rate route
 * falls back to the pre-change inline-compute path.
 *
 * Default ON — cache tables have been backfilled for all KOLs and stocks.
 * Set USE_SCORECARD_CACHE=false to revert to the legacy inline-compute path.
 */
export function isScorecardCacheEnabled(): boolean {
  return readBoolEnv('USE_SCORECARD_CACHE', true);
}

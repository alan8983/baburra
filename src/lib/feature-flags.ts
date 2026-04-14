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
 * Default ON in development, OFF in production until the sample table has
 * been backfilled (see openspec/changes/persist-win-rate-samples/tasks.md §10).
 */
export function isWinRateSampleCacheEnabled(): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  return readBoolEnv('USE_WIN_RATE_SAMPLE_CACHE', !isProd);
}

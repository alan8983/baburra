/**
 * WinRateSample Repository
 *
 * Read/write access to `post_win_rate_samples`, the persisted result of
 * `classifyOutcome` for every (post, stock, period) tuple the win-rate pipeline
 * has seen.  The service layer uses this to skip re-classification on hot paths:
 * load cached rows first, classify only the missing tuples, upsert the fresh
 * rows, then aggregate in JS / SQL.
 *
 * Invalidation is **delete-on-write**: `invalidateByPost` / `invalidateByPostStock`
 * are called from the sentiment-update paths.  The classifier version constant
 * (`CLASSIFIER_VERSION`) gates the read query so old rows from a prior math
 * version are naturally invisible.
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { PeriodDays, PriceChangeStatus, WinRateOutcome } from '@/domain/calculators';

export interface WinRateSampleRow {
  postId: string;
  stockId: string;
  periodDays: PeriodDays;
  outcome: WinRateOutcome;
  /** σ-normalized excess return; null for excluded samples. */
  excessReturn: number | null;
  /** The 1σ threshold applied at classification time; null for excluded. */
  thresholdValue: number | null;
  thresholdSource: 'ticker' | 'index-fallback' | null;
  /** Raw fractional price change; null when `priceChangeStatus !== 'value'`. */
  priceChange: number | null;
  /** Resolution state of the raw price change. */
  priceChangeStatus: PriceChangeStatus;
  classifierVersion: number;
}

interface DbRow {
  post_id: string;
  stock_id: string;
  period_days: number;
  outcome: string;
  excess_return: number | string | null;
  threshold_value: number | string | null;
  threshold_source: string | null;
  price_change: number | string | null;
  price_change_status: string | null;
  classifier_version: number;
}

/** `${postId}:${stockId}:${periodDays}` */
export function sampleKey(postId: string, stockId: string, periodDays: PeriodDays): string {
  return `${postId}:${stockId}:${periodDays}`;
}

function numOrNull(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? Number(v) : v;
}

function mapDbRow(row: DbRow): WinRateSampleRow {
  return {
    postId: row.post_id,
    stockId: row.stock_id,
    periodDays: row.period_days as PeriodDays,
    outcome: row.outcome as WinRateOutcome,
    excessReturn: numOrNull(row.excess_return),
    thresholdValue: numOrNull(row.threshold_value),
    thresholdSource: (row.threshold_source as 'ticker' | 'index-fallback' | null) ?? null,
    priceChange: numOrNull(row.price_change),
    priceChangeStatus: (row.price_change_status as PriceChangeStatus | null) ?? 'value',
    classifierVersion: row.classifier_version,
  };
}

/**
 * Load every persisted sample for a set of posts at the current classifier
 * version. Returns a map keyed by `${postId}:${stockId}:${periodDays}`.
 * Empty input returns an empty map without a DB round-trip.
 */
export async function loadSamplesByPostIds(
  postIds: string[],
  classifierVersion: number
): Promise<Map<string, WinRateSampleRow>> {
  const out = new Map<string, WinRateSampleRow>();
  if (postIds.length === 0) return out;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('post_win_rate_samples')
    .select(
      'post_id, stock_id, period_days, outcome, excess_return, threshold_value, threshold_source, price_change, price_change_status, classifier_version'
    )
    .in('post_id', postIds)
    .eq('classifier_version', classifierVersion);

  if (error) {
    console.warn(
      `[win-rate-sample] loadSamplesByPostIds failed (n=${postIds.length}):`,
      error.message
    );
    return out;
  }

  for (const row of (data ?? []) as DbRow[]) {
    const mapped = mapDbRow(row);
    out.set(sampleKey(mapped.postId, mapped.stockId, mapped.periodDays), mapped);
  }
  return out;
}

/** Convenience wrapper for a single post. */
export async function loadSamplesByPostId(
  postId: string,
  classifierVersion: number
): Promise<Map<string, WinRateSampleRow>> {
  return loadSamplesByPostIds([postId], classifierVersion);
}

/**
 * Batch upsert sample rows. No-op on empty input. Uses ON CONFLICT DO UPDATE
 * so concurrent classifiers that race to fill the same tuple resolve to the
 * same (deterministic) payload.
 */
export async function upsertSamples(rows: WinRateSampleRow[]): Promise<void> {
  if (rows.length === 0) return;

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    post_id: r.postId,
    stock_id: r.stockId,
    period_days: r.periodDays,
    classifier_version: r.classifierVersion,
    outcome: r.outcome,
    excess_return: r.excessReturn,
    threshold_value: r.thresholdValue,
    threshold_source: r.thresholdSource,
    price_change: r.priceChange,
    price_change_status: r.priceChangeStatus,
    computed_at: now,
  }));

  const { error } = await supabase
    .from('post_win_rate_samples')
    .upsert(payload, { onConflict: 'post_id,stock_id,period_days,classifier_version' });

  if (error) {
    console.warn(`[win-rate-sample] upsertSamples failed (n=${rows.length}):`, error.message);
  }
}

/** Drop every row for a post (all stocks, all periods, all classifier versions). */
export async function invalidateByPost(postId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('post_win_rate_samples').delete().eq('post_id', postId);
  if (error) {
    console.warn(`[win-rate-sample] invalidateByPost(${postId}) failed:`, error.message);
  }
}

/** Drop rows for a specific (post, stock) across all periods. */
export async function invalidateByPostStock(postId: string, stockId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('post_win_rate_samples')
    .delete()
    .eq('post_id', postId)
    .eq('stock_id', stockId);
  if (error) {
    console.warn(
      `[win-rate-sample] invalidateByPostStock(${postId}, ${stockId}) failed:`,
      error.message
    );
  }
}

/**
 * Ops helper — delete samples for a ticker, optionally scoped to a single
 * period. Used by the "clear cache for ticker X" recipe after a late price
 * correction.
 */
export async function clearByTicker(ticker: string, periodDays?: PeriodDays): Promise<number> {
  const supabase = createAdminClient();

  const upper = ticker.toUpperCase();
  const { data: stock, error: stockErr } = await supabase
    .from('stocks')
    .select('id')
    .eq('ticker', upper)
    .maybeSingle();
  if (stockErr || !stock) return 0;

  let query = supabase
    .from('post_win_rate_samples')
    .delete({ count: 'exact' })
    .eq('stock_id', (stock as { id: string }).id);
  if (periodDays !== undefined) query = query.eq('period_days', periodDays);

  const { count, error } = await query;
  if (error) {
    console.warn(`[win-rate-sample] clearByTicker(${ticker}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

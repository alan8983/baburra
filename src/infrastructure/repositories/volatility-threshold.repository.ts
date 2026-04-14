/**
 * VolatilityThreshold Repository
 *
 * Durable L2 cache for the per-(ticker, period, asOfDate) 1σ thresholds that
 * the win-rate classifier depends on.  Mirrors the in-memory VolatilityCache
 * used by `getVolatilityThreshold` but survives serverless cold starts and is
 * shared across all KOLs.
 *
 * Values are deterministic once the historical price series up to asOfDate is
 * complete, so rows are immutable in practice — `upsert` exists only to
 * gracefully handle races where two requests compute the same tuple
 * simultaneously.
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { PeriodDays } from '@/domain/calculators';

export interface VolatilityThresholdRow {
  ticker: string;
  periodDays: PeriodDays;
  /** YYYY-MM-DD */
  asOfDate: string;
  /** 1σ as a fractional return (e.g. 0.034 = 3.4%). */
  value: number;
  source: 'ticker' | 'index-fallback';
  sampleSize: number;
}

interface DbRow {
  ticker: string;
  period_days: number;
  as_of_date: string;
  value: number | string;
  source: string;
  sample_size: number;
}

function mapDbRow(row: DbRow): VolatilityThresholdRow {
  return {
    ticker: row.ticker,
    periodDays: row.period_days as PeriodDays,
    asOfDate: row.as_of_date,
    value: typeof row.value === 'string' ? Number(row.value) : row.value,
    source: row.source as 'ticker' | 'index-fallback',
    sampleSize: row.sample_size,
  };
}

/** Read a single (ticker, periodDays, asOfDate) row; null if missing. */
export async function getThreshold(
  ticker: string,
  periodDays: PeriodDays,
  asOfDate: string
): Promise<VolatilityThresholdRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('volatility_thresholds')
    .select('ticker, period_days, as_of_date, value, source, sample_size')
    .eq('ticker', ticker.toUpperCase())
    .eq('period_days', periodDays)
    .eq('as_of_date', asOfDate)
    .maybeSingle();
  if (error) {
    console.warn(
      `[volatility-threshold] read failed for ${ticker}/${periodDays}/${asOfDate}:`,
      error.message
    );
    return null;
  }
  if (!data) return null;
  return mapDbRow(data as DbRow);
}

/** Upsert a threshold row (ON CONFLICT DO UPDATE). Safe to call on every compute. */
export async function upsertThreshold(row: VolatilityThresholdRow): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('volatility_thresholds').upsert(
    {
      ticker: row.ticker.toUpperCase(),
      period_days: row.periodDays,
      as_of_date: row.asOfDate,
      value: row.value,
      source: row.source,
      sample_size: row.sampleSize,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'ticker,period_days,as_of_date' }
  );
  if (error) {
    console.warn(
      `[volatility-threshold] upsert failed for ${row.ticker}/${row.periodDays}/${row.asOfDate}:`,
      error.message
    );
  }
}

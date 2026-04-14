/**
 * PersistentVolatilityProvider
 *
 * Wraps `StockPriceVolatilityProvider` with a durable L2 cache backed by
 * `volatility_thresholds`.  The calculator's `getVolatilityThreshold` looks up
 * the in-memory L1 cache first, then delegates the L2 lookup to
 * `getCachedThreshold` (this class), then falls through to the real
 * compute path (series fetch + stdev).  After a successful compute the
 * calculator calls `upsertCachedThreshold` to populate the L2 row.
 *
 * Series + market resolution are delegated to the stateless provider — this
 * class only adds the threshold cache layer.
 */

import {
  getThreshold,
  upsertThreshold,
} from '@/infrastructure/repositories/volatility-threshold.repository';
import { StockPriceVolatilityProvider } from './stock-price-volatility.provider';
import type {
  Market,
  PeriodDays,
  PriceSeriesPoint,
  VolatilityProvider,
  VolatilityResult,
} from '@/domain/calculators';

export class PersistentVolatilityProvider implements VolatilityProvider {
  private readonly inner: StockPriceVolatilityProvider;

  constructor(inner?: StockPriceVolatilityProvider) {
    this.inner = inner ?? new StockPriceVolatilityProvider();
  }

  async getSeries(ticker: string, opts: { from: string; to: string }): Promise<PriceSeriesPoint[]> {
    return this.inner.getSeries(ticker, opts);
  }

  async getMarket(ticker: string): Promise<Market | null> {
    return this.inner.getMarket(ticker);
  }

  /**
   * Escape hatch consumed by `getVolatilityThreshold`: read the durable row
   * from `volatility_thresholds` and hydrate a `VolatilityResult` so the
   * calculator can short-circuit compute.
   */
  async getCachedThreshold(
    ticker: string,
    periodDays: PeriodDays,
    asOfDate: string
  ): Promise<VolatilityResult | null> {
    const row = await getThreshold(ticker, periodDays, asOfDate);
    if (!row) return null;
    return {
      value: row.value,
      source: row.source,
      sampleSize: row.sampleSize,
      asOfDate: row.asOfDate,
      ticker: row.ticker,
      periodDays: row.periodDays,
    };
  }

  /**
   * Persist the computed threshold to `volatility_thresholds`. Errors are
   * logged by the repository and swallowed — the compute result is already
   * valid in memory.
   */
  async upsertCachedThreshold(result: VolatilityResult): Promise<void> {
    await upsertThreshold({
      ticker: result.ticker,
      periodDays: result.periodDays,
      asOfDate: result.asOfDate,
      value: result.value,
      source: result.source,
      sampleSize: result.sampleSize,
    });
  }
}

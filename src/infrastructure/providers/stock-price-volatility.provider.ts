/**
 * Production VolatilityProvider backed by `stock_prices` (via the repository).
 *
 * - `getSeries` calls `getStockPriceSeries`, which reuses the existing Supabase
 *   cache + Tiingo/TWSE backfill.
 * - `getMarket` reads `stocks.market` and normalizes 'HK' / unknown to the
 *   `Market` union expected by the volatility module.
 *
 * Index tickers ('^TWII', 'SPY') don't need a stocks row — `getStockPriceSeries`
 * will fetch them directly via the price clients.
 */

import {
  getStockMarket,
  getStockPriceSeries,
} from '@/infrastructure/repositories/stock-price.repository';
import type { Market, PriceSeriesPoint, VolatilityProvider } from '@/domain/calculators';

function normalizeMarket(raw: string | null): Market | null {
  if (raw === 'TW' || raw === 'US' || raw === 'CRYPTO' || raw === 'HK') return raw;
  // Index tickers like ^TWII / SPY may not have a stocks row at all — caller
  // should not invoke getMarket on them. Return null for anything unknown.
  return null;
}

export class StockPriceVolatilityProvider implements VolatilityProvider {
  async getSeries(ticker: string, opts: { from: string; to: string }): Promise<PriceSeriesPoint[]> {
    return getStockPriceSeries(ticker, opts);
  }

  async getMarket(ticker: string): Promise<Market | null> {
    const raw = await getStockMarket(ticker);
    return normalizeMarket(raw);
  }
}

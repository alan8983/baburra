/**
 * Twelve Data Stock Price API Client
 * Fetches daily OHLCV prices for Taiwan (TWSE) and Hong Kong (HKEX) stocks.
 * @see https://twelvedata.com/docs#time-series
 */

import type { TiingoPriceRow } from './tiingo.client';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

const MARKET_TO_EXCHANGE: Record<string, string> = {
  TW: 'TWSE',
  HK: 'HKEX',
};

function getApiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    throw new Error('TWELVE_DATA_API_KEY is not set');
  }
  return key;
}

/**
 * Parse a stored ticker like `2330.TW` or `0700.HK` into symbol + exchange.
 * Returns null if the ticker format is not recognized for Twelve Data.
 */
export function parseTicker(
  ticker: string,
  market: string
): { symbol: string; exchange: string } | null {
  const exchange = MARKET_TO_EXCHANGE[market];
  if (!exchange) return null;

  // Strip the market suffix (e.g., `.TW`, `.HK`) if present
  const dotIndex = ticker.lastIndexOf('.');
  const symbol = dotIndex > 0 ? ticker.slice(0, dotIndex) : ticker;

  return { symbol, exchange };
}

interface TwelveDataTimeSeriesResponse {
  meta?: { symbol: string; exchange: string };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status?: string;
  message?: string;
  code?: number;
}

/**
 * Fetch daily OHLCV prices from Twelve Data for TW/HK markets.
 * Returns TiingoPriceRow[] for compatibility with the existing price pipeline.
 */
export async function fetchTwelveDataPrices(
  ticker: string,
  market: string,
  options?: { startDate?: string; endDate?: string }
): Promise<TiingoPriceRow[]> {
  const parsed = parseTicker(ticker, market);
  if (!parsed) {
    console.warn(`[TwelveData] Unsupported market "${market}" for ticker "${ticker}"`);
    return [];
  }

  const apiKey = getApiKey();
  const params = new URLSearchParams({
    symbol: parsed.symbol,
    exchange: parsed.exchange,
    interval: '1day',
    apikey: apiKey,
  });
  if (options?.startDate) params.set('start_date', options.startDate);
  if (options?.endDate) params.set('end_date', options.endDate);

  const url = `${TWELVE_DATA_BASE}/time_series?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[TwelveData] Ticker not found (404): ${ticker}`);
      return [];
    }
    const text = await res.text();
    throw new Error(`Twelve Data API error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as TwelveDataTimeSeriesResponse;

  // Twelve Data returns { status: "error", code: 400/404, message: "..." } on errors
  if (data.status === 'error') {
    if (data.code === 404 || data.code === 400) {
      console.warn(`[TwelveData] API error for ${ticker}: ${data.message}`);
      return [];
    }
    throw new Error(`Twelve Data API error: ${data.message}`);
  }

  if (!data.values || !Array.isArray(data.values) || data.values.length === 0) {
    return [];
  }

  // Parse string values to numbers and normalize to TiingoPriceRow format
  return data.values.map((row) => ({
    date: row.datetime,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseInt(row.volume, 10),
  }));
}

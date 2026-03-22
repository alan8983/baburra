/**
 * TWSE Open Data Stock Price API Client
 * Fetches daily OHLCV prices for Taiwan-listed stocks via the official
 * Taiwan Stock Exchange historical endpoint (free, no API key required).
 * @see https://www.twse.com.tw/en/trading/historical/stock-day.html
 */

import type { TiingoPriceRow } from './tiingo.client';

const TWSE_BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';

/**
 * Strip `.TW` suffix from ticker to get the stock code.
 * e.g., `2330.TW` → `2330`, `0050.TW` → `0050`
 */
export function parseStockCode(ticker: string): string {
  const dotIndex = ticker.lastIndexOf('.');
  return dotIndex > 0 ? ticker.slice(0, dotIndex) : ticker;
}

/**
 * Convert ROC (Republic of China) date string to ISO date string.
 * ROC format: `115/03/18` → Gregorian: `2026-03-18`
 * ROC year + 1911 = Gregorian year.
 */
export function rocToGregorian(rocDate: string): string {
  const parts = rocDate.split('/');
  if (parts.length !== 3) return rocDate;
  const year = parseInt(parts[0], 10) + 1911;
  return `${year}-${parts[1]}-${parts[2]}`;
}

/**
 * Parse a comma-separated number string to a number.
 * e.g., `"1,940.00"` → `1940`, `"57,404,594"` → `57404594`
 */
export function parseNumber(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}

/**
 * Generate the list of YYYYMMDD date strings (first of each month) needed
 * to cover the requested date range using TWSE's monthly endpoint.
 */
export function getMonthlyDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  // Start from the first day of the start month
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const yyyy = current.getFullYear().toString();
    const mm = (current.getMonth() + 1).toString().padStart(2, '0');
    const dd = '01';
    dates.push(`${yyyy}${mm}${dd}`);
    current.setMonth(current.getMonth() + 1);
  }

  return dates;
}

interface TwseStockDayResponse {
  stat: string;
  title?: string;
  fields?: string[];
  data?: string[][];
  notes?: string[];
}

/**
 * Fetch daily OHLCV prices from TWSE Open Data for a TW market stock.
 * Makes one request per month to cover the requested date range, then
 * merges and filters results to the exact range.
 *
 * Returns TiingoPriceRow[] for compatibility with the existing price pipeline.
 */
export async function fetchTwsePrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string }
): Promise<TiingoPriceRow[]> {
  const stockCode = parseStockCode(ticker);
  const endDate = options?.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    options?.startDate ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d.toISOString().slice(0, 10);
    })();

  const monthlyDates = getMonthlyDates(startDate, endDate);
  const allRows: TiingoPriceRow[] = [];

  for (const dateParam of monthlyDates) {
    const params = new URLSearchParams({
      response: 'json',
      date: dateParam,
      stockNo: stockCode,
    });

    const url = `${TWSE_BASE}?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, { next: { revalidate: 0 } });
    } catch (err) {
      throw new Error(
        `TWSE API network error for ${ticker}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[TWSE] Stock not found (404): ${ticker}`);
        return [];
      }
      const text = await res.text();
      throw new Error(`TWSE API error ${res.status}: ${text || res.statusText}`);
    }

    const data = (await res.json()) as TwseStockDayResponse;

    if (data.stat !== 'OK' || !data.data || !Array.isArray(data.data)) {
      // Non-OK stat for a specific month is not fatal — might just be no data for that month
      console.warn(`[TWSE] stat="${data.stat}" for ${ticker} date=${dateParam}, skipping month`);
      continue;
    }

    for (const row of data.data) {
      // row format: [日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數, 註記]
      // indices:     0     1         2         3       4       5       6       7          8
      if (row.length < 7) continue;

      // Skip rows with "--" prices (suspended trading, etc.)
      if (row[3] === '--' || row[6] === '--') continue;

      const date = rocToGregorian(row[0]);

      allRows.push({
        date,
        open: parseNumber(row[3]),
        high: parseNumber(row[4]),
        low: parseNumber(row[5]),
        close: parseNumber(row[6]),
        volume: parseNumber(row[1]),
      });
    }

    // Small delay between requests to be polite to TWSE servers
    if (monthlyDates.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  // Filter to requested date range and sort ascending
  return allRows
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

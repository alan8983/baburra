/**
 * 股價快取 Repository
 * 使用 Supabase stock_prices 表作為持久化快取。
 * 快取策略：歷史日期永不過期；當日資料 1 小時後過期。
 * 若 Tiingo API 失敗但有過期快取，回傳過期資料（stale-while-revalidate）。
 */

import { APP_CONFIG } from '@/lib/constants';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { fetchTiingoPrices } from '@/infrastructure/api/tiingo.client';
import type { CandlestickData, VolumeData } from '@/domain/models/stock';

const CACHE_DAYS = APP_CONFIG.STOCK_PRICE_CACHE_DAYS;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小時

interface DbStockPriceRow {
  id: string;
  stock_id: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  fetched_at: string;
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() - days);
  return out;
}

function todayStr(): string {
  return toYYYYMMDD(new Date());
}

/** Resolve ticker → stock_id. Returns null if stock not in DB. */
async function resolveStockId(ticker: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('stocks')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .single();
  return data?.id ?? null;
}

/** Read cached prices from stock_prices for the date range. */
async function readCachedPrices(
  stockId: string,
  startDate: string,
  endDate: string
): Promise<DbStockPriceRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stock_prices')
    .select('*')
    .eq('stock_id', stockId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) {
    console.error('Failed to read cached prices:', error.message);
    return [];
  }
  return (data ?? []) as DbStockPriceRow[];
}

/**
 * Check if cached data is valid:
 * - Empty cache is always invalid
 * - If earliest cached row is >7 days after requested start, range not covered
 * - If endDate >= today, today's row must exist and fetched_at < 1hr ago
 * - If endDate < today (pure historical), any cached data is valid
 */
function isCacheValid(cached: DbStockPriceRow[], startDate: string, endDate: string): boolean {
  if (cached.length === 0) return false;

  // Check range coverage: earliest cached row should be near the requested start
  const earliestCached = new Date(cached[0].date).getTime();
  const requestedStart = new Date(startDate).getTime();
  const gapMs = earliestCached - requestedStart;
  if (gapMs > 7 * 24 * 60 * 60 * 1000) return false; // >7 day gap = missing data

  const today = todayStr();

  if (endDate >= today) {
    const todayRow = cached.find((r) => r.date === today);
    if (!todayRow) return false;
    const fetchedAt = new Date(todayRow.fetched_at).getTime();
    if (Date.now() - fetchedAt > CACHE_TTL_MS) return false;
  }

  return true;
}

/** Upsert price rows to stock_prices table. */
async function writePricesToCache(
  stockId: string,
  rows: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const upsertRows = rows.map((r) => ({
    stock_id: stockId,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    fetched_at: now,
  }));

  const { error } = await supabase
    .from('stock_prices')
    .upsert(upsertRows, { onConflict: 'stock_id,date' });

  if (error) {
    console.error('Failed to write prices to cache:', error.message);
  }
}

/** Transform DB rows → chart data format. */
function dbRowsToChartData(rows: DbStockPriceRow[]): {
  candles: CandlestickData[];
  volumes: VolumeData[];
} {
  const candles: CandlestickData[] = [];
  const volumes: VolumeData[] = [];

  for (const row of rows) {
    const open = row.open ?? row.close;
    candles.push({
      time: row.date,
      open,
      high: row.high ?? row.close,
      low: row.low ?? row.close,
      close: row.close,
    });
    const isUp = row.close >= open;
    volumes.push({
      time: row.date,
      value: row.volume ?? 0,
      color: isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    });
  }

  return { candles, volumes };
}

/** Transform Tiingo rows → chart data + rows for cache. */
function transformTiingoRows(tiingoRows: Awaited<ReturnType<typeof fetchTiingoPrices>>) {
  const candles: CandlestickData[] = [];
  const volumes: VolumeData[] = [];
  const rowsForCache: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  for (const row of tiingoRows) {
    const time = row.date.slice(0, 10);
    candles.push({ time, open: row.open, high: row.high, low: row.low, close: row.close });
    const isUp = row.close >= row.open;
    volumes.push({
      time,
      value: row.volume,
      color: isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    });
    rowsForCache.push({
      date: time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    });
  }

  return { candles, volumes, rowsForCache };
}

/**
 * 取得標的股價（K 線 + 成交量），優先從 Supabase 快取回傳。
 *
 * Flow:
 * 1. Resolve ticker → stock_id
 * 2. Check stock_prices table for cached data
 * 3. Cache valid → return from DB
 * 4. Cache miss/expired → fetch Tiingo → upsert to DB → return
 * 5. Tiingo failure + stale cache → return stale data
 * 6. stock_id not found → fetch Tiingo directly (skip DB cache)
 */
export async function getStockPrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string }
): Promise<{ candles: CandlestickData[]; volumes: VolumeData[] }> {
  const end = options?.endDate ? new Date(options.endDate) : new Date();
  const start = options?.startDate ? new Date(options.startDate) : subtractDays(end, CACHE_DAYS);
  const startStr = toYYYYMMDD(start);
  const endStr = toYYYYMMDD(end);

  // Step 1: Resolve stock_id
  const stockId = await resolveStockId(ticker);

  // Step 2: Try Supabase cache
  let staleCached: DbStockPriceRow[] = [];
  if (stockId) {
    const cached = await readCachedPrices(stockId, startStr, endStr);
    if (isCacheValid(cached, startStr, endStr)) {
      return dbRowsToChartData(cached);
    }
    staleCached = cached;
  }

  // Step 3: Fetch from Tiingo
  try {
    const tiingoRows = await fetchTiingoPrices(ticker, {
      startDate: startStr,
      endDate: endStr,
    });

    const { candles, volumes, rowsForCache } = transformTiingoRows(tiingoRows);

    // Step 4: Write to Supabase cache (fire-and-forget)
    if (stockId && rowsForCache.length > 0) {
      writePricesToCache(stockId, rowsForCache).catch((err) =>
        console.error('Background cache write failed:', err)
      );
    }

    return { candles, volumes };
  } catch (tiingoError) {
    // Step 5: Stale-while-revalidate — serve stale cache if Tiingo fails
    if (staleCached.length > 0) {
      console.warn(`Tiingo API failed for ${ticker}, serving stale cache`);
      return dbRowsToChartData(staleCached);
    }
    throw tiingoError;
  }
}

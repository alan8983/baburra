/**
 * 股價快取 Repository
 * 先以記憶體快取實作，快取天數依 config STOCK_PRICE_CACHE_DAYS。
 * 之後可改為 Supabase stock_prices 表。
 */

import { APP_CONFIG } from '@/lib/constants';
import { fetchTiingoPrices } from '@/infrastructure/api/tiingo.client';
import type { CandlestickData, VolumeData } from '@/domain/models/stock';

const CACHE_DAYS = APP_CONFIG.STOCK_PRICE_CACHE_DAYS;

interface CacheEntry {
  candles: CandlestickData[];
  volumes: VolumeData[];
  fetchedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() - days);
  return out;
}

/**
 * 取得標的股價（K 線 + 成交量），優先從快取回傳，逾時則向 Tiingo 拉取並更新快取。
 */
export async function getStockPrices(
  ticker: string,
  options?: { startDate?: string; endDate?: string }
): Promise<{ candles: CandlestickData[]; volumes: VolumeData[] }> {
  const end = options?.endDate ? new Date(options.endDate) : new Date();
  const start = options?.startDate ? new Date(options.startDate) : subtractDays(end, CACHE_DAYS);
  const startStr = toYYYYMMDD(start);
  const endStr = toYYYYMMDD(end);
  const cacheKey = `${ticker}:${startStr}:${endStr}`;

  const cached = memoryCache.get(cacheKey);
  const now = Date.now();
  const maxAgeMs = 60 * 60 * 1000; // 1 小時內視為有效
  if (cached && now - cached.fetchedAt < maxAgeMs) {
    return { candles: cached.candles, volumes: cached.volumes };
  }

  const rows = await fetchTiingoPrices(ticker, {
    startDate: startStr,
    endDate: endStr,
  });

  const candles: CandlestickData[] = [];
  const volumes: VolumeData[] = [];

  for (const row of rows) {
    const time = row.date.slice(0, 10);
    candles.push({
      time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    });
    const isUp = row.close >= row.open;
    volumes.push({
      time,
      value: row.volume,
      color: isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    });
  }

  memoryCache.set(cacheKey, {
    candles,
    volumes,
    fetchedAt: now,
  });

  return { candles, volumes };
}

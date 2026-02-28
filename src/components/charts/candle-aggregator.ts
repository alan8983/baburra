import type { CandlestickData, VolumeData } from '@/domain/models/stock';
import { getFinancialColors, DEFAULT_PALETTE } from '@/lib/colors/financial-colors';

export type CandleInterval = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type TimeRange = '1M' | '1Q' | 'YTD' | '1Y' | '5Y';

const defaultColors = getFinancialColors(DEFAULT_PALETTE);

/**
 * Get the group key for a given date string (YYYY-MM-DD) based on the interval.
 */
function getGroupKey(dateStr: string, interval: CandleInterval): string {
  if (interval === 'day') return dateStr;

  const [yearStr, monthStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  switch (interval) {
    case 'week': {
      // ISO week: group by the Monday of the week
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay();
      // Adjust to Monday (getDay: 0=Sun, 1=Mon ... 6=Sat)
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
    case 'month':
      return `${yearStr}-${monthStr}`;
    case 'quarter': {
      const q = Math.ceil(month / 3);
      return `${year}-Q${q}`;
    }
    case 'year':
      return yearStr;
  }
}

/**
 * Aggregate daily candles into the specified interval.
 * For 'day', returns data as-is.
 */
export function aggregateCandles(
  candles: CandlestickData[],
  interval: CandleInterval
): CandlestickData[] {
  if (interval === 'day' || candles.length === 0) return candles;

  const groups = new Map<string, CandlestickData[]>();
  for (const c of candles) {
    const key = getGroupKey(c.time, interval);
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const result: CandlestickData[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const last = group[group.length - 1];
    result.push({
      time: first.time, // use first trading day as the period's time
      open: first.open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: last.close,
    });
  }

  return result;
}

/**
 * Aggregate daily volumes into the specified interval.
 * Sums volume values within each period. Color is green if close >= open, red otherwise.
 */
export function aggregateVolumes(
  volumes: VolumeData[],
  candles: CandlestickData[],
  interval: CandleInterval,
  volumeColors?: { up: string; down: string }
): VolumeData[] {
  if (interval === 'day' || volumes.length === 0) return volumes;

  // Build aggregated candle lookup to determine up/down color
  const aggregatedCandles = aggregateCandles(candles, interval);
  const candleMap = new Map<string, CandlestickData>();
  for (const c of aggregatedCandles) {
    candleMap.set(c.time, c);
  }

  // Group volumes by interval
  const groups = new Map<string, { time: string; totalVolume: number }>();
  for (const v of volumes) {
    const key = getGroupKey(v.time, interval);
    const existing = groups.get(key);
    if (existing) {
      existing.totalVolume += v.value;
    } else {
      // Use the first day's date from the corresponding aggregated candle
      const candle =
        candleMap.get(key) ?? aggregatedCandles.find((c) => getGroupKey(c.time, interval) === key);
      groups.set(key, { time: candle?.time ?? v.time, totalVolume: v.value });
    }
  }

  const result: VolumeData[] = [];
  for (const [key, { time, totalVolume }] of groups) {
    const candle = candleMap.get(time);
    // If we can't find the candle, use the key's first trading day
    const isUp = candle ? candle.close >= candle.open : true;
    // Match the first trading day time from aggregated candles
    const aggCandle = aggregatedCandles.find((c) => getGroupKey(c.time, interval) === key);
    result.push({
      time: aggCandle?.time ?? time,
      value: totalVolume,
      color: isUp
        ? (volumeColors?.up ?? defaultColors.volumeUp)
        : (volumeColors?.down ?? defaultColors.volumeDown),
    });
  }

  return result;
}

/**
 * Calculate the startDate (YYYY-MM-DD) for a given time range.
 */
export function getStartDateForRange(range: TimeRange): string {
  const now = new Date();
  let start: Date;

  switch (range) {
    case '1M':
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case '1Q':
      start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case 'YTD':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case '1Y':
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case '5Y':
      start = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      break;
  }

  return start.toISOString().slice(0, 10);
}

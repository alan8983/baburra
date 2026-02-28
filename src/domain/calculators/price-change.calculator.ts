/**
 * 股價漲跌幅計算器
 * 計算發文後指定天數的股價變化百分比
 */

import type { CandlestickData } from '@/domain/models/stock';
import type { PriceChangeByPeriod, PriceChangeStatus } from '@/domain/models/post';

export const PRICE_CHANGE_PERIODS = [5, 30, 90, 365] as const;
export type PriceChangePeriod = (typeof PRICE_CHANGE_PERIODS)[number];

/**
 * 從 K 線資料中找出指定日期的收盤價
 * 如果當天沒有資料，會往後找最近的交易日
 */
function findClosePrice(
  candles: CandlestickData[],
  targetDate: string,
  maxDaysForward = 7
): number | null {
  const target = new Date(targetDate);

  for (let i = 0; i <= maxDaysForward; i++) {
    const checkDate = new Date(target);
    checkDate.setDate(checkDate.getDate() + i);
    const checkDateStr = checkDate.toISOString().slice(0, 10);

    const candle = candles.find((c) => c.time === checkDateStr);
    if (candle) {
      return candle.close;
    }
  }

  return null;
}

/**
 * 從 K 線資料中找出指定日期或之前最近交易日的收盤價
 * （用於 T-N 回溯查找）
 */
function findClosePriceBackward(
  candles: CandlestickData[],
  targetDate: string,
  maxDaysBack = 7
): number | null {
  const target = new Date(targetDate);

  for (let i = 0; i <= maxDaysBack; i++) {
    const checkDate = new Date(target);
    checkDate.setDate(checkDate.getDate() - i);
    const checkDateStr = checkDate.toISOString().slice(0, 10);

    const candle = candles.find((c) => c.time === checkDateStr);
    if (candle) {
      return candle.close;
    }
  }

  return null;
}

/**
 * 計算漲跌幅百分比
 * @param startPrice 起始價格
 * @param endPrice 結束價格
 * @returns 漲跌幅百分比 (正數為漲，負數為跌)
 */
export function calculatePriceChangePercent(startPrice: number, endPrice: number): number {
  if (startPrice === 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * 計算發文後各期間的漲跌幅
 * @param candles K 線資料
 * @param postedAt 發文日期
 * @returns 各期間的漲跌幅
 */
export function calculatePriceChanges(
  candles: CandlestickData[],
  postedAt: Date
): PriceChangeByPeriod {
  const postedDateStr = postedAt.toISOString().slice(0, 10);

  // 取得發文當天的收盤價作為基準
  const basePrice = findClosePrice(candles, postedDateStr);

  if (basePrice === null) {
    return {
      day5: null,
      day30: null,
      day90: null,
      day365: null,
      day5Status: 'no_data' as PriceChangeStatus,
      day30Status: 'no_data' as PriceChangeStatus,
      day90Status: 'no_data' as PriceChangeStatus,
      day365Status: 'no_data' as PriceChangeStatus,
    };
  }

  const today = new Date();

  function computePeriod(period: number): { value: number | null; status: PriceChangeStatus } {
    const targetDate = new Date(postedAt);
    targetDate.setDate(targetDate.getDate() + period);

    if (targetDate > today) {
      return { value: null, status: 'pending' };
    }

    const targetDateStr = targetDate.toISOString().slice(0, 10);
    const targetPrice = findClosePrice(candles, targetDateStr);

    if (targetPrice !== null) {
      const change = calculatePriceChangePercent(basePrice!, targetPrice);
      return { value: Math.round(change * 100) / 100, status: 'value' };
    }

    return { value: null, status: 'no_data' };
  }

  const d5 = computePeriod(5);
  const d30 = computePeriod(30);
  const d90 = computePeriod(90);
  const d365 = computePeriod(365);

  return {
    day5: d5.value,
    day30: d30.value,
    day90: d90.value,
    day365: d365.value,
    day5Status: d5.status,
    day30Status: d30.status,
    day90Status: d90.status,
    day365Status: d365.status,
  };
}

/**
 * 批次計算多篇文章的漲跌幅
 * @param posts 文章列表（需包含 postedAt 和 stockId）
 * @param candlesByStock 各標的的 K 線資料 (stockId -> candles)
 * @returns 各文章的漲跌幅 (postId -> stockId -> priceChanges)
 */
export function calculateBatchPriceChanges(
  posts: Array<{ id: string; postedAt: Date; stockIds: string[] }>,
  candlesByStock: Record<string, CandlestickData[]>
): Record<string, Record<string, PriceChangeByPeriod>> {
  const result: Record<string, Record<string, PriceChangeByPeriod>> = {};

  for (const post of posts) {
    result[post.id] = {};
    for (const stockId of post.stockIds) {
      const candles = candlesByStock[stockId];
      if (candles && candles.length > 0) {
        result[post.id][stockId] = calculatePriceChanges(candles, post.postedAt);
      } else {
        result[post.id][stockId] = {
          day5: null,
          day30: null,
          day90: null,
          day365: null,
          day5Status: 'no_data',
          day30Status: 'no_data',
          day90Status: 'no_data',
          day365Status: 'no_data',
        };
      }
    }
  }

  return result;
}

/**
 * 計算標的近期的股價變動（相對於今天）
 * day5 = (T 的收盤價 - T-5 的收盤價) / T-5 的收盤價 × 100
 * @param candles K 線資料
 * @returns 各期間的漲跌幅
 */
export function calculateRecentPriceChanges(candles: CandlestickData[]): PriceChangeByPeriod {
  if (candles.length === 0) {
    return {
      day5: null,
      day30: null,
      day90: null,
      day365: null,
      day5Status: 'no_data',
      day30Status: 'no_data',
      day90Status: 'no_data',
      day365Status: 'no_data',
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentPrice = findClosePriceBackward(candles, todayStr);

  if (currentPrice === null) {
    return {
      day5: null,
      day30: null,
      day90: null,
      day365: null,
      day5Status: 'no_data',
      day30Status: 'no_data',
      day90Status: 'no_data',
      day365Status: 'no_data',
    };
  }

  function computePeriod(daysAgo: number): { value: number | null; status: PriceChangeStatus } {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysAgo);
    const pastDateStr = pastDate.toISOString().slice(0, 10);
    const pastPrice = findClosePriceBackward(candles, pastDateStr);

    if (pastPrice !== null) {
      const change = calculatePriceChangePercent(pastPrice, currentPrice!);
      return { value: Math.round(change * 100) / 100, status: 'value' };
    }

    return { value: null, status: 'no_data' };
  }

  const d5 = computePeriod(5);
  const d30 = computePeriod(30);
  const d90 = computePeriod(90);
  const d365 = computePeriod(365);

  return {
    day5: d5.value,
    day30: d30.value,
    day90: d90.value,
    day365: d365.value,
    day5Status: d5.status,
    day30Status: d30.status,
    day90Status: d90.status,
    day365Status: d365.status,
  };
}

/**
 * 批次計算多個標的的近期股價變動
 * @param stockIds 要計算的標的 ID 列表
 * @param candlesByStock 各標的的 K 線資料 (stockId -> candles)
 * @returns 各標的的漲跌幅 (stockId -> priceChanges)
 */
export function calculateBatchRecentPriceChanges(
  stockIds: string[],
  candlesByStock: Record<string, CandlestickData[]>
): Record<string, PriceChangeByPeriod> {
  const result: Record<string, PriceChangeByPeriod> = {};

  for (const stockId of stockIds) {
    const candles = candlesByStock[stockId];
    if (candles && candles.length > 0) {
      result[stockId] = calculateRecentPriceChanges(candles);
    } else {
      result[stockId] = {
        day5: null,
        day30: null,
        day90: null,
        day365: null,
        day5Status: 'no_data',
        day30Status: 'no_data',
        day90Status: 'no_data',
        day365Status: 'no_data',
      };
    }
  }

  return result;
}

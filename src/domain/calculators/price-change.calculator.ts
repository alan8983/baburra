/**
 * 股價漲跌幅計算器
 * 計算發文後指定天數的股價變化百分比
 */

import type { CandlestickData } from '@/domain/models/stock';
import type { PriceChangeByPeriod } from '@/domain/models/post';

export const PRICE_CHANGE_PERIODS = [5, 30, 90, 365] as const;
export type PriceChangePeriod = (typeof PRICE_CHANGE_PERIODS)[number];

/**
 * 從 K 線資料中找出指定日期的收盤價
 * 如果當天沒有資料，會往後找最近的交易日
 */
function findClosePrice(
  candles: CandlestickData[],
  targetDate: string,
  maxDaysForward = 5
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
    };
  }

  const result: PriceChangeByPeriod = {
    day5: null,
    day30: null,
    day90: null,
    day365: null,
  };

  const today = new Date();

  for (const period of PRICE_CHANGE_PERIODS) {
    const targetDate = new Date(postedAt);
    targetDate.setDate(targetDate.getDate() + period);

    // 如果目標日期超過今天，則使用今天的價格
    const effectiveDate = targetDate > today ? today : targetDate;
    const targetDateStr = effectiveDate.toISOString().slice(0, 10);

    const targetPrice = findClosePrice(candles, targetDateStr);

    if (targetPrice !== null) {
      const change = calculatePriceChangePercent(basePrice, targetPrice);
      const key = `day${period}` as keyof PriceChangeByPeriod;
      result[key] = Math.round(change * 100) / 100; // 保留兩位小數
    }
  }

  return result;
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
        };
      }
    }
  }

  return result;
}

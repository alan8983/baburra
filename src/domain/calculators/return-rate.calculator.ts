/**
 * 報酬率計算器
 * 根據文章情緒與股價漲跌計算平均報酬率 (ROI)
 */

import type { Sentiment, PriceChangeByPeriod } from '@/domain/models/post';
import type { PriceChangePeriod } from './price-change.calculator';
import type { ColorPalette } from '@/domain/models/user';
import { getFinancialColors } from '@/lib/colors/financial-colors';

export interface ReturnRateResult {
  period: PriceChangePeriod;
  total: number; // 完整母體：positiveCount + negativeCount + naCount + pendingCount（排除中立情緒）
  positiveCount: number; // 正報酬筆數（獲利）
  negativeCount: number; // 負報酬筆數（虧損）
  naCount: number; // 不適用筆數（無股價資料）
  pendingCount: number; // 期間未到筆數
  avgReturn: number | null; // 平均報酬率 %（僅含正負報酬，排除 N/A 及 pending）
}

export interface ReturnRateStats {
  day5: ReturnRateResult;
  day30: ReturnRateResult;
  day90: ReturnRateResult;
  day365: ReturnRateResult;
  overall: {
    total: number;
    avgReturn: number | null;
  };
}

export interface PostForReturnRate {
  id: string;
  sentiment: Sentiment;
  stockSentiments?: Record<string, Sentiment>; // stockId -> per-stock sentiment override
  priceChanges: Record<string, PriceChangeByPeriod>; // stockId -> priceChanges
}

/**
 * 計算單筆文章-標的的報酬率
 * - 看多 (sentiment > 0)：報酬率 = 股價漲跌幅（跟著買入）
 * - 看空 (sentiment < 0)：報酬率 = -股價漲跌幅（反向操作）
 * - 中立 (sentiment = 0) 或無價格資料：回傳 null（不計入）
 */
export function calculateReturn(sentiment: Sentiment, priceChange: number | null): number | null {
  if (sentiment === 0 || priceChange === null) {
    return null;
  }

  if (sentiment > 0) {
    return priceChange; // 看多：報酬 = 股價漲跌幅
  } else {
    return -priceChange; // 看空：報酬 = 股價漲跌幅的反向
  }
}

/**
 * 計算特定期間的報酬率
 */
function calculatePeriodReturnRate(
  posts: PostForReturnRate[],
  period: PriceChangePeriod
): ReturnRateResult {
  const periodKey = `day${period}` as 'day5' | 'day30' | 'day90' | 'day365';
  const statusKey = `${periodKey}Status` as
    | 'day5Status'
    | 'day30Status'
    | 'day90Status'
    | 'day365Status';
  const returns: number[] = [];
  let naCount = 0;
  let pendingCount = 0;

  for (const post of posts) {
    const stockIds = Object.keys(post.priceChanges);
    for (const stockId of stockIds) {
      const effectiveSentiment = post.stockSentiments?.[stockId] ?? post.sentiment;
      if (effectiveSentiment === 0) continue;

      const priceChange = post.priceChanges[stockId]?.[periodKey] ?? null;
      const status = post.priceChanges[stockId]?.[statusKey];
      const ret = calculateReturn(effectiveSentiment, priceChange);

      if (ret !== null) {
        returns.push(ret);
      } else if (status === 'pending') {
        pendingCount++;
      } else {
        // 無股價資料 — 計入母體但不納入報酬率計算
        naCount++;
      }
    }
  }

  const positiveCount = returns.filter((r) => r > 0).length;
  const negativeCount = returns.filter((r) => r < 0).length;
  const total = returns.length + naCount + pendingCount;
  // 使用高精度計算，避免浮點數誤差
  const avgReturn =
    returns.length > 0
      ? Number((returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(10))
      : null;

  return {
    period,
    total,
    positiveCount,
    negativeCount,
    naCount,
    pendingCount,
    avgReturn,
  };
}

/**
 * 計算特定期間的報酬率
 * @param posts 包含情緒和漲跌幅的文章列表
 * @param period 計算期間（5, 30, 90, 365 天）
 * @returns 報酬率結果
 */
export function calculateReturnRate(
  posts: PostForReturnRate[],
  period: PriceChangePeriod
): ReturnRateResult {
  return calculatePeriodReturnRate(posts, period);
}

/**
 * 計算完整的報酬率統計
 * @param posts 包含情緒和漲跌幅的文章列表
 * @returns 各期間的報酬率統計
 */
export function calculateReturnRateStats(posts: PostForReturnRate[]): ReturnRateStats {
  const day5 = calculatePeriodReturnRate(posts, 5);
  const day30 = calculatePeriodReturnRate(posts, 30);
  const day90 = calculatePeriodReturnRate(posts, 90);
  const day365 = calculatePeriodReturnRate(posts, 365);

  // 計算整體平均報酬率（取各期間平均）
  const validResults = [day5, day30, day90, day365].filter((r) => r.avgReturn !== null);
  const totalPosts = posts.filter((p) => {
    const stockIds = Object.keys(p.priceChanges);
    return stockIds.some((sid) => {
      const eff = p.stockSentiments?.[sid] ?? p.sentiment;
      return eff !== 0;
    });
  }).length;

  let avgReturn: number | null = null;
  if (validResults.length > 0) {
    // 使用高精度計算，避免浮點數誤差
    const sum = validResults.reduce((acc, r) => acc + (r.avgReturn ?? 0), 0);
    avgReturn = Number((sum / validResults.length).toFixed(10));
  }

  return {
    day5,
    day30,
    day90,
    day365,
    overall: {
      total: totalPosts,
      avgReturn,
    },
  };
}

/**
 * 計算單一標的在特定 KOL 文章中的報酬率
 * @param posts 該 KOL 對該標的的文章列表
 * @param stockId 要計算的標的 ID
 * @returns 各期間的報酬率
 */
export function calculateStockReturnRateForKOL(
  posts: PostForReturnRate[],
  stockId: string
): ReturnRateStats {
  const filteredPosts = posts.filter((p) => stockId in p.priceChanges);
  return calculateReturnRateStats(filteredPosts);
}

/**
 * 格式化報酬率為帶正負號的百分比字串
 * @param rate 報酬率 (%)
 * @returns 格式化的百分比字串，例如 "+8.3%"、"-2.1%"
 */
export function formatReturnRate(rate: number | null): string {
  if (rate === null) return '-';
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

/**
 * 根據報酬率返回顏色類別
 * @param rate 報酬率 (%)
 * @param palette 顏色風格（可選，預設 'asian'）
 * @returns Tailwind CSS 顏色類別
 */
export function getReturnRateColorClass(rate: number | null, palette?: ColorPalette): string {
  if (rate === null) return 'text-gray-400';
  const colors = getFinancialColors(palette ?? 'asian');
  if (rate >= 5) return colors.bullish.text;
  if (rate >= 0) return colors.bullish.textLight;
  if (rate >= -5) return 'text-yellow-500';
  return colors.bearish.textLight;
}

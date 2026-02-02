/**
 * 勝率計算器
 * 根據文章情緒與股價漲跌計算預測勝率
 */

import type { Sentiment, PriceChangeByPeriod } from '@/domain/models/post';
import type { PriceChangePeriod } from './price-change.calculator';

export interface WinRateResult {
  period: PriceChangePeriod;
  total: number; // 有效文章數（排除中立）
  wins: number; // 勝利次數
  losses: number; // 失敗次數
  rate: number | null; // 勝率 (0-1)，若無有效文章則為 null
}

export interface WinRateStats {
  day5: WinRateResult;
  day30: WinRateResult;
  day90: WinRateResult;
  day365: WinRateResult;
  overall: {
    total: number;
    avgWinRate: number | null;
  };
}

export interface PostForWinRate {
  id: string;
  sentiment: Sentiment;
  priceChanges: Record<string, PriceChangeByPeriod>; // stockId -> priceChanges
}

/**
 * 判斷單篇文章在特定標的上是否為勝利
 * - 看多 (sentiment > 0) + 漲 (priceChange > 0) = 勝
 * - 看空 (sentiment < 0) + 跌 (priceChange < 0) = 勝
 * - 中立 (sentiment = 0) 不計入勝負
 */
export function isWin(sentiment: Sentiment, priceChange: number | null): boolean | null {
  if (sentiment === 0 || priceChange === null) {
    return null; // 中立或無價格資料不計入
  }

  if (sentiment > 0) {
    return priceChange > 0; // 看多 + 漲 = 勝
  } else {
    return priceChange < 0; // 看空 + 跌 = 勝
  }
}

/**
 * 計算特定期間的勝率
 */
function calculatePeriodWinRate(posts: PostForWinRate[], period: PriceChangePeriod): WinRateResult {
  const periodKey = `day${period}` as keyof PriceChangeByPeriod;
  let wins = 0;
  let losses = 0;

  for (const post of posts) {
    if (post.sentiment === 0) continue; // 中立不計

    // 計算每個標的的勝負
    const stockIds = Object.keys(post.priceChanges);
    for (const stockId of stockIds) {
      const priceChange = post.priceChanges[stockId]?.[periodKey];
      const result = isWin(post.sentiment, priceChange);

      if (result === true) {
        wins++;
      } else if (result === false) {
        losses++;
      }
    }
  }

  const total = wins + losses;
  // 使用高精度計算，避免浮點數誤差
  const rate = total > 0 ? Number((wins / total).toFixed(10)) : null;
  return {
    period,
    total,
    wins,
    losses,
    rate,
  };
}

/**
 * 計算特定期間的勝率（符合計畫中的簡單版本）
 * @param posts 包含情緒和漲跌幅的文章列表
 * @param period 計算期間（5, 30, 90, 365 天）
 * @returns 勝率結果
 */
export function calculateWinRate(
  posts: PostForWinRate[],
  period: PriceChangePeriod
): WinRateResult {
  return calculatePeriodWinRate(posts, period);
}

/**
 * 計算完整的勝率統計
 * @param posts 包含情緒和漲跌幅的文章列表
 * @returns 各期間的勝率統計
 */
export function calculateWinRateStats(posts: PostForWinRate[]): WinRateStats {
  const day5 = calculatePeriodWinRate(posts, 5);
  const day30 = calculatePeriodWinRate(posts, 30);
  const day90 = calculatePeriodWinRate(posts, 90);
  const day365 = calculatePeriodWinRate(posts, 365);

  // 計算整體平均勝率（使用 30 日作為主要指標）
  const validResults = [day5, day30, day90, day365].filter((r) => r.rate !== null);
  const totalPosts = posts.filter((p) => p.sentiment !== 0).length;

  let avgWinRate: number | null = null;
  if (validResults.length > 0) {
    // 使用高精度計算，避免浮點數誤差
    const sum = validResults.reduce((acc, r) => acc + (r.rate ?? 0), 0);
    avgWinRate = Number((sum / validResults.length).toFixed(10));
  }

  return {
    day5,
    day30,
    day90,
    day365,
    overall: {
      total: totalPosts,
      avgWinRate,
    },
  };
}

/**
 * 計算單一標的在特定 KOL 文章中的勝率
 * @param posts 該 KOL 對該標的的文章列表
 * @param stockId 要計算的標的 ID
 * @returns 各期間的勝率
 */
export function calculateStockWinRateForKOL(
  posts: PostForWinRate[],
  stockId: string
): WinRateStats {
  // 篩選出包含該標的的文章
  const filteredPosts = posts.filter((p) => stockId in p.priceChanges);
  return calculateWinRateStats(filteredPosts);
}

/**
 * 格式化勝率為百分比字串
 * @param rate 勝率 (0-1)
 * @returns 格式化的百分比字串
 */
export function formatWinRate(rate: number | null): string {
  if (rate === null) return '-';
  return `${Math.round(rate * 100)}%`;
}

/**
 * 根據勝率返回顏色類別
 * @param rate 勝率 (0-1)
 * @returns Tailwind CSS 顏色類別
 */
export function getWinRateColorClass(rate: number | null): string {
  if (rate === null) return 'text-gray-400';
  if (rate >= 0.7) return 'text-green-600';
  if (rate >= 0.5) return 'text-green-500';
  if (rate >= 0.4) return 'text-yellow-500';
  return 'text-red-500';
}

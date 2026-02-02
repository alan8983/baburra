/**
 * 論點彙整計算器
 */

import type { Sentiment } from '@/domain/models/post';

export interface ArgumentData {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  parentId: string | null;
  parentCode: string | null;
  parentName: string | null;
  sentiment: Sentiment;
  createdAt: Date;
}

export interface CategorySummary {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  parentCode: string | null;
  parentName: string | null;
  mentionCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  avgSentiment: number;
  firstMentionedAt: Date | null;
  lastMentionedAt: Date | null;
}

export interface GroupedSummary {
  parentCode: string;
  parentName: string;
  totalMentions: number;
  categories: CategorySummary[];
}

/**
 * 計算單一類別的論點統計
 */
export function calculateCategorySummary(
  categoryId: string,
  categoryCode: string,
  categoryName: string,
  parentCode: string | null,
  parentName: string | null,
  arguments_list: ArgumentData[]
): CategorySummary {
  const categoryArgs = arguments_list.filter((a) => a.categoryId === categoryId);

  if (categoryArgs.length === 0) {
    return {
      categoryId,
      categoryCode,
      categoryName,
      parentCode,
      parentName,
      mentionCount: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      avgSentiment: 0,
      firstMentionedAt: null,
      lastMentionedAt: null,
    };
  }

  const mentionCount = categoryArgs.length;
  const bullishCount = categoryArgs.filter((a) => a.sentiment > 0).length;
  const bearishCount = categoryArgs.filter((a) => a.sentiment < 0).length;
  const neutralCount = categoryArgs.filter((a) => a.sentiment === 0).length;
  const avgSentiment = categoryArgs.reduce((sum, a) => sum + a.sentiment, 0) / mentionCount;

  const sortedByDate = categoryArgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const firstMentionedAt = sortedByDate[0].createdAt;
  const lastMentionedAt = sortedByDate[sortedByDate.length - 1].createdAt;

  return {
    categoryId,
    categoryCode,
    categoryName,
    parentCode,
    parentName,
    mentionCount,
    bullishCount,
    bearishCount,
    neutralCount,
    avgSentiment,
    firstMentionedAt,
    lastMentionedAt,
  };
}

/**
 * 計算並按父類別分組的論點統計
 */
export function calculateGroupedSummary(
  categories: {
    id: string;
    code: string;
    name: string;
    parentId: string | null;
    parentCode?: string;
    parentName?: string;
  }[],
  arguments_list: ArgumentData[]
): GroupedSummary[] {
  // 找出父類別
  const parentCategories = categories.filter((c) => c.parentId === null);
  const childCategories = categories.filter((c) => c.parentId !== null);

  const result: GroupedSummary[] = [];

  for (const parent of parentCategories) {
    const children = childCategories.filter((c) => c.parentId === parent.id);
    const categorySummaries: CategorySummary[] = [];

    for (const child of children) {
      const summary = calculateCategorySummary(
        child.id,
        child.code,
        child.name,
        parent.code,
        parent.name,
        arguments_list
      );

      if (summary.mentionCount > 0) {
        categorySummaries.push(summary);
      }
    }

    const totalMentions = categorySummaries.reduce((sum, c) => sum + c.mentionCount, 0);

    if (totalMentions > 0) {
      result.push({
        parentCode: parent.code,
        parentName: parent.name,
        totalMentions,
        categories: categorySummaries.sort((a, b) => b.mentionCount - a.mentionCount),
      });
    }
  }

  return result.sort((a, b) => b.totalMentions - a.totalMentions);
}

/**
 * 計算時間分布（按月分組）
 */
export function calculateTimeDistribution(arguments_list: ArgumentData[]): {
  month: string;
  count: number;
  bullishCount: number;
  bearishCount: number;
}[] {
  if (arguments_list.length === 0) return [];

  // 按月分組
  const monthMap = new Map<string, { count: number; bullishCount: number; bearishCount: number }>();

  for (const arg of arguments_list) {
    const monthKey = `${arg.createdAt.getFullYear()}-${String(arg.createdAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { count: 0, bullishCount: 0, bearishCount: 0 });
    }

    const data = monthMap.get(monthKey)!;
    data.count++;
    if (arg.sentiment > 0) data.bullishCount++;
    if (arg.sentiment < 0) data.bearishCount++;
  }

  // 轉換為陣列並排序
  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      ...data,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * 計算情緒分數趨勢（移動平均）
 */
export function calculateSentimentTrend(
  arguments_list: ArgumentData[],
  windowSize: number = 5
): {
  date: Date;
  sentiment: number;
  movingAvg: number;
}[] {
  if (arguments_list.length === 0) return [];

  // 按日期排序
  const sorted = [...arguments_list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const result: { date: Date; sentiment: number; movingAvg: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const window = sorted.slice(windowStart, i + 1);
    const movingAvg = window.reduce((sum, a) => sum + a.sentiment, 0) / window.length;

    result.push({
      date: sorted[i].createdAt,
      sentiment: sorted[i].sentiment,
      movingAvg,
    });
  }

  return result;
}

// KOL 勝率 API
// GET /api/kols/[id]/win-rate - 取得 KOL 的勝率統計

import { NextResponse } from 'next/server';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import {
  calculatePriceChanges,
  calculateWinRateStats,
  type PostForWinRate,
} from '@/domain/calculators';
import type { PriceChangeByPeriod } from '@/domain/models';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // 1. 取得 KOL 的所有文章
    const { data: posts } = await listPosts({
      kolId: id,
      limit: 1000, // 取得所有文章以計算完整勝率
    });

    if (posts.length === 0) {
      return NextResponse.json({
        day5: { period: 5, total: 0, wins: 0, losses: 0, rate: null },
        day30: { period: 30, total: 0, wins: 0, losses: 0, rate: null },
        day90: { period: 90, total: 0, wins: 0, losses: 0, rate: null },
        day365: { period: 365, total: 0, wins: 0, losses: 0, rate: null },
        overall: { total: 0, avgWinRate: null },
      });
    }

    // 2. 收集所有相關標的
    const allStockIds = new Set<string>();
    const stockTickerMap = new Map<string, string>(); // id -> ticker

    for (const post of posts) {
      for (const stock of post.stocks) {
        allStockIds.add(stock.id);
        stockTickerMap.set(stock.id, stock.ticker);
      }
    }

    // 3. 取得所有標的的股價資料（使用 365 天範圍）
    const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> = {};

    // 找出最早的發文日期
    const earliestDate = posts.reduce((min, post) => {
      const postedAt = new Date(post.postedAt);
      return postedAt < min ? postedAt : min;
    }, new Date());

    // 往前推 7 天作為起始日期（確保能取得發文當天的價格）
    const startDate = new Date(earliestDate);
    startDate.setDate(startDate.getDate() - 7);

    for (const stockId of allStockIds) {
      const ticker = stockTickerMap.get(stockId);
      if (ticker) {
        try {
          const { candles } = await getStockPrices(ticker, {
            startDate: startDate.toISOString().slice(0, 10),
          });
          candlesByStock[stockId] = candles;
        } catch {
          // 無法取得股價資料，略過
          candlesByStock[stockId] = [];
        }
      }
    }

    // 4. 計算每篇文章的漲跌幅
    const postsForWinRate: PostForWinRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};

      for (const stock of post.stocks) {
        const candles = candlesByStock[stock.id];
        if (candles && candles.length > 0) {
          priceChanges[stock.id] = calculatePriceChanges(
            candles,
            new Date(post.postedAt)
          );
        } else {
          priceChanges[stock.id] = {
            day5: null,
            day30: null,
            day90: null,
            day365: null,
          };
        }
      }

      return {
        id: post.id,
        sentiment: post.sentiment,
        priceChanges,
      };
    });

    // 5. 計算勝率
    const stats = calculateWinRateStats(postsForWinRate);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to calculate KOL win rate:', error);
    return NextResponse.json(
      { error: 'Failed to calculate win rate' },
      { status: 500 }
    );
  }
}

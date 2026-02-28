// KOL 報酬率 API
// GET /api/kols/[id]/return-rate - 取得 KOL 的報酬率統計

import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/error';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import {
  calculatePriceChanges,
  calculateReturnRateStats,
  type PostForReturnRate,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // 1. 取得 KOL 的所有文章
    const { data: posts } = await listPosts({
      kolId: id,
      limit: 1000, // 取得所有文章以計算完整報酬率
    });

    if (posts.length === 0) {
      return NextResponse.json({
        day5: {
          period: 5,
          total: 0,
          positiveCount: 0,
          negativeCount: 0,
          naCount: 0,
          pendingCount: 0,
          avgReturn: null,
        },
        day30: {
          period: 30,
          total: 0,
          positiveCount: 0,
          negativeCount: 0,
          naCount: 0,
          pendingCount: 0,
          avgReturn: null,
        },
        day90: {
          period: 90,
          total: 0,
          positiveCount: 0,
          negativeCount: 0,
          naCount: 0,
          pendingCount: 0,
          avgReturn: null,
        },
        day365: {
          period: 365,
          total: 0,
          positiveCount: 0,
          negativeCount: 0,
          naCount: 0,
          pendingCount: 0,
          avgReturn: null,
        },
        overall: { total: 0, avgReturn: null },
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

    // 3. 取得所有標的的股價資料
    const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> =
      {};

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
    const postsForReturnRate: PostForReturnRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};

      for (const stock of post.stocks) {
        const candles = candlesByStock[stock.id];
        if (candles && candles.length > 0) {
          priceChanges[stock.id] = calculatePriceChanges(candles, new Date(post.postedAt));
        } else {
          priceChanges[stock.id] = {
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

      // Build per-stock sentiments from post.stocks
      const stockSentiments: Record<string, Sentiment> = {};
      for (const s of post.stocks) {
        if (s.sentiment !== null) {
          stockSentiments[s.id] = s.sentiment;
        }
      }

      return {
        id: post.id,
        sentiment: post.sentiment,
        ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
        priceChanges,
      };
    });

    // 5. 計算報酬率
    const stats = calculateReturnRateStats(postsForReturnRate);

    return NextResponse.json(stats);
  } catch (error) {
    return internalError(error, 'Failed to calculate return rate');
  }
}

// Stock 報酬率 API
// GET /api/stocks/[ticker]/return-rate - 取得標的的報酬率統計

import { NextResponse } from 'next/server';
import { notFoundError, internalError } from '@/lib/api/error';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import {
  calculatePriceChanges,
  calculateReturnRateStats,
  type PostForReturnRate,
} from '@/domain/calculators';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';
import { createAdminClient } from '@/infrastructure/supabase/admin';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { ticker } = await context.params;

    // 1. 取得標的 ID
    const supabase = createAdminClient();
    const { data: stock } = await supabase
      .from('stocks')
      .select('id')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (!stock) {
      return notFoundError('Stock');
    }

    // 2. 取得與該標的相關的所有文章
    const { data: posts } = await listPosts({
      stockTicker: ticker.toUpperCase(),
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

    // 3. 取得股價資料
    // 找出最早的發文日期
    const earliestDate = posts.reduce((min, post) => {
      const postedAt = new Date(post.postedAt);
      return postedAt < min ? postedAt : min;
    }, new Date());

    // 往前推 7 天作為起始日期
    const startDate = new Date(earliestDate);
    startDate.setDate(startDate.getDate() - 7);

    let candles: Awaited<ReturnType<typeof getStockPrices>>['candles'] = [];
    try {
      const priceData = await getStockPrices(ticker.toUpperCase(), {
        startDate: startDate.toISOString().slice(0, 10),
      });
      candles = priceData.candles;
    } catch (err) {
      console.error(
        `[return-rate] Failed to fetch prices for ${ticker.toUpperCase()}:`,
        err instanceof Error ? err.message : err
      );
    }

    if (candles.length === 0) {
      console.warn(
        `[return-rate] No candles for ${ticker.toUpperCase()}, ${posts.length} posts will have null price changes`
      );
    }

    // 4. 計算每篇文章的漲跌幅（只計算該標的）
    const postsForReturnRate: PostForReturnRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};

      if (candles.length > 0) {
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

// Stock 勝率 API
// GET /api/stocks/[ticker]/win-rate - 取得標的的勝率統計

import { NextResponse } from 'next/server';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import {
  calculatePriceChanges,
  calculateWinRateStats,
  type PostForWinRate,
} from '@/domain/calculators';
import type { PriceChangeByPeriod } from '@/domain/models';
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
      return NextResponse.json(
        { error: 'Stock not found' },
        { status: 404 }
      );
    }

    // 2. 取得與該標的相關的所有文章
    const { data: posts } = await listPosts({
      stockTicker: ticker.toUpperCase(),
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
    } catch {
      // 無法取得股價資料
    }

    // 4. 計算每篇文章的漲跌幅（只計算該標的）
    const postsForWinRate: PostForWinRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};

      if (candles.length > 0) {
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
    console.error('Failed to calculate stock win rate:', error);
    return NextResponse.json(
      { error: 'Failed to calculate win rate' },
      { status: 500 }
    );
  }
}

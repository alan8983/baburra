// Stock 勝率 API
// GET /api/stocks/[ticker]/win-rate - 取得標的的勝率統計（動態 1σ 門檻）

import { NextResponse } from 'next/server';
import { notFoundError, internalError } from '@/lib/api/error';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import { calculatePriceChanges, emptyStats } from '@/domain/calculators';
import { computeWinRateStats, type PostForWinRate } from '@/domain/services/win-rate.service';
import { StockPriceVolatilityProvider } from '@/infrastructure/providers/stock-price-volatility.provider';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';
import { createAdminClient } from '@/infrastructure/supabase/admin';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { ticker } = await context.params;
    const upper = ticker.toUpperCase();

    const supabase = createAdminClient();
    const { data: stock } = await supabase.from('stocks').select('id').eq('ticker', upper).single();
    if (!stock) return notFoundError('Stock');

    const { data: posts } = await listPosts({ stockTicker: upper, limit: 1000 });
    if (posts.length === 0) {
      return NextResponse.json(emptyStats());
    }

    const earliestDate = posts.reduce((min, post) => {
      const postedAt = new Date(post.postedAt);
      return postedAt < min ? postedAt : min;
    }, new Date());
    const startDate = new Date(earliestDate);
    startDate.setDate(startDate.getDate() - 7);

    let candles: Awaited<ReturnType<typeof getStockPrices>>['candles'] = [];
    try {
      const priceData = await getStockPrices(upper, {
        startDate: startDate.toISOString().slice(0, 10),
      });
      candles = priceData.candles;
    } catch (err) {
      console.error(`[win-rate] failed to fetch prices for ${upper}:`, err);
    }

    const postsForWinRate: PostForWinRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};
      priceChanges[stock.id] =
        candles.length > 0
          ? calculatePriceChanges(candles, new Date(post.postedAt))
          : {
              day5: null,
              day30: null,
              day90: null,
              day365: null,
              day5Status: 'no_data',
              day30Status: 'no_data',
              day90Status: 'no_data',
              day365Status: 'no_data',
            };

      const stockSentiments: Record<string, Sentiment> = {};
      for (const s of post.stocks) {
        if (s.sentiment !== null) stockSentiments[s.id] = s.sentiment;
      }

      return {
        id: post.id,
        sentiment: post.sentiment,
        postedAt: new Date(post.postedAt),
        ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
        tickerByStockId: { [stock.id]: upper },
        priceChanges,
      };
    });

    const stats = await computeWinRateStats({
      posts: postsForWinRate,
      provider: new StockPriceVolatilityProvider(),
    });

    return NextResponse.json(stats);
  } catch (error) {
    return internalError(error, 'Failed to calculate win rate');
  }
}

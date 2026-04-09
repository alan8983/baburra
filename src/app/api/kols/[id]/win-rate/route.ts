// KOL 勝率 API
// GET /api/kols/[id]/win-rate - 取得 KOL 的勝率統計（動態 1σ 門檻）

import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/error';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import { calculatePriceChanges, emptyStats } from '@/domain/calculators';
import { computeWinRateStats, type PostForWinRate } from '@/domain/services/win-rate.service';
import { StockPriceVolatilityProvider } from '@/infrastructure/providers/stock-price-volatility.provider';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { data: posts } = await listPosts({ kolId: id, limit: 1000 });
    if (posts.length === 0) {
      return NextResponse.json(emptyStats());
    }

    // Collect tickers per stockId
    const tickerByStockId = new Map<string, string>();
    for (const post of posts) {
      for (const stock of post.stocks) {
        tickerByStockId.set(stock.id, stock.ticker);
      }
    }

    // Earliest postedAt → backfill candles
    const earliestDate = posts.reduce((min, post) => {
      const postedAt = new Date(post.postedAt);
      return postedAt < min ? postedAt : min;
    }, new Date());
    const startDate = new Date(earliestDate);
    startDate.setDate(startDate.getDate() - 7);

    const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> =
      {};
    for (const [stockId, ticker] of tickerByStockId) {
      try {
        const { candles } = await getStockPrices(ticker, {
          startDate: startDate.toISOString().slice(0, 10),
        });
        candlesByStock[stockId] = candles;
      } catch {
        candlesByStock[stockId] = [];
      }
    }

    const postsForWinRate: PostForWinRate[] = posts.map((post) => {
      const priceChanges: Record<string, PriceChangeByPeriod> = {};
      const tickerMap: Record<string, string> = {};
      for (const stock of post.stocks) {
        tickerMap[stock.id] = stock.ticker;
        const candles = candlesByStock[stock.id];
        priceChanges[stock.id] =
          candles && candles.length > 0
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
      }
      const stockSentiments: Record<string, Sentiment> = {};
      for (const s of post.stocks) {
        if (s.sentiment !== null) stockSentiments[s.id] = s.sentiment;
      }
      return {
        id: post.id,
        sentiment: post.sentiment,
        postedAt: new Date(post.postedAt),
        ...(Object.keys(stockSentiments).length > 0 && { stockSentiments }),
        tickerByStockId: tickerMap,
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

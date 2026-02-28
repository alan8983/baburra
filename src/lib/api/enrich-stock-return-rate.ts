/**
 * Enrich stocks with 30-day return rate data.
 * Shared helper used by stock-related API routes.
 */

import { listPosts } from '@/infrastructure/repositories/post.repository';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import {
  calculatePriceChanges,
  calculateReturnRate,
  type PostForReturnRate,
} from '@/domain/calculators';
import type { StockWithStats } from '@/domain/models/stock';
import type { PriceChangeByPeriod, Sentiment } from '@/domain/models';

/**
 * Populate `returnRate` (30-day avg) on each stock in-place.
 * Failures for individual stocks are logged and silently set to null.
 */
export async function enrichStocksWithReturnRate(stocks: StockWithStats[]): Promise<void> {
  if (stocks.length === 0) return;

  const results = await Promise.allSettled(stocks.map((stock) => computeReturnRateForStock(stock)));

  for (let i = 0; i < stocks.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      stocks[i].returnRate = result.value;
    } else {
      console.error(`[enrichReturnRate] Failed for ${stocks[i].ticker}:`, result.reason);
      stocks[i].returnRate = null;
    }
  }
}

async function computeReturnRateForStock(stock: StockWithStats): Promise<number | null> {
  // Fetch posts for this stock
  const { data: posts } = await listPosts({
    stockTicker: stock.ticker,
    limit: 100,
  });

  if (posts.length === 0) return null;

  // Determine date range for price data
  const earliestDate = posts.reduce((min, post) => {
    const d = new Date(post.postedAt);
    return d < min ? d : min;
  }, new Date());
  const startDate = new Date(earliestDate);
  startDate.setDate(startDate.getDate() - 7);

  // Fetch candles
  let candles: Awaited<ReturnType<typeof getStockPrices>>['candles'] = [];
  try {
    const priceData = await getStockPrices(stock.ticker, {
      startDate: startDate.toISOString().slice(0, 10),
    });
    candles = priceData.candles;
  } catch {
    return null;
  }

  if (candles.length === 0) return null;

  // Build PostForReturnRate entries
  const postsForCalc: PostForReturnRate[] = posts.map((post) => {
    const priceChanges: Record<string, PriceChangeByPeriod> = {};
    priceChanges[stock.id] = calculatePriceChanges(candles, new Date(post.postedAt));

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

  // Calculate 30-day return rate
  const result = calculateReturnRate(postsForCalc, 30);
  return result.avgReturn;
}

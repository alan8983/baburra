/**
 * Enrich posts with stock price change data (5-day, 30-day, etc.)
 * Shared helper used by post-related API routes.
 */

import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';
import { calculateBatchPriceChanges } from '@/domain/calculators';
import type { PostWithPriceChanges } from '@/domain/models';

export async function enrichPostsWithPriceChanges(posts: PostWithPriceChanges[]): Promise<void> {
  if (posts.length === 0) return;

  // Collect unique stocks across all posts
  const stockMap = new Map<string, string>(); // id -> ticker
  for (const post of posts) {
    for (const stock of post.stocks) {
      stockMap.set(stock.id, stock.ticker);
    }
  }
  if (stockMap.size === 0) return;

  // Find earliest post date to determine price fetch range
  const earliestDate = posts.reduce((min, post) => {
    const d = new Date(post.postedAt);
    return d < min ? d : min;
  }, new Date());
  const startDate = new Date(earliestDate);
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().slice(0, 10);

  // Fetch candles for each unique stock in parallel
  const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> = {};
  const entries = Array.from(stockMap.entries());
  const results = await Promise.allSettled(
    entries.map(([, ticker]) => getStockPrices(ticker, { startDate: startDateStr }))
  );
  for (let i = 0; i < entries.length; i++) {
    const [stockId] = entries[i];
    const result = results[i];
    candlesByStock[stockId] = result.status === 'fulfilled' ? result.value.candles : [];
  }

  // Batch-calculate price changes
  const batchInput = posts.map((p) => ({
    id: p.id,
    postedAt: new Date(p.postedAt),
    stockIds: p.stocks.map((s) => s.id),
  }));
  const allChanges = calculateBatchPriceChanges(batchInput, candlesByStock);

  // Merge results into posts
  for (const post of posts) {
    if (allChanges[post.id]) {
      post.priceChanges = allChanges[post.id];
    }
  }
}

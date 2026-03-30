/**
 * Enrich posts with stock price change data (5-day, 30-day, etc.)
 * Calculates price changes relative to each post's publication date.
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

  // Find earliest post date and fetch candles from that point (minus buffer for weekends)
  const earliestDate = posts.reduce((min, post) => {
    const d = new Date(post.postedAt);
    return d < min ? d : min;
  }, new Date());
  const startDate = new Date(earliestDate);
  startDate.setDate(startDate.getDate() - 7);
  const startDateStr = startDate.toISOString().slice(0, 10);

  // Fetch candles for each unique stock in parallel (5s timeout per stock)
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);

  const candlesByStock: Record<string, Awaited<ReturnType<typeof getStockPrices>>['candles']> = {};
  const entries = Array.from(stockMap.entries());
  const results = await Promise.allSettled(
    entries.map(([, ticker]) =>
      withTimeout(getStockPrices(ticker, { startDate: startDateStr }), 5000)
    )
  );
  const failedTickers: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [stockId, ticker] = entries[i];
    const result = results[i];
    if (result.status === 'rejected') {
      failedTickers.push(ticker);
    }
    candlesByStock[stockId] = result.status === 'fulfilled' ? result.value.candles : [];
  }
  if (failedTickers.length > 0) {
    if (failedTickers.length === entries.length) {
      console.warn(
        `[enrichPriceChanges] All ${failedTickers.length} stocks failed — price data unavailable`
      );
    } else {
      console.debug(
        `[enrichPriceChanges] ${failedTickers.length}/${entries.length} stocks failed: ${failedTickers.join(', ')}`
      );
    }
  }

  // Build posts input for batch calculation (post-relative price changes)
  const postsInput = posts.map((post) => ({
    id: post.id,
    postedAt: new Date(post.postedAt),
    stockIds: post.stocks.map((s) => s.id),
  }));

  const priceChangesByPost = calculateBatchPriceChanges(postsInput, candlesByStock);

  // Assign each post its own price changes (relative to its postedAt date)
  for (const post of posts) {
    post.priceChanges = priceChangesByPost[post.id] ?? {};
  }
}

/**
 * Stock Price Repository Tests
 * Verifies Supabase caching behavior for stock price data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase admin client
const mockFrom = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

// Mock Tiingo client
vi.mock('@/infrastructure/api/tiingo.client', () => ({
  fetchTiingoPrices: vi.fn(),
}));

// Mock Twelve Data client
vi.mock('@/infrastructure/api/twelve-data.client', () => ({
  fetchTwelveDataPrices: vi.fn(),
}));

import { getStockPrices } from '../stock-price.repository';
import { fetchTiingoPrices } from '@/infrastructure/api/tiingo.client';
import { fetchTwelveDataPrices } from '@/infrastructure/api/twelve-data.client';

const STOCK_ID = '00000000-0000-0000-0000-000000000001';

const tiingoRows = [
  { date: '2025-01-02T00:00:00Z', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
  { date: '2025-01-03T00:00:00Z', open: 105, high: 115, low: 100, close: 112, volume: 1200 },
];

const dbRows = [
  {
    id: 'a',
    stock_id: STOCK_ID,
    date: '2025-01-02',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
    fetched_at: new Date().toISOString(),
  },
  {
    id: 'b',
    stock_id: STOCK_ID,
    date: '2025-01-03',
    open: 105,
    high: 115,
    low: 100,
    close: 112,
    volume: 1200,
    fetched_at: new Date().toISOString(),
  },
];

function setupMockChain(stocksResult: unknown, pricesResult: unknown, upsertResult?: unknown) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'stocks') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(stocksResult),
          }),
        }),
      };
    }
    if (table === 'stock_prices') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({
                order: () => Promise.resolve(pricesResult),
              }),
            }),
          }),
        }),
        upsert: () => Promise.resolve(upsertResult ?? { error: null }),
      };
    }
    return {};
  });
}

describe('stock-price.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set "today" to 2025-01-10 so test dates are in the past
    vi.setSystemTime(new Date('2025-01-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStockPrices', () => {
    it('should return data from Supabase cache when valid (historical dates)', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: dbRows, error: null }
      );

      const result = await getStockPrices('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTiingoPrices).not.toHaveBeenCalled();
      expect(result.candles).toHaveLength(2);
      expect(result.volumes).toHaveLength(2);
      expect(result.candles[0]).toEqual({
        time: '2025-01-02',
        open: 100,
        high: 110,
        low: 95,
        close: 105,
      });
    });

    it('should fetch from Tiingo and cache on cache miss', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: [], error: null },
        { error: null }
      );
      vi.mocked(fetchTiingoPrices).mockResolvedValueOnce(tiingoRows);

      const result = await getStockPrices('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTiingoPrices).toHaveBeenCalledWith('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
        market: 'US',
      });
      expect(result.candles).toHaveLength(2);
      expect(result.candles[0].close).toBe(105);
      // Verify upsert was attempted
      expect(mockFrom).toHaveBeenCalledWith('stock_prices');
    });

    it('should re-fetch when today row is expired', async () => {
      const expiredFetchedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const today = '2025-01-10';
      const todayDbRows = [
        {
          id: 'c',
          stock_id: STOCK_ID,
          date: today,
          open: 200,
          high: 210,
          low: 195,
          close: 205,
          volume: 5000,
          fetched_at: expiredFetchedAt,
        },
      ];

      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: todayDbRows, error: null },
        { error: null }
      );
      vi.mocked(fetchTiingoPrices).mockResolvedValueOnce([
        { date: '2025-01-10T00:00:00Z', open: 200, high: 215, low: 195, close: 210, volume: 6000 },
      ]);

      const result = await getStockPrices('AAPL', {
        startDate: '2025-01-10',
        endDate: '2025-01-10',
      });

      expect(fetchTiingoPrices).toHaveBeenCalled();
      expect(result.candles[0].close).toBe(210); // Fresh data
    });

    it('should skip DB cache when stock not in stocks table', async () => {
      setupMockChain({ data: null, error: { code: 'PGRST116' } }, { data: [], error: null });
      vi.mocked(fetchTiingoPrices).mockResolvedValueOnce(tiingoRows);

      const result = await getStockPrices('UNKNOWN', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTiingoPrices).toHaveBeenCalled();
      expect(result.candles).toHaveLength(2);
    });

    it('should serve stale cache when Tiingo API fails', async () => {
      const staleDbRows = dbRows.map((r) => ({
        ...r,
        fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      }));

      // endDate is today so cache is expired → Tiingo will be called
      const today = '2025-01-10';
      const staleWithToday = [
        ...staleDbRows,
        {
          id: 'c',
          stock_id: STOCK_ID,
          date: today,
          open: 200,
          high: 210,
          low: 195,
          close: 205,
          volume: 5000,
          fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      ];

      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: staleWithToday, error: null }
      );
      vi.mocked(fetchTiingoPrices).mockRejectedValueOnce(new Error('Tiingo API error 500'));

      const result = await getStockPrices('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-10',
      });

      expect(result.candles).toHaveLength(3); // Stale data returned
    });

    it('should throw when Tiingo fails and no stale cache exists', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: [], error: null }
      );
      vi.mocked(fetchTiingoPrices).mockRejectedValueOnce(new Error('Tiingo API error 500'));

      await expect(
        getStockPrices('AAPL', { startDate: '2025-01-02', endDate: '2025-01-03' })
      ).rejects.toThrow('Tiingo API error 500');
    });

    it('should route TW market stock to Twelve Data', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'TW' }, error: null },
        { data: [], error: null },
        { error: null }
      );
      vi.mocked(fetchTwelveDataPrices).mockResolvedValueOnce(tiingoRows);

      const result = await getStockPrices('2330.TW', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTwelveDataPrices).toHaveBeenCalledWith('2330.TW', 'TW', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });
      expect(fetchTiingoPrices).not.toHaveBeenCalled();
      expect(result.candles).toHaveLength(2);
    });

    it('should route HK market stock to Twelve Data', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'HK' }, error: null },
        { data: [], error: null },
        { error: null }
      );
      vi.mocked(fetchTwelveDataPrices).mockResolvedValueOnce(tiingoRows);

      const result = await getStockPrices('0700.HK', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTwelveDataPrices).toHaveBeenCalledWith('0700.HK', 'HK', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });
      expect(fetchTiingoPrices).not.toHaveBeenCalled();
      expect(result.candles).toHaveLength(2);
    });

    it('should still route US market to Tiingo', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: [], error: null },
        { error: null }
      );
      vi.mocked(fetchTiingoPrices).mockResolvedValueOnce(tiingoRows);

      await getStockPrices('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTiingoPrices).toHaveBeenCalledWith('AAPL', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
        market: 'US',
      });
      expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    });

    it('should still route CRYPTO market to Tiingo', async () => {
      setupMockChain(
        { data: { id: STOCK_ID, market: 'CRYPTO' }, error: null },
        { data: [], error: null },
        { error: null }
      );
      vi.mocked(fetchTiingoPrices).mockResolvedValueOnce(tiingoRows);

      await getStockPrices('BTC', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
      });

      expect(fetchTiingoPrices).toHaveBeenCalledWith('BTC', {
        startDate: '2025-01-02',
        endDate: '2025-01-03',
        market: 'CRYPTO',
      });
      expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    });

    it('should return fresh cache for today when fetched_at is recent', async () => {
      const today = '2025-01-10';
      const freshDbRows = [
        {
          id: 'd',
          stock_id: STOCK_ID,
          date: today,
          open: 200,
          high: 210,
          low: 195,
          close: 205,
          volume: 5000,
          fetched_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        },
      ];

      setupMockChain(
        { data: { id: STOCK_ID, market: 'US' }, error: null },
        { data: freshDbRows, error: null }
      );

      const result = await getStockPrices('AAPL', {
        startDate: '2025-01-10',
        endDate: '2025-01-10',
      });

      expect(fetchTiingoPrices).not.toHaveBeenCalled();
      expect(result.candles).toHaveLength(1);
      expect(result.candles[0].close).toBe(205);
    });
  });
});

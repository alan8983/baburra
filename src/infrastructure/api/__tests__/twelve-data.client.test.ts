import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseTicker, fetchTwelveDataPrices } from '../twelve-data.client';

describe('twelve-data.client', () => {
  describe('parseTicker', () => {
    it('should parse TW ticker: 2330.TW → symbol 2330, exchange TWSE', () => {
      expect(parseTicker('2330.TW', 'TW')).toEqual({ symbol: '2330', exchange: 'TWSE' });
    });

    it('should parse HK ticker: 0700.HK → symbol 0700, exchange HKEX', () => {
      expect(parseTicker('0700.HK', 'HK')).toEqual({ symbol: '0700', exchange: 'HKEX' });
    });

    it('should handle ticker without suffix', () => {
      expect(parseTicker('2330', 'TW')).toEqual({ symbol: '2330', exchange: 'TWSE' });
    });

    it('should return null for unsupported market', () => {
      expect(parseTicker('AAPL', 'US')).toBeNull();
      expect(parseTicker('BTC', 'CRYPTO')).toBeNull();
    });
  });

  describe('fetchTwelveDataPrices', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv('TWELVE_DATA_API_KEY', 'test-api-key');
      vi.stubGlobal('fetch', mockFetch);
    });

    const sampleResponse = {
      meta: { symbol: '2330', exchange: 'TWSE' },
      values: [
        {
          datetime: '2026-03-17',
          open: '595.00',
          high: '600.00',
          low: '590.00',
          close: '598.00',
          volume: '23456789',
        },
        {
          datetime: '2026-03-14',
          open: '590.00',
          high: '596.00',
          low: '585.00',
          close: '594.00',
          volume: '18000000',
        },
      ],
    };

    it('should normalize string values to numbers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const result = await fetchTwelveDataPrices('2330.TW', 'TW');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-03-17',
        open: 595,
        high: 600,
        low: 590,
        close: 598,
        volume: 23456789,
      });
      expect(result[1]).toEqual({
        date: '2026-03-14',
        open: 590,
        high: 596,
        low: 585,
        close: 594,
        volume: 18000000,
      });
    });

    it('should build correct URL with symbol, exchange, and date params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      await fetchTwelveDataPrices('2330.TW', 'TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-17',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('symbol=2330');
      expect(calledUrl).toContain('exchange=TWSE');
      expect(calledUrl).toContain('interval=1day');
      expect(calledUrl).toContain('start_date=2026-03-01');
      expect(calledUrl).toContain('end_date=2026-03-17');
      expect(calledUrl).toContain('apikey=test-api-key');
    });

    it('should return empty array on 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      const result = await fetchTwelveDataPrices('9999.TW', 'TW');
      expect(result).toEqual([]);
    });

    it('should return empty array when API returns error status with 404 code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'error',
            code: 404,
            message: 'Symbol not found',
          }),
      });

      const result = await fetchTwelveDataPrices('9999.TW', 'TW');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty values', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ meta: {}, values: [] }),
      });

      const result = await fetchTwelveDataPrices('2330.TW', 'TW');
      expect(result).toEqual([]);
    });

    it('should throw on non-404 API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      await expect(fetchTwelveDataPrices('2330.TW', 'TW')).rejects.toThrow(
        'Twelve Data API error 500'
      );
    });

    it('should throw on API error status with non-404 code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'error',
            code: 429,
            message: 'Rate limit exceeded',
          }),
      });

      await expect(fetchTwelveDataPrices('2330.TW', 'TW')).rejects.toThrow(
        'Twelve Data API error: Rate limit exceeded'
      );
    });

    it('should return empty array for unsupported market', async () => {
      const result = await fetchTwelveDataPrices('AAPL', 'US');
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw when TWELVE_DATA_API_KEY is not set', async () => {
      vi.stubEnv('TWELVE_DATA_API_KEY', '');

      await expect(fetchTwelveDataPrices('2330.TW', 'TW')).rejects.toThrow(
        'TWELVE_DATA_API_KEY is not set'
      );
    });
  });
});

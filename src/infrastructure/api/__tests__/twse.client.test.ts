import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseStockCode,
  rocToGregorian,
  parseNumber,
  getMonthlyDates,
  fetchTwsePrices,
} from '../twse.client';

describe('twse.client', () => {
  describe('parseStockCode', () => {
    it('should strip .TW suffix: 2330.TW → 2330', () => {
      expect(parseStockCode('2330.TW')).toBe('2330');
    });

    it('should strip .TW suffix: 0050.TW → 0050', () => {
      expect(parseStockCode('0050.TW')).toBe('0050');
    });

    it('should handle ticker without suffix', () => {
      expect(parseStockCode('2330')).toBe('2330');
    });
  });

  describe('rocToGregorian', () => {
    it('should convert 115/03/18 → 2026-03-18', () => {
      expect(rocToGregorian('115/03/18')).toBe('2026-03-18');
    });

    it('should convert 114/12/31 → 2025-12-31', () => {
      expect(rocToGregorian('114/12/31')).toBe('2025-12-31');
    });

    it('should convert 100/01/01 → 2011-01-01', () => {
      expect(rocToGregorian('100/01/01')).toBe('2011-01-01');
    });

    it('should return input unchanged for invalid format', () => {
      expect(rocToGregorian('2026-03-18')).toBe('2026-03-18');
    });
  });

  describe('parseNumber', () => {
    it('should parse "1,940.00" → 1940', () => {
      expect(parseNumber('1,940.00')).toBe(1940);
    });

    it('should parse "57,404,594" → 57404594', () => {
      expect(parseNumber('57,404,594')).toBe(57404594);
    });

    it('should parse "113,190,016,272" → 113190016272', () => {
      expect(parseNumber('113,190,016,272')).toBe(113190016272);
    });

    it('should parse plain number string "100.50" → 100.5', () => {
      expect(parseNumber('100.50')).toBe(100.5);
    });
  });

  describe('getMonthlyDates', () => {
    it('should generate monthly dates covering the range', () => {
      const dates = getMonthlyDates('2026-01-15', '2026-03-18');
      expect(dates).toEqual(['20260101', '20260201', '20260301']);
    });

    it('should return single month for same-month range', () => {
      const dates = getMonthlyDates('2026-03-01', '2026-03-18');
      expect(dates).toEqual(['20260301']);
    });

    it('should handle ~90-day range with ~3 months', () => {
      const dates = getMonthlyDates('2025-12-20', '2026-03-18');
      expect(dates).toEqual(['20251201', '20260101', '20260201', '20260301']);
    });
  });

  describe('fetchTwsePrices', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockReset();
      vi.stubGlobal('fetch', mockFetch);
    });

    const sampleResponse = {
      stat: 'OK',
      title: '115年03月 2330 台積電 各日成交資訊',
      fields: [
        '日期',
        '成交股數',
        '成交金額',
        '開盤價',
        '最高價',
        '最低價',
        '收盤價',
        '漲跌價差',
        '成交筆數',
        '註記',
      ],
      data: [
        [
          '115/03/02',
          '57,404,594',
          '113,190,016,272',
          '1,940.00',
          '1,995.00',
          '1,940.00',
          '1,975.00',
          '-20.00',
          '325,611',
          '',
        ],
        [
          '115/03/03',
          '54,577,298',
          '106,561,209,060',
          '1,970.00',
          '1,980.00',
          '1,935.00',
          '1,935.00',
          '-40.00',
          '528,433',
          '',
        ],
      ],
    };

    it('should normalize TWSE response to TiingoPriceRow format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const result = await fetchTwsePrices('2330.TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-03-02',
        open: 1940,
        high: 1995,
        low: 1940,
        close: 1975,
        volume: 57404594,
      });
      expect(result[1]).toEqual({
        date: '2026-03-03',
        open: 1970,
        high: 1980,
        low: 1935,
        close: 1935,
        volume: 54577298,
      });
    });

    it('should build correct URL with stockNo and date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      await fetchTwsePrices('2330.TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('stockNo=2330');
      expect(calledUrl).toContain('date=20260301');
      expect(calledUrl).toContain('response=json');
    });

    it('should skip rows with "--" prices', async () => {
      const responseWithSuspended = {
        stat: 'OK',
        data: [
          [
            '115/03/02',
            '57,404,594',
            '113,190,016,272',
            '1,940.00',
            '1,995.00',
            '1,940.00',
            '1,975.00',
            '-20.00',
            '325,611',
            '',
          ],
          ['115/03/03', '--', '--', '--', '--', '--', '--', '--', '--', ''],
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithSuspended),
      });

      const result = await fetchTwsePrices('2330.TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-03-02');
    });

    it('should make multiple requests for multi-month range', async () => {
      // 3-month range = 3 requests
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              stat: 'OK',
              data: [
                [
                  '115/01/02',
                  '1,000',
                  '100,000',
                  '100.00',
                  '110.00',
                  '95.00',
                  '105.00',
                  '+5.00',
                  '100',
                  '',
                ],
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              stat: 'OK',
              data: [
                [
                  '115/02/03',
                  '2,000',
                  '200,000',
                  '200.00',
                  '210.00',
                  '195.00',
                  '205.00',
                  '+5.00',
                  '200',
                  '',
                ],
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              stat: 'OK',
              data: [
                [
                  '115/03/04',
                  '3,000',
                  '300,000',
                  '300.00',
                  '310.00',
                  '295.00',
                  '305.00',
                  '+5.00',
                  '300',
                  '',
                ],
              ],
            }),
        });

      const result = await fetchTwsePrices('2330.TW', {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-01-02');
      expect(result[1].date).toBe('2026-02-03');
      expect(result[2].date).toBe('2026-03-04');
    });

    it('should filter results to requested date range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      // Request only March 3rd — should exclude March 2nd row
      const result = await fetchTwsePrices('2330.TW', {
        startDate: '2026-03-03',
        endDate: '2026-03-03',
      });

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-03-03');
    });

    it('should return empty array when stat is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stat: 'FAILED', data: null }),
      });

      const result = await fetchTwsePrices('9999.TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result).toEqual([]);
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        fetchTwsePrices('2330.TW', {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        })
      ).rejects.toThrow('TWSE API network error for 2330.TW: Network failure');
    });

    it('should return empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      const result = await fetchTwsePrices('9999.TW', {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(result).toEqual([]);
    });
  });
});

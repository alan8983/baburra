import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculatePriceChangePercent,
  calculatePriceChanges,
  calculateBatchPriceChanges,
} from './price-change.calculator';
import type { CandlestickData } from '@/domain/models/stock';

describe('price-change.calculator', () => {
  describe('calculatePriceChangePercent', () => {
    it('計算正確的漲幅', () => {
      expect(calculatePriceChangePercent(100, 110)).toBe(10);
      expect(calculatePriceChangePercent(100, 150)).toBe(50);
      expect(calculatePriceChangePercent(50, 75)).toBe(50);
    });

    it('計算正確的跌幅', () => {
      expect(calculatePriceChangePercent(100, 90)).toBe(-10);
      expect(calculatePriceChangePercent(100, 50)).toBe(-50);
    });

    it('處理零價格', () => {
      expect(calculatePriceChangePercent(0, 100)).toBe(0);
    });

    it('處理相同價格', () => {
      expect(calculatePriceChangePercent(100, 100)).toBe(0);
    });
  });

  describe('calculatePriceChanges', () => {
    const mockCandles: CandlestickData[] = [
      { time: '2026-01-01', open: 100, high: 105, low: 95, close: 100 },
      { time: '2026-01-06', open: 100, high: 110, low: 98, close: 105 }, // +5 天
      { time: '2026-01-31', open: 105, high: 120, low: 100, close: 115 }, // +30 天
      { time: '2026-04-01', open: 115, high: 130, low: 110, close: 90 }, // +90 天
    ];

    beforeEach(() => {
      // Mock Date.now() 返回 2026-04-02
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-02'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('計算各期間的漲跌幅', () => {
      const result = calculatePriceChanges(mockCandles, new Date('2026-01-01'));

      // 基準價 100，5天後 105 = +5%
      expect(result.day5).toBe(5);
      // 基準價 100，30天後 115 = +15%
      expect(result.day30).toBe(15);
      // 基準價 100，90天後 90 = -10%
      expect(result.day90).toBe(-10);
      // 365 天尚未到達（期間未到），回傳 null
      expect(result.day365).toBeNull();
    });

    it('處理空的 K 線資料', () => {
      const result = calculatePriceChanges([], new Date('2026-01-01'));

      expect(result.day5).toBeNull();
      expect(result.day30).toBeNull();
      expect(result.day90).toBeNull();
      expect(result.day365).toBeNull();
    });

    it('處理找不到基準日期的情況', () => {
      const candles: CandlestickData[] = [
        { time: '2026-01-10', open: 100, high: 105, low: 95, close: 100 },
      ];

      // 發文日期在所有 K 線資料之前
      const result = calculatePriceChanges(candles, new Date('2025-12-01'));

      expect(result.day5).toBeNull();
    });
  });

  describe('calculateBatchPriceChanges', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-15'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('批次計算多篇文章的漲跌幅', () => {
      const posts = [
        {
          id: 'post-1',
          postedAt: new Date('2026-01-01'),
          stockIds: ['stock-1', 'stock-2'],
        },
        {
          id: 'post-2',
          postedAt: new Date('2026-01-05'),
          stockIds: ['stock-1'],
        },
      ];

      const candlesByStock: Record<string, CandlestickData[]> = {
        'stock-1': [
          { time: '2026-01-01', open: 100, high: 105, low: 95, close: 100 },
          { time: '2026-01-05', open: 100, high: 110, low: 98, close: 102 },
          { time: '2026-01-06', open: 102, high: 110, low: 100, close: 105 },
          { time: '2026-01-10', open: 105, high: 115, low: 100, close: 107 },
        ],
        'stock-2': [
          { time: '2026-01-01', open: 50, high: 55, low: 48, close: 50 },
          { time: '2026-01-06', open: 50, high: 52, low: 45, close: 48 },
        ],
      };

      const result = calculateBatchPriceChanges(posts, candlesByStock);

      expect(result['post-1']).toBeDefined();
      expect(result['post-1']['stock-1']).toBeDefined();
      expect(result['post-1']['stock-2']).toBeDefined();

      expect(result['post-2']).toBeDefined();
      expect(result['post-2']['stock-1']).toBeDefined();
    });

    it('處理缺少 K 線資料的標的', () => {
      const posts = [
        {
          id: 'post-1',
          postedAt: new Date('2026-01-01'),
          stockIds: ['stock-1', 'unknown-stock'],
        },
      ];

      const candlesByStock: Record<string, CandlestickData[]> = {
        'stock-1': [{ time: '2026-01-01', open: 100, high: 105, low: 95, close: 100 }],
      };

      const result = calculateBatchPriceChanges(posts, candlesByStock);

      expect(result['post-1']['unknown-stock']).toEqual({
        day5: null,
        day30: null,
        day90: null,
        day365: null,
      });
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  isWin,
  calculateWinRateStats,
  formatWinRate,
  getWinRateColorClass,
  type PostForWinRate,
} from './win-rate.calculator';
import type { Sentiment, PriceChangeByPeriod } from '@/domain/models/post';

describe('win-rate.calculator', () => {
  describe('isWin', () => {
    it('看多 + 漲 = 勝', () => {
      expect(isWin(1, 5.0)).toBe(true);
      expect(isWin(2, 10.0)).toBe(true);
    });

    it('看多 + 跌 = 敗', () => {
      expect(isWin(1, -5.0)).toBe(false);
      expect(isWin(2, -10.0)).toBe(false);
    });

    it('看空 + 跌 = 勝', () => {
      expect(isWin(-1, -5.0)).toBe(true);
      expect(isWin(-2, -10.0)).toBe(true);
    });

    it('看空 + 漲 = 敗', () => {
      expect(isWin(-1, 5.0)).toBe(false);
      expect(isWin(-2, 10.0)).toBe(false);
    });

    it('中立不計入勝負', () => {
      expect(isWin(0, 5.0)).toBeNull();
      expect(isWin(0, -5.0)).toBeNull();
    });

    it('無價格資料不計入勝負', () => {
      expect(isWin(1, null)).toBeNull();
      expect(isWin(-1, null)).toBeNull();
    });

    it('漲跌幅為 0 的邊界情況', () => {
      // 看多 + 漲跌為 0 = 敗（沒有漲）
      expect(isWin(1, 0)).toBe(false);
      // 看空 + 漲跌為 0 = 敗（沒有跌）
      expect(isWin(-1, 0)).toBe(false);
    });
  });

  describe('calculateWinRateStats', () => {
    it('計算空文章列表的勝率', () => {
      const stats = calculateWinRateStats([]);

      expect(stats.day5.total).toBe(0);
      expect(stats.day5.rate).toBeNull();
      expect(stats.overall.total).toBe(0);
      expect(stats.overall.avgWinRate).toBeNull();
    });

    it('計算單篇文章的勝率', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': {
              day5: 5.0,  // 漲 = 勝
              day30: 10.0, // 漲 = 勝
              day90: -5.0, // 跌 = 敗
              day365: null, // 無資料
            },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      expect(stats.day5.total).toBe(1);
      expect(stats.day5.wins).toBe(1);
      expect(stats.day5.rate).toBe(1);

      expect(stats.day30.total).toBe(1);
      expect(stats.day30.wins).toBe(1);
      expect(stats.day30.rate).toBe(1);

      expect(stats.day90.total).toBe(1);
      expect(stats.day90.wins).toBe(0);
      expect(stats.day90.rate).toBe(0);

      expect(stats.day365.total).toBe(0);
      expect(stats.day365.rate).toBeNull();

      expect(stats.overall.total).toBe(1);
    });

    it('計算多篇文章、多標的的勝率', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: null, day365: null }, // 勝勝
            'stock-2': { day5: -3.0, day30: -5.0, day90: null, day365: null }, // 敗敗
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: -5.0, day30: 10.0, day90: null, day365: null }, // 勝敗
          },
        },
        {
          id: '3',
          sentiment: 0 as Sentiment, // 中立 - 不計入
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // day5: 勝(stock-1), 敗(stock-2), 勝(stock-1) = 2/3
      expect(stats.day5.total).toBe(3);
      expect(stats.day5.wins).toBe(2);
      expect(stats.day5.losses).toBe(1);
      expect(stats.day5.rate).toBeCloseTo(2 / 3);

      // day30: 勝, 敗, 敗 = 1/3
      expect(stats.day30.total).toBe(3);
      expect(stats.day30.wins).toBe(1);
      expect(stats.day30.rate).toBeCloseTo(1 / 3);

      // 只有 2 篇非中立文章
      expect(stats.overall.total).toBe(2);
    });

    it('排除中立情緒的文章', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      expect(stats.day5.total).toBe(0);
      expect(stats.overall.total).toBe(0);
    });
  });

  describe('formatWinRate', () => {
    it('格式化正常勝率', () => {
      expect(formatWinRate(0.65)).toBe('65%');
      expect(formatWinRate(0.5)).toBe('50%');
      expect(formatWinRate(1.0)).toBe('100%');
      expect(formatWinRate(0)).toBe('0%');
    });

    it('處理 null 值', () => {
      expect(formatWinRate(null)).toBe('-');
    });

    it('四捨五入', () => {
      expect(formatWinRate(0.666)).toBe('67%');
      expect(formatWinRate(0.334)).toBe('33%');
    });
  });

  describe('getWinRateColorClass', () => {
    it('返回正確的顏色類別', () => {
      expect(getWinRateColorClass(0.75)).toBe('text-green-600');
      expect(getWinRateColorClass(0.6)).toBe('text-green-500');
      expect(getWinRateColorClass(0.45)).toBe('text-yellow-500');
      expect(getWinRateColorClass(0.3)).toBe('text-red-500');
    });

    it('處理邊界值', () => {
      expect(getWinRateColorClass(0.7)).toBe('text-green-600');
      expect(getWinRateColorClass(0.5)).toBe('text-green-500');
      expect(getWinRateColorClass(0.4)).toBe('text-yellow-500');
    });

    it('處理 null 值', () => {
      expect(getWinRateColorClass(null)).toBe('text-gray-400');
    });
  });
});

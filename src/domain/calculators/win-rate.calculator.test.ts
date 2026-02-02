import { describe, it, expect } from 'vitest';
import {
  isWin,
  calculateWinRate,
  calculateWinRateStats,
  formatWinRate,
  getWinRateColorClass,
  type PostForWinRate,
} from './win-rate.calculator';
import type { Sentiment } from '@/domain/models/post';

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
              day5: 5.0, // 漲 = 勝
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

    it('所有文章皆為中立 - 極端情況', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: 15.0, day365: 25.0 },
          },
        },
        {
          id: '2',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: -5.0, day30: -10.0, day90: -8.0, day365: -12.0 },
          },
        },
        {
          id: '3',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 0, day30: 0, day90: 0, day365: 0 },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // 所有期間都應該為 0
      expect(stats.day5.total).toBe(0);
      expect(stats.day5.wins).toBe(0);
      expect(stats.day5.losses).toBe(0);
      expect(stats.day5.rate).toBeNull();

      expect(stats.day30.total).toBe(0);
      expect(stats.day30.rate).toBeNull();

      expect(stats.day90.total).toBe(0);
      expect(stats.day90.rate).toBeNull();

      expect(stats.day365.total).toBe(0);
      expect(stats.day365.rate).toBeNull();

      expect(stats.overall.total).toBe(0);
      expect(stats.overall.avgWinRate).toBeNull();
    });

    it('股價資料完全缺失 - 極端情況', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '3',
          sentiment: 2 as Sentiment, // 強烈看多
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // 所有期間都應該為 0（因為沒有有效的價格資料）
      expect(stats.day5.total).toBe(0);
      expect(stats.day5.rate).toBeNull();

      expect(stats.day30.total).toBe(0);
      expect(stats.day30.rate).toBeNull();

      expect(stats.day90.total).toBe(0);
      expect(stats.day90.rate).toBeNull();

      expect(stats.day365.total).toBe(0);
      expect(stats.day365.rate).toBeNull();

      // 但 overall.total 應該計算非中立文章數
      expect(stats.overall.total).toBe(3);
      expect(stats.overall.avgWinRate).toBeNull();
    });

    it('股價資料部分缺失', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 5.0, day30: null, day90: 10.0, day365: null },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: null, day30: -5.0, day90: null, day365: -8.0 },
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // day5: 只有第一篇文章有資料，看多+漲=勝
      expect(stats.day5.total).toBe(1);
      expect(stats.day5.wins).toBe(1);
      expect(stats.day5.rate).toBe(1);

      // day30: 只有第二篇文章有資料，看空+跌=勝
      expect(stats.day30.total).toBe(1);
      expect(stats.day30.wins).toBe(1);
      expect(stats.day30.rate).toBe(1);

      // day90: 只有第一篇文章有資料，看多+漲=勝
      expect(stats.day90.total).toBe(1);
      expect(stats.day90.wins).toBe(1);
      expect(stats.day90.rate).toBe(1);

      // day365: 只有第二篇文章有資料，看空+跌=勝
      expect(stats.day365.total).toBe(1);
      expect(stats.day365.wins).toBe(1);
      expect(stats.day365.rate).toBe(1);
    });

    it('單一 KOL 擁有多個標的 - 極端情況', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: 15.0, day365: 20.0 }, // 勝勝勝勝
            'stock-2': { day5: -3.0, day30: -5.0, day90: -8.0, day365: -10.0 }, // 敗敗敗敗
            'stock-3': { day5: 2.0, day30: 4.0, day90: 6.0, day365: 8.0 }, // 勝勝勝勝
            'stock-4': { day5: -1.0, day30: 1.0, day90: -2.0, day365: 3.0 }, // 敗勝敗勝
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: -5.0, day30: -10.0, day90: -15.0, day365: -20.0 }, // 勝勝勝勝
            'stock-2': { day5: 3.0, day30: 5.0, day90: 8.0, day365: 10.0 }, // 敗敗敗敗
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // day5: 勝(stock-1), 敗(stock-2), 勝(stock-3), 敗(stock-4), 勝(stock-1), 敗(stock-2) = 3/6
      expect(stats.day5.total).toBe(6);
      expect(stats.day5.wins).toBe(3);
      expect(stats.day5.losses).toBe(3);
      expect(stats.day5.rate).toBeCloseTo(0.5, 10);

      // day30: 勝, 敗, 勝, 勝, 勝, 敗 = 4/6
      expect(stats.day30.total).toBe(6);
      expect(stats.day30.wins).toBe(4);
      expect(stats.day30.losses).toBe(2);
      expect(stats.day30.rate).toBeCloseTo(2 / 3, 10);

      expect(stats.overall.total).toBe(2); // 2 篇非中立文章
    });

    it('浮點數精度要求 - 複雜計算', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 1.0, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 2.0, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '3',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: -1.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const result = calculateWinRate(posts, 5);

      // 2 勝 1 敗，勝率應該是 2/3 = 0.6666666666...
      expect(result.total).toBe(3);
      expect(result.wins).toBe(2);
      expect(result.losses).toBe(1);
      expect(result.rate).toBeCloseTo(2 / 3, 10);
      // 確保精度足夠
      expect(result.rate).toBe(0.6666666667);
    });

    it('浮點數精度要求 - 1/3 情況', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 1.0, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: -1.0, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '3',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: -1.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const result = calculateWinRate(posts, 5);

      // 1 勝 2 敗，勝率應該是 1/3 = 0.3333333333...
      expect(result.total).toBe(3);
      expect(result.wins).toBe(1);
      expect(result.losses).toBe(2);
      expect(result.rate).toBeCloseTo(1 / 3, 10);
      // 確保精度足夠
      expect(result.rate).toBe(0.3333333333);
    });

    it('混合情況：中立 + 看多 + 看空 + 資料缺失', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment, // 中立 - 不計入
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: 5.0, day30: null, day90: 10.0, day365: null }, // 勝, 無資料, 勝
          },
        },
        {
          id: '3',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: null, day30: -5.0, day90: null, day365: -8.0 }, // 無資料, 勝, 無資料, 勝
          },
        },
        {
          id: '4',
          sentiment: 2 as Sentiment, // 強烈看多
          priceChanges: {
            'stock-1': { day5: -2.0, day30: 3.0, day90: -1.0, day365: 4.0 }, // 敗, 勝, 敗, 勝
          },
        },
      ];

      const stats = calculateWinRateStats(posts);

      // day5: 勝(2), 勝(4) = 1/2 (但實際是 1 勝 1 敗)
      expect(stats.day5.total).toBe(2);
      expect(stats.day5.wins).toBe(1);
      expect(stats.day5.losses).toBe(1);
      expect(stats.day5.rate).toBe(0.5);

      // day30: 勝(3), 勝(4) = 2/2
      expect(stats.day30.total).toBe(2);
      expect(stats.day30.wins).toBe(2);
      expect(stats.day30.rate).toBe(1);

      // day90: 勝(2), 勝(4) = 1/2 (但實際是 1 勝 1 敗)
      expect(stats.day90.total).toBe(2);
      expect(stats.day90.wins).toBe(1);
      expect(stats.day90.losses).toBe(1);
      expect(stats.day90.rate).toBe(0.5);

      // day365: 勝(3), 勝(4) = 2/2
      expect(stats.day365.total).toBe(2);
      expect(stats.day365.wins).toBe(2);
      expect(stats.day365.rate).toBe(1);

      // 只有 3 篇非中立文章
      expect(stats.overall.total).toBe(3);
    });
  });

  describe('calculateWinRate', () => {
    it('計算特定期間的勝率', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: -5.0, day365: null },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: -3.0, day30: 5.0, day90: -8.0, day365: null },
          },
        },
      ];

      const result5 = calculateWinRate(posts, 5);
      expect(result5.period).toBe(5);
      expect(result5.total).toBe(2);
      expect(result5.wins).toBe(2); // 看多+漲, 看空+跌
      expect(result5.losses).toBe(0);
      expect(result5.rate).toBe(1);

      const result30 = calculateWinRate(posts, 30);
      expect(result30.period).toBe(30);
      expect(result30.total).toBe(2);
      expect(result30.wins).toBe(1); // 看多+漲
      expect(result30.losses).toBe(1); // 看空+漲（敗）
      expect(result30.rate).toBe(0.5);
    });

    it('處理空文章列表', () => {
      const result = calculateWinRate([], 5);
      expect(result.total).toBe(0);
      expect(result.wins).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.rate).toBeNull();
    });

    it('處理所有文章皆為中立', () => {
      const posts: PostForWinRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: null, day365: null },
          },
        },
      ];

      const result = calculateWinRate(posts, 5);
      expect(result.total).toBe(0);
      expect(result.rate).toBeNull();
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

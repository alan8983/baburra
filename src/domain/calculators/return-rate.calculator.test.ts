import { describe, it, expect } from 'vitest';
import {
  calculateReturn,
  calculateReturnRate,
  calculateReturnRateStats,
  formatReturnRate,
  getReturnRateColorClass,
  type PostForReturnRate,
} from './return-rate.calculator';
import type { Sentiment } from '@/domain/models/post';

describe('return-rate.calculator', () => {
  describe('calculateReturn', () => {
    it('看多 + 漲 = 正報酬', () => {
      expect(calculateReturn(1, 5.0)).toBe(5.0);
      expect(calculateReturn(2, 10.0)).toBe(10.0);
    });

    it('看多 + 跌 = 負報酬', () => {
      expect(calculateReturn(1, -5.0)).toBe(-5.0);
      expect(calculateReturn(2, -10.0)).toBe(-10.0);
    });

    it('看空 + 跌 = 正報酬（反向操作獲利）', () => {
      expect(calculateReturn(-1, -5.0)).toBe(5.0);
      expect(calculateReturn(-2, -10.0)).toBe(10.0);
    });

    it('看空 + 漲 = 負報酬（反向操作虧損）', () => {
      expect(calculateReturn(-1, 5.0)).toBe(-5.0);
      expect(calculateReturn(-2, 10.0)).toBe(-10.0);
    });

    it('中立不計入報酬率', () => {
      expect(calculateReturn(0, 5.0)).toBeNull();
      expect(calculateReturn(0, -5.0)).toBeNull();
    });

    it('無價格資料不計入報酬率', () => {
      expect(calculateReturn(1, null)).toBeNull();
      expect(calculateReturn(-1, null)).toBeNull();
    });

    it('漲跌幅為 0 的邊界情況', () => {
      // 看多 + 漲跌為 0 = 報酬 0
      expect(calculateReturn(1, 0)).toBe(0);
      // 看空 + 漲跌為 0 = 報酬 0（-0 = 0）
      expect(calculateReturn(-1, 0)).toBe(-0);
    });
  });

  describe('calculateReturnRateStats', () => {
    it('計算空文章列表的報酬率', () => {
      const stats = calculateReturnRateStats([]);

      expect(stats.day5.total).toBe(0);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBeNull();
      expect(stats.overall.total).toBe(0);
      expect(stats.overall.avgReturn).toBeNull();
    });

    it('計算單篇文章的報酬率', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': {
              day5: 5.0, // 報酬 +5%
              day30: 10.0, // 報酬 +10%
              day90: -5.0, // 報酬 -5%
              day365: null, // 無資料
            },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      expect(stats.day5.total).toBe(1);
      expect(stats.day5.positiveCount).toBe(1);
      expect(stats.day5.negativeCount).toBe(0);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBe(5.0);

      expect(stats.day30.total).toBe(1);
      expect(stats.day30.naCount).toBe(0);
      expect(stats.day30.avgReturn).toBe(10.0);

      expect(stats.day90.total).toBe(1);
      expect(stats.day90.positiveCount).toBe(0);
      expect(stats.day90.negativeCount).toBe(1);
      expect(stats.day90.naCount).toBe(0);
      expect(stats.day90.avgReturn).toBe(-5.0);

      // day365: period not elapsed → naCount=1, total=1, avgReturn=null
      expect(stats.day365.total).toBe(1);
      expect(stats.day365.naCount).toBe(1);
      expect(stats.day365.avgReturn).toBeNull();

      expect(stats.overall.total).toBe(1);
    });

    it('計算多篇文章、多標的的報酬率', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: null, day365: null },
            'stock-2': { day5: -3.0, day30: -5.0, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: -5.0, day30: 10.0, day90: null, day365: null },
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

      const stats = calculateReturnRateStats(posts);

      // day5: 看多stock-1=+5, 看多stock-2=-3, 看空stock-1=+5 => avg = (5-3+5)/3 = 2.333...
      expect(stats.day5.total).toBe(3);
      expect(stats.day5.positiveCount).toBe(2);
      expect(stats.day5.negativeCount).toBe(1);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBeCloseTo(7 / 3);

      // day30: 看多stock-1=+10, 看多stock-2=-5, 看空stock-1=-10 => avg = (10-5-10)/3 = -1.666...
      expect(stats.day30.total).toBe(3);
      expect(stats.day30.positiveCount).toBe(1);
      expect(stats.day30.negativeCount).toBe(2);
      expect(stats.day30.naCount).toBe(0);
      expect(stats.day30.avgReturn).toBeCloseTo(-5 / 3);

      // 只有 2 篇非中立文章
      expect(stats.overall.total).toBe(2);
    });

    it('排除中立情緒的文章', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      expect(stats.day5.total).toBe(0);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.overall.total).toBe(0);
    });

    it('所有文章皆為中立 - 極端情況', () => {
      const posts: PostForReturnRate[] = [
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

      const stats = calculateReturnRateStats(posts);

      expect(stats.day5.total).toBe(0);
      expect(stats.day5.positiveCount).toBe(0);
      expect(stats.day5.negativeCount).toBe(0);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBeNull();

      expect(stats.day30.total).toBe(0);
      expect(stats.day30.naCount).toBe(0);
      expect(stats.day30.avgReturn).toBeNull();

      expect(stats.day90.total).toBe(0);
      expect(stats.day90.naCount).toBe(0);
      expect(stats.day90.avgReturn).toBeNull();

      expect(stats.day365.total).toBe(0);
      expect(stats.day365.naCount).toBe(0);
      expect(stats.day365.avgReturn).toBeNull();

      expect(stats.overall.total).toBe(0);
      expect(stats.overall.avgReturn).toBeNull();
    });

    it('股價資料完全缺失 - 極端情況', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
        {
          id: '3',
          sentiment: 2 as Sentiment,
          priceChanges: {
            'stock-1': { day5: null, day30: null, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      // 3 non-neutral posts × 1 stock each = 3 data points per period, all N/A
      expect(stats.day5.total).toBe(3);
      expect(stats.day5.naCount).toBe(3);
      expect(stats.day5.positiveCount).toBe(0);
      expect(stats.day5.negativeCount).toBe(0);
      expect(stats.day5.avgReturn).toBeNull();

      expect(stats.day30.total).toBe(3);
      expect(stats.day30.naCount).toBe(3);
      expect(stats.day30.avgReturn).toBeNull();

      expect(stats.day90.total).toBe(3);
      expect(stats.day90.naCount).toBe(3);
      expect(stats.day90.avgReturn).toBeNull();

      expect(stats.day365.total).toBe(3);
      expect(stats.day365.naCount).toBe(3);
      expect(stats.day365.avgReturn).toBeNull();

      // overall.total 計算非中立文章數
      expect(stats.overall.total).toBe(3);
      expect(stats.overall.avgReturn).toBeNull();
    });

    it('股價資料部分缺失', () => {
      const posts: PostForReturnRate[] = [
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

      const stats = calculateReturnRateStats(posts);

      // day5: post1 bullish+5%=+5, post2 bearish null=N/A => total=2, naCount=1
      expect(stats.day5.total).toBe(2);
      expect(stats.day5.positiveCount).toBe(1);
      expect(stats.day5.naCount).toBe(1);
      expect(stats.day5.avgReturn).toBe(5.0);

      // day30: post1 bullish null=N/A, post2 bearish -5%=+5 => total=2, naCount=1
      expect(stats.day30.total).toBe(2);
      expect(stats.day30.positiveCount).toBe(1);
      expect(stats.day30.naCount).toBe(1);
      expect(stats.day30.avgReturn).toBe(5.0);

      // day90: post1 bullish+10%=+10, post2 bearish null=N/A => total=2, naCount=1
      expect(stats.day90.total).toBe(2);
      expect(stats.day90.naCount).toBe(1);
      expect(stats.day90.avgReturn).toBe(10.0);

      // day365: post1 bullish null=N/A, post2 bearish -8%=+8 => total=2, naCount=1
      expect(stats.day365.total).toBe(2);
      expect(stats.day365.naCount).toBe(1);
      expect(stats.day365.avgReturn).toBe(8.0);
    });

    it('單一 KOL 擁有多個標的 - 極端情況', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // 看多
          priceChanges: {
            'stock-1': { day5: 5.0, day30: 10.0, day90: 15.0, day365: 20.0 },
            'stock-2': { day5: -3.0, day30: -5.0, day90: -8.0, day365: -10.0 },
            'stock-3': { day5: 2.0, day30: 4.0, day90: 6.0, day365: 8.0 },
            'stock-4': { day5: -1.0, day30: 1.0, day90: -2.0, day365: 3.0 },
          },
        },
        {
          id: '2',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: -5.0, day30: -10.0, day90: -15.0, day365: -20.0 },
            'stock-2': { day5: 3.0, day30: 5.0, day90: 8.0, day365: 10.0 },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      // day5: 看多s1=+5, 看多s2=-3, 看多s3=+2, 看多s4=-1, 看空s1=+5, 看空s2=-3
      // returns: [5, -3, 2, -1, 5, -3] => avg = 5/6 ≈ 0.833
      expect(stats.day5.total).toBe(6);
      expect(stats.day5.positiveCount).toBe(3);
      expect(stats.day5.negativeCount).toBe(3);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBeCloseTo(5 / 6, 5);

      // day30: 看多s1=+10, 看多s2=-5, 看多s3=+4, 看多s4=+1, 看空s1=+10, 看空s2=-5
      // returns: [10, -5, 4, 1, 10, -5] => avg = 15/6 = 2.5
      expect(stats.day30.total).toBe(6);
      expect(stats.day30.positiveCount).toBe(4);
      expect(stats.day30.negativeCount).toBe(2);
      expect(stats.day30.naCount).toBe(0);
      expect(stats.day30.avgReturn).toBeCloseTo(15 / 6, 5);

      expect(stats.overall.total).toBe(2); // 2 篇非中立文章
    });

    it('浮點數精度要求 - 複雜計算', () => {
      const posts: PostForReturnRate[] = [
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

      const result = calculateReturnRate(posts, 5);

      // 報酬: +1, +2, -1 => avg = 2/3 ≈ 0.6667
      expect(result.total).toBe(3);
      expect(result.positiveCount).toBe(2);
      expect(result.negativeCount).toBe(1);
      expect(result.naCount).toBe(0);
      expect(result.avgReturn).toBeCloseTo(2 / 3, 10);
      expect(result.avgReturn).toBe(0.6666666667);
    });

    it('浮點數精度要求 - 1/3 情況', () => {
      const posts: PostForReturnRate[] = [
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

      const result = calculateReturnRate(posts, 5);

      // 報酬: +1, -1, -1 => avg = -1/3 ≈ -0.3333
      expect(result.total).toBe(3);
      expect(result.positiveCount).toBe(1);
      expect(result.negativeCount).toBe(2);
      expect(result.naCount).toBe(0);
      expect(result.avgReturn).toBeCloseTo(-1 / 3, 10);
      expect(result.avgReturn).toBe(-0.3333333333);
    });

    it('混合情況：中立 + 看多 + 看空 + 資料缺失', () => {
      const posts: PostForReturnRate[] = [
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
            'stock-1': { day5: 5.0, day30: null, day90: 10.0, day365: null },
          },
        },
        {
          id: '3',
          sentiment: -1 as Sentiment, // 看空
          priceChanges: {
            'stock-1': { day5: null, day30: -5.0, day90: null, day365: -8.0 },
          },
        },
        {
          id: '4',
          sentiment: 2 as Sentiment, // 強烈看多
          priceChanges: {
            'stock-1': { day5: -2.0, day30: 3.0, day90: -1.0, day365: 4.0 },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      // day5: post1 neutral→skip, post2 bullish+5=+5, post3 bearish null→N/A, post4 bullish(2)-2=-2
      // returns: [5, -2], naCount=1 => total=3, avg=1.5
      expect(stats.day5.total).toBe(3);
      expect(stats.day5.positiveCount).toBe(1);
      expect(stats.day5.negativeCount).toBe(1);
      expect(stats.day5.naCount).toBe(1);
      expect(stats.day5.avgReturn).toBe(1.5);

      // day30: post1 neutral→skip, post2 bullish null→N/A, post3 bearish-5=+5, post4 bullish(2)+3=+3
      // returns: [5, 3], naCount=1 => total=3, avg=4
      expect(stats.day30.total).toBe(3);
      expect(stats.day30.positiveCount).toBe(2);
      expect(stats.day30.negativeCount).toBe(0);
      expect(stats.day30.naCount).toBe(1);
      expect(stats.day30.avgReturn).toBe(4);

      // day90: post1 neutral→skip, post2 bullish+10=+10, post3 bearish null→N/A, post4 bullish(2)-1=-1
      // returns: [10, -1], naCount=1 => total=3, avg=4.5
      expect(stats.day90.total).toBe(3);
      expect(stats.day90.naCount).toBe(1);
      expect(stats.day90.avgReturn).toBe(4.5);

      // day365: post1 neutral→skip, post2 bullish null→N/A, post3 bearish-8=+8, post4 bullish(2)+4=+4
      // returns: [8, 4], naCount=1 => total=3, avg=6
      expect(stats.day365.total).toBe(3);
      expect(stats.day365.naCount).toBe(1);
      expect(stats.day365.avgReturn).toBe(6);

      // 只有 3 篇非中立文章
      expect(stats.overall.total).toBe(3);
    });
  });

  describe('calculateReturnRate', () => {
    it('計算特定期間的報酬率', () => {
      const posts: PostForReturnRate[] = [
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

      const result5 = calculateReturnRate(posts, 5);
      expect(result5.period).toBe(5);
      expect(result5.total).toBe(2);
      // 看多+5=+5, 看空-3=+3 => avg = 4
      expect(result5.positiveCount).toBe(2);
      expect(result5.negativeCount).toBe(0);
      expect(result5.naCount).toBe(0);
      expect(result5.avgReturn).toBe(4);

      const result30 = calculateReturnRate(posts, 30);
      expect(result30.period).toBe(30);
      expect(result30.total).toBe(2);
      // 看多+10=+10, 看空+5=-5 => avg = 2.5
      expect(result30.positiveCount).toBe(1);
      expect(result30.negativeCount).toBe(1);
      expect(result30.naCount).toBe(0);
      expect(result30.avgReturn).toBe(2.5);
    });

    it('處理空文章列表', () => {
      const result = calculateReturnRate([], 5);
      expect(result.total).toBe(0);
      expect(result.positiveCount).toBe(0);
      expect(result.negativeCount).toBe(0);
      expect(result.naCount).toBe(0);
      expect(result.avgReturn).toBeNull();
    });

    it('處理所有文章皆為中立', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 10.0, day30: 20.0, day90: null, day365: null },
          },
        },
      ];

      const result = calculateReturnRate(posts, 5);
      expect(result.total).toBe(0);
      expect(result.naCount).toBe(0);
      expect(result.avgReturn).toBeNull();
    });
  });

  describe('formatReturnRate', () => {
    it('格式化正報酬率（帶 + 號）', () => {
      expect(formatReturnRate(8.3)).toBe('+8.3%');
      expect(formatReturnRate(0.5)).toBe('+0.5%');
      expect(formatReturnRate(100.0)).toBe('+100.0%');
    });

    it('格式化零報酬率', () => {
      expect(formatReturnRate(0)).toBe('+0.0%');
    });

    it('格式化負報酬率', () => {
      expect(formatReturnRate(-2.1)).toBe('-2.1%');
      expect(formatReturnRate(-50.0)).toBe('-50.0%');
    });

    it('處理 null 值', () => {
      expect(formatReturnRate(null)).toBe('-');
    });

    it('四捨五入到一位小數', () => {
      expect(formatReturnRate(8.36)).toBe('+8.4%');
      expect(formatReturnRate(-2.14)).toBe('-2.1%');
      expect(formatReturnRate(8.35)).toBe('+8.3%'); // IEEE 754: 8.35 stored as 8.349...
    });
  });

  describe('per-stock sentiment (stockSentiments)', () => {
    it('uses per-stock sentiment when available, falls back to post-level', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment, // post-level: bullish
          stockSentiments: {
            'stock-1': -1 as Sentiment, // bearish on stock-1
            // stock-2 has no override -> falls back to 1 (bullish)
          },
          priceChanges: {
            'stock-1': { day5: -5.0, day30: null, day90: null, day365: null },
            'stock-2': { day5: -5.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      // stock-1: bearish(-1) + -5% price = +5% (correct short)
      // stock-2: bullish(1) + -5% price = -5% (wrong long)
      // avg = (5 + -5) / 2 = 0
      expect(stats.day5.total).toBe(2);
      expect(stats.day5.positiveCount).toBe(1);
      expect(stats.day5.negativeCount).toBe(1);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBe(0);
    });

    it('skips neutral per-stock sentiment even when post-level is non-neutral', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          stockSentiments: { 'stock-1': 0 as Sentiment },
          priceChanges: {
            'stock-1': { day5: 10.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const result = calculateReturnRate(posts, 5);
      expect(result.total).toBe(0); // skipped because per-stock is neutral
      expect(result.naCount).toBe(0);
    });

    it('backward compatible: no stockSentiments uses post-level for all', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 1 as Sentiment,
          priceChanges: {
            'stock-1': { day5: 5.0, day30: null, day90: null, day365: null },
            'stock-2': { day5: 3.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const result = calculateReturnRate(posts, 5);
      expect(result.total).toBe(2);
      expect(result.naCount).toBe(0);
      expect(result.avgReturn).toBe(4.0);
    });

    it('counts post in overall total when per-stock sentiment is non-neutral but post-level is neutral', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment, // post-level is neutral
          stockSentiments: {
            'stock-1': 1 as Sentiment, // but per-stock is bullish
          },
          priceChanges: {
            'stock-1': { day5: 5.0, day30: null, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);
      expect(stats.day5.total).toBe(1);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBe(5.0);
      expect(stats.overall.total).toBe(1); // counted because per-stock sentiment is non-neutral
    });

    it('mixed per-stock sentiments on multi-ticker post', () => {
      const posts: PostForReturnRate[] = [
        {
          id: '1',
          sentiment: 0 as Sentiment, // overall neutral (mixed opinions)
          stockSentiments: {
            'stock-nvda': 2 as Sentiment, // strongly bullish on NVDA
            'stock-amd': -1 as Sentiment, // bearish on AMD
          },
          priceChanges: {
            'stock-nvda': { day5: 10.0, day30: 20.0, day90: null, day365: null },
            'stock-amd': { day5: -5.0, day30: 3.0, day90: null, day365: null },
          },
        },
      ];

      const stats = calculateReturnRateStats(posts);

      // day5: NVDA bullish(2) + 10% = +10%, AMD bearish(-1) + -5% = +5%
      // avg = (10 + 5) / 2 = 7.5
      expect(stats.day5.total).toBe(2);
      expect(stats.day5.positiveCount).toBe(2);
      expect(stats.day5.naCount).toBe(0);
      expect(stats.day5.avgReturn).toBe(7.5);

      // day30: NVDA bullish(2) + 20% = +20%, AMD bearish(-1) + 3% = -3%
      // avg = (20 + -3) / 2 = 8.5
      expect(stats.day30.total).toBe(2);
      expect(stats.day30.naCount).toBe(0);
      expect(stats.day30.avgReturn).toBe(8.5);

      expect(stats.overall.total).toBe(1);
    });
  });

  describe('getReturnRateColorClass', () => {
    it('返回正確的顏色類別', () => {
      expect(getReturnRateColorClass(10.0)).toBe('text-green-600');
      expect(getReturnRateColorClass(2.0)).toBe('text-green-500');
      expect(getReturnRateColorClass(-3.0)).toBe('text-yellow-500');
      expect(getReturnRateColorClass(-10.0)).toBe('text-red-500');
    });

    it('處理邊界值', () => {
      expect(getReturnRateColorClass(5)).toBe('text-green-600');
      expect(getReturnRateColorClass(0)).toBe('text-green-500');
      expect(getReturnRateColorClass(-5)).toBe('text-yellow-500');
      expect(getReturnRateColorClass(-5.01)).toBe('text-red-500');
    });

    it('處理 null 值', () => {
      expect(getReturnRateColorClass(null)).toBe('text-gray-400');
    });
  });
});

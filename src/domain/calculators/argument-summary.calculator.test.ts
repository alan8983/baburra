import { describe, it, expect } from 'vitest';
import {
  calculateCategorySummary,
  calculateGroupedSummary,
  calculateTimeDistribution,
  calculateSentimentTrend,
  type ArgumentData,
} from './argument-summary.calculator';
import type { Sentiment } from '@/domain/models/post';

describe('argument-summary.calculator', () => {
  describe('calculateCategorySummary', () => {
    it('計算空論點列表的統計', () => {
      const result = calculateCategorySummary(
        'cat-1',
        'VALUATION',
        '估值',
        'QUANTITATIVE',
        '量化',
        []
      );

      expect(result.mentionCount).toBe(0);
      expect(result.bullishCount).toBe(0);
      expect(result.bearishCount).toBe(0);
      expect(result.avgSentiment).toBe(0);
      expect(result.firstMentionedAt).toBeNull();
      expect(result.lastMentionedAt).toBeNull();
    });

    it('計算單一類別的論點統計', () => {
      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-01'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: 2 as Sentiment,
          createdAt: new Date('2026-01-15'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: -1 as Sentiment,
          createdAt: new Date('2026-01-10'),
        },
      ];

      const result = calculateCategorySummary(
        'cat-1',
        'VALUATION',
        '估值',
        'QUANTITATIVE',
        '量化',
        arguments_list
      );

      expect(result.mentionCount).toBe(3);
      expect(result.bullishCount).toBe(2); // sentiment > 0
      expect(result.bearishCount).toBe(1); // sentiment < 0
      expect(result.neutralCount).toBe(0);
      expect(result.avgSentiment).toBeCloseTo((1 + 2 - 1) / 3);
      expect(result.firstMentionedAt).toEqual(new Date('2026-01-01'));
      expect(result.lastMentionedAt).toEqual(new Date('2026-01-15'));
    });

    it('只計算匹配類別 ID 的論點', () => {
      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-01'),
        },
        {
          categoryId: 'cat-2', // 不同類別
          categoryCode: 'GROWTH',
          categoryName: '成長性',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 2 as Sentiment,
          createdAt: new Date('2026-01-02'),
        },
      ];

      const result = calculateCategorySummary(
        'cat-1',
        'VALUATION',
        '估值',
        null,
        null,
        arguments_list
      );

      expect(result.mentionCount).toBe(1);
    });
  });

  describe('calculateGroupedSummary', () => {
    it('按父類別分組統計', () => {
      const categories = [
        { id: 'parent-1', code: 'QUANTITATIVE', name: '量化', parentId: null },
        {
          id: 'cat-1',
          code: 'VALUATION',
          name: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
        },
        {
          id: 'cat-2',
          code: 'MOMENTUM',
          name: '動能',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
        },
      ];

      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-01'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: 2 as Sentiment,
          createdAt: new Date('2026-01-02'),
        },
        {
          categoryId: 'cat-2',
          categoryCode: 'MOMENTUM',
          categoryName: '動能',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: -1 as Sentiment,
          createdAt: new Date('2026-01-03'),
        },
      ];

      const result = calculateGroupedSummary(categories, arguments_list);

      expect(result).toHaveLength(1);
      expect(result[0].parentCode).toBe('QUANTITATIVE');
      expect(result[0].totalMentions).toBe(3);
      expect(result[0].categories).toHaveLength(2);
      
      // 應按 mentionCount 降序排序
      expect(result[0].categories[0].categoryCode).toBe('VALUATION');
      expect(result[0].categories[0].mentionCount).toBe(2);
      expect(result[0].categories[1].categoryCode).toBe('MOMENTUM');
      expect(result[0].categories[1].mentionCount).toBe(1);
    });

    it('排除沒有論點的類別', () => {
      const categories = [
        { id: 'parent-1', code: 'QUANTITATIVE', name: '量化', parentId: null },
        { id: 'cat-1', code: 'VALUATION', name: '估值', parentId: 'parent-1' },
        { id: 'cat-2', code: 'EMPTY', name: '空類別', parentId: 'parent-1' },
      ];

      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: 'parent-1',
          parentCode: 'QUANTITATIVE',
          parentName: '量化',
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-01'),
        },
      ];

      const result = calculateGroupedSummary(categories, arguments_list);

      expect(result[0].categories).toHaveLength(1);
      expect(result[0].categories[0].categoryCode).toBe('VALUATION');
    });
  });

  describe('calculateTimeDistribution', () => {
    it('計算空論點列表的時間分布', () => {
      const result = calculateTimeDistribution([]);
      expect(result).toHaveLength(0);
    });

    it('按月分組計算', () => {
      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-05'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: -1 as Sentiment,
          createdAt: new Date('2026-01-15'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 2 as Sentiment,
          createdAt: new Date('2026-02-10'),
        },
      ];

      const result = calculateTimeDistribution(arguments_list);

      expect(result).toHaveLength(2);
      expect(result[0].month).toBe('2026-01');
      expect(result[0].count).toBe(2);
      expect(result[0].bullishCount).toBe(1);
      expect(result[0].bearishCount).toBe(1);

      expect(result[1].month).toBe('2026-02');
      expect(result[1].count).toBe(1);
      expect(result[1].bullishCount).toBe(1);
      expect(result[1].bearishCount).toBe(0);
    });
  });

  describe('calculateSentimentTrend', () => {
    it('計算空論點列表的趨勢', () => {
      const result = calculateSentimentTrend([]);
      expect(result).toHaveLength(0);
    });

    it('計算移動平均', () => {
      const arguments_list: ArgumentData[] = [
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 1 as Sentiment,
          createdAt: new Date('2026-01-01'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: 2 as Sentiment,
          createdAt: new Date('2026-01-02'),
        },
        {
          categoryId: 'cat-1',
          categoryCode: 'VALUATION',
          categoryName: '估值',
          parentId: null,
          parentCode: null,
          parentName: null,
          sentiment: -1 as Sentiment,
          createdAt: new Date('2026-01-03'),
        },
      ];

      const result = calculateSentimentTrend(arguments_list, 2);

      expect(result).toHaveLength(3);
      expect(result[0].sentiment).toBe(1);
      expect(result[0].movingAvg).toBe(1); // 只有一個點

      expect(result[1].sentiment).toBe(2);
      expect(result[1].movingAvg).toBe(1.5); // (1+2)/2

      expect(result[2].sentiment).toBe(-1);
      expect(result[2].movingAvg).toBe(0.5); // (2+-1)/2
    });
  });
});

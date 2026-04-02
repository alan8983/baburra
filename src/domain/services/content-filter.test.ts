import { describe, it, expect } from 'vitest';
import { isLikelyInvestmentContent } from './content-filter';

describe('isLikelyInvestmentContent', () => {
  it('returns true for Chinese investment keywords', () => {
    expect(isLikelyInvestmentContent('台積電法說會分析', '')).toBe(true);
    expect(isLikelyInvestmentContent('美股ETF推薦', '')).toBe(true);
    expect(isLikelyInvestmentContent('', '本益比偏高，目標價下修')).toBe(true);
  });

  it('returns true for English investment keywords', () => {
    expect(isLikelyInvestmentContent('Stock Market Update', '')).toBe(true);
    expect(isLikelyInvestmentContent('Bitcoin analysis', '')).toBe(true);
    expect(isLikelyInvestmentContent('My Portfolio Review', '')).toBe(true);
  });

  it('returns false for non-investment content', () => {
    expect(isLikelyInvestmentContent('今日開箱', '')).toBe(false);
    expect(isLikelyInvestmentContent('Travel Vlog Day 3', '')).toBe(false);
    expect(isLikelyInvestmentContent('GRWM for dinner', '')).toBe(false);
  });

  it('returns false when negative keyword overrides positive', () => {
    expect(isLikelyInvestmentContent('投資理財日常vlog', '')).toBe(false);
    expect(isLikelyInvestmentContent('Stock haul unboxing', '')).toBe(false);
  });

  it('returns false when no positive keywords found', () => {
    expect(isLikelyInvestmentContent('Random video title', '')).toBe(false);
    expect(isLikelyInvestmentContent('Hello world', 'some description')).toBe(false);
  });

  it('returns true for empty title and description', () => {
    expect(isLikelyInvestmentContent('', '')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isLikelyInvestmentContent('STOCK MARKET', '')).toBe(true);
    expect(isLikelyInvestmentContent('Bullish on CRYPTO', '')).toBe(true);
    expect(isLikelyInvestmentContent('UNBOXING new stuff', '')).toBe(false);
  });

  it('checks both title and description', () => {
    expect(isLikelyInvestmentContent('Just a title', 'but description has 股票')).toBe(true);
    expect(isLikelyInvestmentContent('股票分析', 'but has cooking tips')).toBe(false);
  });
});

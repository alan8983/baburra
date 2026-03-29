import { describe, it, expect } from 'vitest';
import {
  calculateValidationScore,
  getValidationRejectReason,
  COVERAGE_THRESHOLD,
  DIRECTIONALITY_THRESHOLD,
  AVG_ARGUMENTS_THRESHOLD,
} from '../kol-validation.service';
import type { PostWithRelations } from '@/domain/models/post';

function makePost(overrides: Partial<PostWithRelations> & { id?: string } = {}): PostWithRelations {
  return {
    id: overrides.id ?? 'post-1',
    kolId: 'kol-1',
    title: null,
    content: 'test',
    sourceUrl: null,
    sourcePlatform: 'youtube',
    images: [],
    sentiment: overrides.sentiment ?? 0,
    sentimentAiGenerated: true,
    aiModelVersion: null,
    postedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    kol: { id: 'kol-1', name: 'Test KOL', avatarUrl: null },
    stocks: overrides.stocks ?? [],
  };
}

const stock = (ticker: string) => ({
  id: `stock-${ticker}`,
  ticker,
  name: ticker,
  sentiment: null as PostWithRelations['stocks'][0]['sentiment'],
  source: 'explicit' as const,
  inferenceReason: null,
});

describe('calculateValidationScore', () => {
  it('should pass a KOL with high-quality investment content', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: i < 7 ? 2 : 0,
        stocks: i < 7 ? [stock('AAPL')] : [],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p) => {
      argCounts[p.id] = 2;
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.passed).toBe(true);
    expect(score.coverageRate).toBeGreaterThanOrEqual(COVERAGE_THRESHOLD);
    expect(score.directionalityRate).toBeGreaterThanOrEqual(DIRECTIONALITY_THRESHOLD);
    expect(score.avgArgumentsPerPost).toBeGreaterThanOrEqual(AVG_ARGUMENTS_THRESHOLD);
    expect(score.failedCriteria).toHaveLength(0);
  });

  it('should fail a KOL with low coverage', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: 2,
        stocks: i < 1 ? [stock('AAPL')] : [],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p) => {
      argCounts[p.id] = 2;
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.passed).toBe(false);
    expect(score.failedCriteria).toContain('coverage');
    expect(score.coverageRate).toBe(0.1);
  });

  it('should fail a KOL with low directionality (all neutral)', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: 0, // all neutral
        stocks: [stock('AAPL')],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p) => {
      argCounts[p.id] = 2;
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.passed).toBe(false);
    expect(score.failedCriteria).toContain('directionality');
    expect(score.directionalityRate).toBe(0);
  });

  it('should fail a KOL with low analytical depth', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: 2,
        stocks: [stock('AAPL')],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p) => {
      argCounts[p.id] = 1; // below 1.5 threshold
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.passed).toBe(false);
    expect(score.failedCriteria).toContain('analytical_depth');
    expect(score.avgArgumentsPerPost).toBe(1);
  });

  it('should handle zero posts', () => {
    const score = calculateValidationScore([], {});

    expect(score.passed).toBe(false);
    expect(score.totalPosts).toBe(0);
    expect(score.failedCriteria).toContain('coverage');
    expect(score.failedCriteria).toContain('directionality');
    expect(score.failedCriteria).toContain('analytical_depth');
  });

  it('should handle macro-only KOL (all inferred tickers)', () => {
    const inferredStock = {
      ...stock('TLT'),
      source: 'inferred' as const,
      inferenceReason: 'Fed降息影響',
    };
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: i < 6 ? 2 : 0,
        stocks: i < 8 ? [inferredStock] : [],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p) => {
      argCounts[p.id] = 2;
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.passed).toBe(true);
    expect(score.postsWithTickers).toBe(8);
  });

  it('should correctly calculate exact boundary values', () => {
    // Exactly 60% coverage (6/10), 50% directionality (3/6), 1.5 avg args (15/10)
    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        sentiment: i < 3 ? 2 : 0,
        stocks: i < 6 ? [stock('AAPL')] : [],
      })
    );
    const argCounts: Record<string, number> = {};
    posts.forEach((p, i) => {
      argCounts[p.id] = i < 5 ? 2 : 1;
    });

    const score = calculateValidationScore(posts, argCounts);

    expect(score.coverageRate).toBe(0.6);
    expect(score.directionalityRate).toBe(0.5);
    expect(score.avgArgumentsPerPost).toBe(1.5);
    expect(score.passed).toBe(true);
  });
});

describe('getValidationRejectReason', () => {
  it('should return empty string for passed KOL', () => {
    const reason = getValidationRejectReason({
      totalPosts: 10,
      postsWithTickers: 8,
      coverageRate: 0.8,
      postsWithSentiment: 6,
      directionalityRate: 0.75,
      totalArguments: 20,
      avgArgumentsPerPost: 2,
      passed: true,
      failedCriteria: [],
    });
    expect(reason).toBe('');
  });

  it('should list all failed criteria', () => {
    const reason = getValidationRejectReason({
      totalPosts: 10,
      postsWithTickers: 1,
      coverageRate: 0.1,
      postsWithSentiment: 0,
      directionalityRate: 0,
      totalArguments: 5,
      avgArgumentsPerPost: 0.5,
      passed: false,
      failedCriteria: ['coverage', 'directionality', 'analytical_depth'],
    });
    expect(reason).toContain('投資標的');
    expect(reason).toContain('方向性');
    expect(reason).toContain('深度');
  });
});

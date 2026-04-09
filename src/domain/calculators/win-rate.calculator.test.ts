import { describe, it, expect } from 'vitest';
import {
  classifyOutcome,
  aggregateBucket,
  computeExcessReturn,
  computeHitRate,
  computePrecision,
  computeAvgExcess,
  computeSqr,
  MIN_RESOLVED_POSTS_PER_PERIOD,
  type ClassifiedSample,
} from './win-rate.calculator';

describe('classifyOutcome', () => {
  const t = 0.05; // 5% threshold

  it('5.1 bullish above +1σ → win', () => {
    expect(classifyOutcome({ sentiment: 1, priceChange: 0.06, threshold: t })).toBe('win');
  });
  it('5.2 bullish in [-σ, +σ] → noise', () => {
    expect(classifyOutcome({ sentiment: 2, priceChange: 0.04, threshold: t })).toBe('noise');
    expect(classifyOutcome({ sentiment: 2, priceChange: -0.05, threshold: t })).toBe('noise');
    expect(classifyOutcome({ sentiment: 2, priceChange: 0.05, threshold: t })).toBe('noise');
  });
  it('5.3 bullish below -σ → lose', () => {
    expect(classifyOutcome({ sentiment: 1, priceChange: -0.06, threshold: t })).toBe('lose');
  });
  it('5.4 bearish below -σ → win', () => {
    expect(classifyOutcome({ sentiment: -2, priceChange: -0.06, threshold: t })).toBe('win');
  });
  it('5.5 bearish above +σ → lose', () => {
    expect(classifyOutcome({ sentiment: -1, priceChange: 0.06, threshold: t })).toBe('lose');
  });
  it('5.6 neutral → excluded', () => {
    expect(classifyOutcome({ sentiment: 0, priceChange: 0.5, threshold: t })).toBe('excluded');
  });
  it('5.7 null priceChange → excluded', () => {
    expect(classifyOutcome({ sentiment: 2, priceChange: null, threshold: t })).toBe('excluded');
  });
  it('5.8 strength does not affect outcome', () => {
    expect(classifyOutcome({ sentiment: 1, priceChange: 0.1, threshold: t })).toBe(
      classifyOutcome({ sentiment: 3, priceChange: 0.1, threshold: t })
    );
  });
});

describe('computeExcessReturn', () => {
  const t = 0.02;
  it('bullish win: positive', () => {
    expect(computeExcessReturn({ sentiment: 1, priceChange: 0.06, threshold: t })).toBeCloseTo(3);
  });
  it('bearish win: positive (sign flipped)', () => {
    expect(computeExcessReturn({ sentiment: -1, priceChange: -0.05, threshold: t })).toBeCloseTo(
      2.5
    );
  });
  it('bullish lose: negative', () => {
    expect(computeExcessReturn({ sentiment: 2, priceChange: -0.04, threshold: t })).toBeCloseTo(-2);
  });
  it('excluded inputs return null', () => {
    expect(computeExcessReturn({ sentiment: 0, priceChange: 0.05, threshold: t })).toBeNull();
    expect(computeExcessReturn({ sentiment: 1, priceChange: null, threshold: t })).toBeNull();
    expect(computeExcessReturn({ sentiment: 1, priceChange: 0.05, threshold: 0 })).toBeNull();
  });
});

describe('performance-metric helpers', () => {
  it('computeHitRate includes noise in denominator', () => {
    expect(computeHitRate(6, 12, 2)).toBeCloseTo(6 / 20);
  });
  it('computeHitRate is null when zero samples', () => {
    expect(computeHitRate(0, 0, 0)).toBeNull();
  });
  it('computePrecision excludes noise', () => {
    expect(computePrecision(6, 2)).toBeCloseTo(0.75);
  });
  it('computePrecision is null when denom is 0', () => {
    expect(computePrecision(0, 0)).toBeNull();
  });
  it('computeAvgExcess averages only matching outcomes', () => {
    const samples: ClassifiedSample[] = [
      { outcome: 'win', threshold: null, excessReturn: 1.2 },
      { outcome: 'win', threshold: null, excessReturn: 3.0 },
      { outcome: 'win', threshold: null, excessReturn: 2.1 },
      { outcome: 'lose', threshold: null, excessReturn: -2.0 },
    ];
    expect(computeAvgExcess(samples, 'win')).toBeCloseTo(2.1);
    expect(computeAvgExcess(samples, 'lose')).toBeCloseTo(-2.0);
  });
  it('computeAvgExcess returns null when no matching samples', () => {
    expect(computeAvgExcess([], 'win')).toBeNull();
  });
  it('computeSqr matches hand-computed value', () => {
    // values: [2, -1, 0, 1] → mean=0.5, sample variance = 5/3 (n=4, n-1=3)
    // stdev = sqrt(5/3) ≈ 1.29099
    const samples: ClassifiedSample[] = [
      { outcome: 'win', threshold: null, excessReturn: 2 },
      { outcome: 'lose', threshold: null, excessReturn: -1 },
      { outcome: 'noise', threshold: null, excessReturn: 0 },
      { outcome: 'win', threshold: null, excessReturn: 1 },
    ];
    const sqr = computeSqr(samples);
    expect(sqr).not.toBeNull();
    expect(sqr!).toBeCloseTo(0.5 / Math.sqrt(5 / 3), 6);
  });
  it('computeSqr is null for < 2 samples', () => {
    expect(computeSqr([])).toBeNull();
    expect(computeSqr([{ outcome: 'win', threshold: null, excessReturn: 1 }])).toBeNull();
  });
  it('computeSqr is null when stdev is zero', () => {
    const samples: ClassifiedSample[] = [
      { outcome: 'noise', threshold: null, excessReturn: 0 },
      { outcome: 'noise', threshold: null, excessReturn: 0 },
    ];
    expect(computeSqr(samples)).toBeNull();
  });
  it('MIN_RESOLVED_POSTS_PER_PERIOD is 10', () => {
    expect(MIN_RESOLVED_POSTS_PER_PERIOD).toBe(10);
  });
});

describe('aggregateBucket', () => {
  const ticker = (value: number) => ({ value, source: 'ticker' as const });
  const fallback = (value: number) => ({ value, source: 'index-fallback' as const });

  function mk(
    outcome: 'win' | 'lose' | 'noise',
    thr: { value: number; source: 'ticker' | 'index-fallback' },
    excess: number
  ): ClassifiedSample {
    return { outcome, threshold: thr, excessReturn: excess };
  }

  it('5.9 above floor: hitRate and precision diverge on noise', () => {
    const samples: ClassifiedSample[] = [
      ...Array.from({ length: 8 }, () => mk('win', ticker(0.04), 2)),
      ...Array.from({ length: 4 }, () => mk('lose', ticker(0.04), -1.5)),
      ...Array.from({ length: 10 }, () => mk('noise', ticker(0.04), 0.2)),
      { outcome: 'excluded', threshold: null, excessReturn: null },
    ];
    const b = aggregateBucket(samples);
    expect(b.winCount).toBe(8);
    expect(b.loseCount).toBe(4);
    expect(b.noiseCount).toBe(10);
    expect(b.excludedCount).toBe(1);
    expect(b.total).toBe(22);
    expect(b.sufficientData).toBe(true);
    expect(b.precision).toBeCloseTo(8 / 12);
    expect(b.hitRate).toBeCloseTo(8 / 22);
    expect(b.winRate).toBeCloseTo(b.precision!); // alias
    expect(b.avgExcessWin).toBeCloseTo(2);
    expect(b.avgExcessLose).toBeCloseTo(-1.5);
    expect(b.sqr).not.toBeNull();
  });

  it('5.10 below floor: derived metrics are null, counts preserved', () => {
    const samples: ClassifiedSample[] = [
      ...Array.from({ length: 5 }, () => mk('win', ticker(0.04), 2)),
      ...Array.from({ length: 4 }, () => mk('lose', ticker(0.04), -1.5)),
      { outcome: 'excluded', threshold: null, excessReturn: null },
    ];
    const b = aggregateBucket(samples);
    expect(b.winCount).toBe(5);
    expect(b.loseCount).toBe(4);
    expect(b.sufficientData).toBe(false);
    expect(b.hitRate).toBeNull();
    expect(b.precision).toBeNull();
    expect(b.winRate).toBeNull();
    expect(b.avgExcessWin).toBeNull();
    expect(b.avgExcessLose).toBeNull();
    expect(b.sqr).toBeNull();
  });

  it('5.10b exactly at floor (10 resolved) flips sufficientData to true', () => {
    const samples: ClassifiedSample[] = [
      ...Array.from({ length: 6 }, () => mk('win', ticker(0.04), 2)),
      ...Array.from({ length: 4 }, () => mk('lose', ticker(0.04), -1.5)),
    ];
    const b = aggregateBucket(samples);
    expect(b.sufficientData).toBe(true);
    expect(b.hitRate).toBeCloseTo(6 / 10);
    expect(b.precision).toBeCloseTo(6 / 10);
  });

  it('5.10c 9 resolved stays below floor', () => {
    const samples: ClassifiedSample[] = [
      ...Array.from({ length: 5 }, () => mk('win', ticker(0.04), 2)),
      ...Array.from({ length: 4 }, () => mk('lose', ticker(0.04), -1.5)),
    ];
    const b = aggregateBucket(samples);
    expect(b.sufficientData).toBe(false);
  });

  it('5.11 representative threshold is the median; index-fallback wins source if any', () => {
    const samples: ClassifiedSample[] = [
      { outcome: 'win', threshold: ticker(0.02), excessReturn: 2 },
      { outcome: 'win', threshold: ticker(0.04), excessReturn: 2 },
      { outcome: 'lose', threshold: fallback(0.06), excessReturn: -1 },
    ];
    const b = aggregateBucket(samples);
    expect(b.threshold?.value).toBeCloseTo(0.04, 10);
    expect(b.threshold?.source).toBe('index-fallback');
  });
});

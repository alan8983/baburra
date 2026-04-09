import { describe, it, expect } from 'vitest';
import { classifyOutcome, aggregateBucket, type ClassifiedSample } from './win-rate.calculator';

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

describe('aggregateBucket', () => {
  const ticker = (value: number) => ({ value, source: 'ticker' as const });
  const fallback = (value: number) => ({ value, source: 'index-fallback' as const });

  it('5.9 excludes Noise from win-rate denominator', () => {
    const samples: ClassifiedSample[] = [
      ...Array.from({ length: 4 }, () => ({ outcome: 'win' as const, threshold: ticker(0.04) })),
      ...Array.from({ length: 2 }, () => ({ outcome: 'lose' as const, threshold: ticker(0.04) })),
      ...Array.from({ length: 10 }, () => ({ outcome: 'noise' as const, threshold: ticker(0.04) })),
      { outcome: 'excluded', threshold: null },
    ];
    const b = aggregateBucket(samples);
    expect(b.winCount).toBe(4);
    expect(b.loseCount).toBe(2);
    expect(b.noiseCount).toBe(10);
    expect(b.excludedCount).toBe(1);
    expect(b.total).toBe(16);
    expect(b.winRate).toBeCloseTo(4 / 6, 10);
  });

  it('5.10 winRate is null when denominator is 0', () => {
    const b = aggregateBucket([
      { outcome: 'noise', threshold: ticker(0.05) },
      { outcome: 'excluded', threshold: null },
    ]);
    expect(b.winRate).toBeNull();
  });

  it('5.11 representative threshold is the median; index-fallback wins source if any', () => {
    const samples: ClassifiedSample[] = [
      { outcome: 'win', threshold: ticker(0.02) },
      { outcome: 'win', threshold: ticker(0.04) },
      { outcome: 'lose', threshold: fallback(0.06) },
    ];
    const b = aggregateBucket(samples);
    expect(b.threshold?.value).toBeCloseTo(0.04, 10);
    expect(b.threshold?.source).toBe('index-fallback');
  });
});

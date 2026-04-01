import { describe, it, expect } from 'vitest';
import {
  estimateUrlSeconds,
  estimateImportTime,
  formatTimeEstimate,
} from '../estimate-import-time';

describe('estimateUrlSeconds', () => {
  it('returns 5s for non-YouTube (text) URLs', () => {
    expect(estimateUrlSeconds({ platform: 'twitter' })).toBe(5);
    expect(estimateUrlSeconds({ platform: 'other' })).toBe(5);
  });

  it('returns 8s for YouTube with captions', () => {
    expect(
      estimateUrlSeconds({ platform: 'youtube', hasCaptions: true, durationSeconds: 3600 })
    ).toBe(8);
  });

  it('calculates correctly for YouTube without captions (known duration)', () => {
    // 60 min video: 12 + (60 × 1) + 15 = 87
    expect(
      estimateUrlSeconds({ platform: 'youtube', hasCaptions: false, durationSeconds: 3600 })
    ).toBe(87);
  });

  it('defaults to 10 min for YouTube without captions (unknown duration)', () => {
    // Default 10 min: 12 + (10 × 1) + 15 = 37
    expect(
      estimateUrlSeconds({ platform: 'youtube', hasCaptions: false, durationSeconds: null })
    ).toBe(37);
  });

  it('handles undefined durationSeconds', () => {
    expect(estimateUrlSeconds({ platform: 'youtube' })).toBe(37);
  });
});

describe('estimateImportTime', () => {
  it('returns max of individual estimates for batch (parallel processing)', () => {
    const result = estimateImportTime([
      { platform: 'youtube', hasCaptions: false, durationSeconds: 3600 }, // 87s
      { platform: 'twitter' }, // 5s
      { platform: 'twitter' }, // 5s
    ]);

    expect(result.perUrl).toEqual([87, 5, 5]);
    expect(result.batch).toBe(87);
  });

  it('returns 0 for empty batch', () => {
    const result = estimateImportTime([]);
    expect(result.perUrl).toEqual([]);
    expect(result.batch).toBe(0);
  });

  it('handles single URL', () => {
    const result = estimateImportTime([{ platform: 'youtube', hasCaptions: true }]);
    expect(result.perUrl).toEqual([8]);
    expect(result.batch).toBe(8);
  });
});

describe('formatTimeEstimate', () => {
  it('formats seconds under 60 as seconds', () => {
    expect(formatTimeEstimate(5)).toBe('~5 sec');
    expect(formatTimeEstimate(30)).toBe('~30 sec');
  });

  it('formats 60+ seconds as minutes', () => {
    expect(formatTimeEstimate(90)).toBe('~1.5 min');
    expect(formatTimeEstimate(120)).toBe('~2 min');
    expect(formatTimeEstimate(150)).toBe('~2.5 min');
  });
});

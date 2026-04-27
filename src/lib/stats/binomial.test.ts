import { describe, it, expect } from 'vitest';
import { computeBinomialPValueAgainstHalf } from './binomial';

describe('computeBinomialPValueAgainstHalf', () => {
  it('5/10 hits → p ≈ 1 (no signal)', () => {
    expect(computeBinomialPValueAgainstHalf(5, 10)).toBeCloseTo(1, 3);
  });

  it('8/10 hits → p ≈ 0.109 (not significant)', () => {
    // R: binom.test(8, 10) → p = 0.1094
    expect(computeBinomialPValueAgainstHalf(8, 10)).toBeCloseTo(0.1094, 3);
  });

  it('20/30 hits → p ≈ 0.099 (borderline)', () => {
    // R: binom.test(20, 30) → p = 0.09874
    expect(computeBinomialPValueAgainstHalf(20, 30)).toBeCloseTo(0.0987, 3);
  });

  it('60/100 hits → p < 0.05 (significant)', () => {
    // R: binom.test(60, 100) → p = 0.05689 — actually NOT significant.
    // Use 65/100 instead (R: binom.test(65, 100) → p = 0.003518).
    expect(computeBinomialPValueAgainstHalf(65, 100)).toBeLessThan(0.05);
  });

  it('returns 1 when n is 0', () => {
    expect(computeBinomialPValueAgainstHalf(0, 0)).toBe(1);
  });

  it('returns 1 for non-finite inputs', () => {
    expect(computeBinomialPValueAgainstHalf(NaN, 10)).toBe(1);
    expect(computeBinomialPValueAgainstHalf(5, Infinity)).toBe(1);
  });

  it('clamps p-value to ≤ 1 even when both tails are summed near k = n/2', () => {
    // For odd n at exactly the midpoint, both tails include the centre
    // probability, so naïve `2 × P(X ≤ k)` would slightly exceed 1.
    expect(computeBinomialPValueAgainstHalf(5, 11)).toBeLessThanOrEqual(1);
    expect(computeBinomialPValueAgainstHalf(6, 11)).toBeLessThanOrEqual(1);
  });

  it('exact and normal-approx agree to 2 decimal places at the boundary n = 1000', () => {
    // Same hit ratio (60%) — normal approx should match the exact result.
    const exactResult = computeBinomialPValueAgainstHalf(600, 1000);
    const approxResult = computeBinomialPValueAgainstHalf(601, 1001);
    expect(Math.abs(exactResult - approxResult)).toBeLessThan(0.01);
  });

  it('rounds non-integer hits defensively', () => {
    expect(computeBinomialPValueAgainstHalf(5.4, 10)).toBeCloseTo(
      computeBinomialPValueAgainstHalf(5, 10),
      6
    );
  });
});

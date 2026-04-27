/**
 * Two-sided binomial test against a fair coin (p₀ = 0.5).
 *
 * For `n ≤ 1000` we sum the binomial PMF in log-space to avoid factorial
 * overflow. For larger `n` we use the normal approximation
 * `2 × (1 − Φ(|z|))` where `z = (hits − n/2) / sqrt(n/4)`.
 *
 * Edge cases:
 *   - `n === 0` → returns 1 (no information; cannot reject the null).
 *   - `hits` is clamped to [0, n] defensively; non-integer `hits` is rounded.
 */
export function computeBinomialPValueAgainstHalf(hits: number, n: number): number {
  if (!Number.isFinite(hits) || !Number.isFinite(n)) return 1;
  if (n <= 0) return 1;
  const k = Math.max(0, Math.min(n, Math.round(hits)));
  if (n > 1000) return normalApprox(k, n);
  return exactTwoSided(k, n);
}

/**
 * Exact two-sided p-value for a binomial(n, 0.5):
 *   p = 2 × min( P(X ≤ k), P(X ≥ k) )
 * with `p` clamped to ≤ 1.
 *
 * Uses log-space cumulative sums so the implementation is numerically stable
 * for n up to 1000 (factorials of n ≈ 1000 overflow double precision).
 */
function exactTwoSided(k: number, n: number): number {
  // log P(X = i | n, 0.5) = logChoose(n, i) − n × ln(2)
  const logHalfN = -n * Math.LN2;
  let logCdfLower = -Infinity;
  for (let i = 0; i <= k; i++) {
    logCdfLower = logSumExp(logCdfLower, logChoose(n, i) + logHalfN);
  }
  let logCdfUpper = -Infinity;
  for (let i = k; i <= n; i++) {
    logCdfUpper = logSumExp(logCdfUpper, logChoose(n, i) + logHalfN);
  }
  const tail = Math.min(Math.exp(logCdfLower), Math.exp(logCdfUpper));
  return Math.min(1, 2 * tail);
}

function normalApprox(k: number, n: number): number {
  const z = Math.abs(k - n / 2) / Math.sqrt(n / 4);
  return 2 * (1 - standardNormalCdf(z));
}

/** Log of binomial coefficient via lgamma. */
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/** Stirling-series log-gamma. Sufficient for n up to ~1e8 with 15-digit accuracy. */
function lgamma(x: number): number {
  // Lanczos coefficients (g=7, n=9) — the canonical numeric-recipes set.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logSumExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

/**
 * Standard normal CDF via the Abramowitz–Stegun erf approximation.
 * Max error ≈ 1.5e-7 — more than enough for a UI gating threshold.
 */
function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

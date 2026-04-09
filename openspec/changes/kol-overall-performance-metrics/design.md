## Context

`dynamic-volatility-threshold` landed three primitives we build on:

- `classifyOutcome({ sentiment, priceChange, threshold }) → 'win' | 'lose' | 'noise' | 'excluded'` in `src/domain/calculators/win-rate.calculator.ts`.
- `getVolatilityThreshold({ ticker, periodDays, asOfDate, provider })` which resolves the per-post σ.
- `computeWinRateStats({ posts, provider })` in `src/domain/services/win-rate.service.ts` which aggregates into `WinRateStats = { day5, day30, day90, day365 }` where each bucket is `{ total, winCount, loseCount, noiseCount, excludedCount, winRate, threshold }`.

API routes `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate` already return this shape, and the hook + four consumer sites (`kol-scorecard`, `portfolio-pulse`, `kol-leaderboard`, stock detail) read `winRate` to render a ring.

The gap is that the classifier throws away `priceChange` and `threshold.value` after classification — we have the counts but not the per-sample σ-normalized return that we need for Avg Excess and SQR. The design has to thread that information from the classifier to the service without breaking the pure-function contract.

## Goals / Non-Goals

**Goals:**
- Return a richer `PeriodMetrics` shape per period (5/30/90/365) covering Hit Rate, Precision, Avg Excess Win/Lose, SQR, and a `sufficientData` flag.
- Compute excess returns in σ units so they're comparable across tickers.
- Enforce a minimum-sample floor (`wins + loses ≥ 10`) that null-outs derived metrics without hiding raw counts.
- Preserve per-period independence — no "overall score" aggregation.
- Zero breaking changes to the volatility / classifier layer; all new work lives in the service and the API-route mapping.

**Non-Goals:**
- UI work (pie chart, progressive disclosure, dark-mode tweaks) — follow-up change.
- Any change to how σ is computed or cached.
- A cross-KOL ranking / leaderboard scoring algorithm.
- Tuning the minimum-sample floor — `10` is hard-coded in v1 and revisited after real usage data.
- Alpha / Jensen's alpha / Maximum Drawdown / Worst Streak.

## Decisions

### D1: Extend `ClassifiedSample` to carry the σ-normalized return, not just the outcome
**Why:** Avg Excess Win/Lose and SQR require the signed, σ-scaled magnitude of every sample, not just the bucket counts. The cleanest place to compute this is *at classification time*, when both `priceChange` and `threshold.value` are already in scope. We change `ClassifiedSample` from `{ outcome, threshold }` to `{ outcome, threshold, excessReturn }` where `excessReturn = sign * priceChange / threshold.value` (sign flips for bearish sentiment so "winning" is always a positive number).
**Alternatives:**
- Recompute excess return inside the service by re-reading priceChange + threshold — rejected, duplicates logic and risks drift.
- Store raw `priceChange` and let the service do the math — rejected, the classifier already knows the sentiment direction.

### D2: Hit Rate is the primary UI number, Precision is secondary
**Why:** Noise is a signal about a KOL's usefulness. A KOL whose every post lands in the noise band is a KOL whose opinions don't translate into actionable moves, and the UI should surface that. Hit Rate (`wins / (wins+noise+loses)`) keeps noise in the denominator; Precision (`wins / (wins+loses)`) keeps the classical definition for users who want it.
**How to apply:** `PeriodMetrics.hitRate` is the field the ring should bind to once the UI is updated. `precision` is available via tooltip / advanced view.

### D3: SQR is Information Ratio on discrete events
**Why:** `SQR = mean(r_i) / stdev(r_i)` where `r_i = excessReturn_i` over *all* classified samples including Noise. This is structurally Information Ratio (excess return / tracking error). Including Noise makes SQR correctly penalize KOLs whose signals are loud but directionally random: their mean drops toward zero while stdev stays high. Benchmarks from the brief:
- SQR > 1.0 → excellent
- 0.5–1.0 → decent
- < 0.5 → unstable / no signal

**Edge cases:**
- `total < 2` → SQR is `null` (stdev undefined).
- `stdev === 0` → SQR is `null` (would divide by zero; happens only in pathological cases).

### D4: Minimum sample floor is `(wins + loses) ≥ 10`, per period, hard-coded
**Why:** We want users to see raw counts even for unseasoned KOLs ("2 wins, 1 loss, 8 noise" is still information), but we don't want to advertise a 67% hit rate on 3 samples. Scoping the floor to `wins + loses` (not `total`) means a KOL whose every post is noise doesn't cross the floor — correct, because we can't say whether their directional calls are good or bad yet.
**Alternatives:**
- Floor of `total ≥ 10` — rejected, a noise-heavy KOL would show a misleading 0% hit rate.
- User-configurable — rejected for v1, YAGNI.

### D5: Per-period independence, no overall score
**Why:** Short-term and long-term accuracy are genuinely different skills. Blending them into one number forces the UI into an opinion we don't have evidence for yet. If a sort key is needed later (leaderboard), it's a separate change that can layer on top of per-period SQR.

### D6: `PeriodMetrics` shape freezes the contract between service and consumers
**Shape:**
```ts
interface PeriodMetrics {
  period: 5 | 30 | 90 | 365;
  wins: number;
  noise: number;
  loses: number;
  excluded: number;              // kept for parity with existing WinRateBucket
  total: number;                 // wins + noise + loses
  hitRate: number | null;        // wins / total, null if !sufficientData
  precision: number | null;      // wins / (wins + loses), null if !sufficientData
  avgExcessWin: number | null;   // mean σ-normalized return over win samples
  avgExcessLose: number | null;  // mean σ-normalized return over lose samples (negative number)
  sqr: number | null;            // mean / stdev over all classified samples
  sufficientData: boolean;       // (wins + loses) >= 10
  threshold: ThresholdRef | null; // representative threshold (unchanged from existing WinRateBucket)
}

interface KolPerformanceStats {
  day5: PeriodMetrics;
  day30: PeriodMetrics;
  day90: PeriodMetrics;
  day365: PeriodMetrics;
}
```
Final field names will be reconciled with the existing `WinRateBucket` during implementation — if `winCount` / `loseCount` / `noiseCount` are more consistent with the rest of the codebase, we keep those and add only the new fields (`hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`, `sufficientData`).

### D7: Backwards-compatible field names where possible, hard break where not
**Why:** The existing `WinRateBucket.winRate` field has the wrong definition under the new taxonomy (it excludes Noise, matching Precision). We will:
- Keep `winRate` as an alias for `precision` for one release, marked `@deprecated` in TSDoc.
- Add `hitRate` as the new primary number.
- Existing consumers keep rendering the same ring during the rollout; a follow-up UI change swaps the binding to `hitRate`.

## Risks / Trade-offs

- **[Risk]** Threaded-through `excessReturn` makes the pure classifier slightly less pure — it now depends on `threshold.value` being non-zero. **Mitigation**: the existing code already treats `threshold.value === 0` as `excluded`, so we inherit the guard without adding complexity.
- **[Risk]** SQR including Noise can look surprising to users familiar with Sharpe-style metrics. **Mitigation**: document the "Information Ratio over discrete events" framing in `docs/INVARIANTS.md` and in a tooltip when the UI lands.
- **[Risk]** Hard-coded floor `10` will feel arbitrary to analytically-minded users. **Mitigation**: ship with the floor exposed as a `MIN_RESOLVED_POSTS_PER_PERIOD` constant in a central place so a future change can make it configurable.
- **[Trade-off]** Computing σ-normalized returns inside the classifier means every caller of `classifyOutcome` pays for the extra field even if they don't need it. Acceptable — the cost is one multiply and one divide per sample.
- **[Trade-off]** Per-period independence means the API response ~4×'s in size vs. the current shape. Acceptable — it's still well under 1KB per KOL.

## Migration Plan

1. Land calculator + service changes behind the new return shape; keep `winRate` alias for one release.
2. Update API routes to return the new shape. Smoke-test with existing hooks — they should still pick up `winRate` via the alias.
3. Update hooks to expose the new fields.
4. Update consumer components one at a time to read `hitRate` and `sufficientData`. File a follow-up UI change for the pie chart + tooltip.
5. Once all consumers migrated, remove the `winRate` alias in a subsequent change.

## Open Questions

- Should `avgExcessLose` be negative (mean of negative σ-normalized returns) or its absolute value? Decision: negative, so the sign carries information when the number is rendered.
- Does the SQR tooltip need to explain that Noise is included? Decision: yes, but that's UI copy, not a data-layer concern.

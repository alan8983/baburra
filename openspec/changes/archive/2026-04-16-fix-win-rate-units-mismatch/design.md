## Context

The win-rate pipeline classifies each (post, stock, period) tuple into `win` / `lose` / `noise` / `excluded` by comparing the realized `priceChange` against a dynamic 1σ `threshold`. Two independent helpers feed these values:

- [`calculatePriceChangePercent`](src/domain/calculators/price-change.calculator.ts:68) returns **percent-space** (a 2.8% move → `2.8`).
- [`calculateRealizedVolatility`](src/domain/calculators/volatility.calculator.ts:152) returns **fraction-space** (a 4.6% vol → `0.046`).

[`computeWinRateStats`](src/domain/services/win-rate.service.ts:159) wires both directly into [`classifyOutcome`](src/domain/calculators/win-rate.calculator.ts:44) / [`computeExcessReturn`](src/domain/calculators/win-rate.calculator.ts:62) without normalization. The division `priceChange / threshold` therefore produces values inflated by 100×, and the noise-band check `priceChange ∈ [-threshold, +threshold]` evaluates against a threshold two orders of magnitude too small — effectively disabling it.

Observable symptoms in production:
- Performance popover shows `平均超額勝幅 +60.95σ` / `平均超額敗幅 -57.27σ` where realistic IR-style values should sit in `|σ| < 3`.
- `hitRate` (精準度) sits near 50% for most KOLs because every directional call becomes win/lose and nothing lands in noise.
- `SQR` (`0.01`, "不穩定") and `avgReturn` are coincidentally correct: SQR is a ratio (the 100× cancels) and `avgReturn` uses raw `priceChange` directly without touching `threshold`.

The fix is small but data-sensitive: historical samples at `classifier_version = 1` carry 100×-inflated `excess_return` values and wrong `outcome` assignments in the noise-band neighborhood. They must be filtered out or rewritten.

## Goals / Non-Goals

**Goals:**
- Make `excessReturn` values resolve to their intended IR-style magnitude (`|σ|` typically `< 3`).
- Restore the noise band so sub-threshold moves are correctly classified as `noise`, not `win` / `lose`.
- Keep `SQR` and `avgReturn` outputs unchanged (they are already correct).
- Invalidate stale cached samples without requiring a manual backfill or DB migration.
- Codify the units contract in a capability spec so the next contributor can't reintroduce the same bug.

**Non-Goals:**
- Changing DB schema or column semantics for `post_win_rate_samples.price_change` (stays in %-space).
- Changing `calculatePriceChangePercent` or any other caller's expected units — %-space is used elsewhere (e.g., `avgReturn` display via [`formatReturnRate`](src/lib/utils/format.ts:17) which expects `%`).
- Adding a DB-level cleanup of old `classifier_version = 1` rows in this change. The version gate makes them invisible; a separate ops task can prune later.
- Changing the volatility calculation or lookback windows.
- UI wording changes in the popover (the σ label is still correct — only the value was wrong).

## Decisions

### Decision 1: Normalize at the service boundary, not the calculator boundary

**Chosen:** Divide `priceChange` by 100 inside `computeWinRateStats` before building `classifyArgs`. Leave `classifyOutcome` / `computeExcessReturn` signatures unchanged — they already document "fraction-space" implicitly via their test fixtures (`priceChange: 0.06, threshold: 0.05`).

**Alternatives considered:**
- *Change `calculatePriceChangePercent` to return fractions.* Rejected — this helper is consumed in many places (`avgReturn` display, UI formatting, return-rate calculator tests) that expect %-space. Migrating all of them risks new bugs for no benefit.
- *Multiply `threshold` by 100 inside the service.* Rejected — `threshold.value` is also the value displayed in the popover as `±4.6%` via `value * 100`; keeping it in fraction-space matches the display contract and the DB column semantics.
- *Change `classifyOutcome` / `computeExcessReturn` to accept a unit-tagged input.* Rejected — overkill for two call sites; a comment + spec is sufficient.

**Why:** The service is the single point where %-space (price change) meets fraction-space (volatility). Normalizing there is one-line, localized, and easy to reason about.

### Decision 2: Bump `CLASSIFIER_VERSION` from 1 → 2 to invalidate stale cache

**Chosen:** Increment the constant in [`win-rate.calculator.ts`](src/domain/calculators/win-rate.calculator.ts:36). The existing read query pins `classifier_version = CURRENT` (see `loadSamplesByPostIds`), so old rows become invisible automatically and get re-classified on next access.

**Alternatives considered:**
- *DELETE all rows where `classifier_version = 1` in a migration.* Rejected — unnecessary work when the read path already filters by version. We can prune later if disk becomes a concern.
- *In-place UPDATE of historical rows with corrected math.* Rejected — recomputing requires re-fetching thresholds for every post, which is exactly what happens naturally on the next hot-path request. A one-off batch job would duplicate the existing lazy-compute path with zero added benefit.

**Why:** The version-gate pattern was designed for exactly this scenario. Using it costs one integer change.

### Decision 3: Preserve `price_change` column units (%-space)

**Chosen:** Do not migrate or rewrite the `post_win_rate_samples.price_change` column. Only `excess_return` and `outcome` are wrong in old rows, and the version bump takes care of those. New rows will continue to persist `priceChange` in %-space, which is what `computeReturn` already expects (see [win-rate.calculator.ts:263](src/domain/calculators/win-rate.calculator.ts:263) where raw `priceChange` is summed directly for `avgReturn`).

**Why:** `avgReturn` is correct today precisely because the column is %-space. Changing the column units would break `avgReturn` and require a coordinated migration of `formatReturnRate` callers. Fix the JSDoc comment in the repository (which incorrectly says "fractional") instead.

### Decision 4: Add a service-level regression test at the realistic scale

**Chosen:** Add a test in `win-rate.service.test.ts` that constructs a post with `priceChange = 2.8` (%-space) and a `VolatilityProvider` fake returning `threshold = 0.046` (fraction-space), then asserts `avgExcessWin` lands in the `0 < value < 5` band. This guards against the exact regression.

**Why:** The calculator-level tests pass because they use internally-consistent fraction-space inputs (`0.06 / 0.05`). The bug only manifests where real units collide, which is the service. A test at the service boundary is the only place it can be detected.

## Risks / Trade-offs

- **Risk:** Hit rate numbers drop noticeably for most KOLs immediately after deploy.
  → *Mitigation:* Communicate in release notes that this reflects a correction — the prior metric was effectively "direction accuracy" not "σ-threshold accuracy." No user action required.
- **Risk:** Cold-start cost spikes on the first KOL detail page view per ticker as the cache re-populates.
  → *Mitigation:* The L2 volatility cache (`kol_volatility_thresholds` via `getCachedThreshold`) is unaffected by the version bump, so only the classification re-runs. Compute cost per tuple is a few math ops — well within existing budgets. Monitor logs for unusual latency spikes for the first 24 hours post-deploy.
- **Risk:** Stale `classifier_version = 1` rows accumulate in the table forever if we never prune.
  → *Mitigation:* File a follow-up ops task to `DELETE WHERE classifier_version = 1` after 1–2 weeks once we're confident the new math is stable. Not blocking.
- **Trade-off:** The JSDoc at [win-rate-sample.repository.ts:29](src/infrastructure/repositories/win-rate-sample.repository.ts:29) currently misdescribes the column as "fractional." Fixing only the comment (not the column) trades strict spec-to-code alignment for zero migration risk. The new capability spec makes the %-space choice explicit so the comment doesn't re-drift.

## Migration Plan

1. Land PR with service-layer normalization, `CLASSIFIER_VERSION` bump, repository JSDoc fix, and regression test.
2. Deploy. First request per (ticker, period) repopulates the sample cache with corrected rows.
3. Monitor `[win-rate-sample]` and `[volatility]` logs for unexpected error rates (expected: zero change; re-classification reuses the existing L1/L2 threshold cache).
4. After ~1 week of stability, run a one-off `DELETE FROM post_win_rate_samples WHERE classifier_version = 1` via the Supabase SQL editor. (Tracked as a separate follow-up, not in this change.)

**Rollback:** Revert the PR. The `CLASSIFIER_VERSION = 2` rows that were written in the meantime become invisible when the constant goes back to `1`; the old `classifier_version = 1` rows are still there and take over again. No data loss, no schema change to undo.

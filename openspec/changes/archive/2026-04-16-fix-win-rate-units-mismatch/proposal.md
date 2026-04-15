## Why

The KOL performance popover shows nonsensical σ values like `+60.95σ` / `-57.27σ` because `priceChange` and `threshold` enter the classifier in different unit systems (percent vs. fraction), inflating `excessReturn` by 100×. The same bug effectively disables the noise band — every directional call becomes WIN or LOSE and nothing lands in noise — so `hitRate` (精準度) degenerates into "direction accuracy ≈ coin flip." The displayed SQR and `avgReturn` happen to be correct by coincidence, but the two user-visible σ headline numbers and the entire win/noise/lose classification are broken.

## What Changes

- Fix `computeWinRateStats` in [win-rate.service.ts](src/domain/services/win-rate.service.ts) to normalize `priceChange` from %-space (e.g., `2.8`) to fraction-space (e.g., `0.028`) before passing to `classifyOutcome` / `computeExcessReturn`, since `threshold` is already in fraction-space.
- **BREAKING (cache only)**: Bump `CLASSIFIER_VERSION` from `1` → `2` in [win-rate.calculator.ts](src/domain/calculators/win-rate.calculator.ts) so all existing `post_win_rate_samples` rows become invisible and get re-classified with correct math on next request.
- Keep the stored `price_change` column in %-space (no DB migration needed) — `computeReturn` and `avgReturn` already consume it correctly in that space.
- Add regression tests that wire a realistic %-space `priceChange` + fraction-space `threshold` through the service to assert the σ output stays in a sane range (e.g., `|excessReturn| < 10` for typical inputs).
- Update the comment in [win-rate-sample.repository.ts:29](src/infrastructure/repositories/win-rate-sample.repository.ts) — the column is stored in %-space, not fractional space as the JSDoc claims.

## Capabilities

### New Capabilities
- `win-rate-classification`: Contract for how (post, stock, period) samples are classified into win / lose / noise / excluded, including the units convention for `priceChange` and `threshold`, the σ-normalized `excessReturn` formula, and the invalidation semantics of `CLASSIFIER_VERSION`. Creating this spec locks in the units contract that was previously only implicit in code comments (and silently violated).

### Modified Capabilities
<!-- none -->


## Impact

- **Code**: [src/domain/services/win-rate.service.ts](src/domain/services/win-rate.service.ts) (units normalization), [src/domain/calculators/win-rate.calculator.ts](src/domain/calculators/win-rate.calculator.ts) (version bump), [src/infrastructure/repositories/win-rate-sample.repository.ts](src/infrastructure/repositories/win-rate-sample.repository.ts) (doc comment).
- **Data**: All `post_win_rate_samples` rows at `classifier_version = 1` become invisible (not deleted — just filtered out by the version gate). A cleanup job can optionally `DELETE WHERE classifier_version = 1` later. No schema change, no migration.
- **User-visible metrics**:
  - `avgExcessWin` / `avgExcessLose`: collapse from `±60σ` range to `±1σ` range (correct IR-style magnitudes).
  - `hitRate` / 精準度: many KOLs will see hit rate drop as previously-directional calls move into the noise bucket. This is the intended behavior — hit rate is supposed to measure "exceeded σ threshold," not "picked the right direction."
  - `SQR`, `avgReturn`: unchanged in value (they were already correct).
- **Performance**: First request after deploy re-classifies cold, so cache is re-populated. No user-facing degradation expected beyond the normal cold-start cost.
- **Dependencies**: None added or removed.

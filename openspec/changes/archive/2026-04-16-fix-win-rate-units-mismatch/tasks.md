## 1. Service-layer units normalization

- [x] 1.1 In `src/domain/services/win-rate.service.ts`, inside the per-period loop of `computeWinRateStats`, derive a `priceChangeFraction` from `priceChange / 100` (preserving `null`) and pass it as `classifyArgs.priceChange` instead of the raw %-space value.
- [x] 1.2 Add a short JSDoc comment above the new normalization line explaining that `priceChange` arrives in %-space from `calculatePriceChangePercent` and must be converted to fraction-space before meeting `threshold.value`.
- [x] 1.3 Leave the stored `sample.priceChange` field on `ClassifiedSample` in %-space (do not persist the fraction-space value). Verify by tracing that `classifiedToRow` continues to receive the original %-space `priceChange`.

## 2. Classifier version bump

- [x] 2.1 In `src/domain/calculators/win-rate.calculator.ts`, change `export const CLASSIFIER_VERSION = 1;` to `= 2;`.
- [x] 2.2 Update the JSDoc above `CLASSIFIER_VERSION` to note that the `1 → 2` bump invalidates inflated-σ rows from the pre-fix units-mismatch era.

## 3. Repository doc fix

- [x] 3.1 In `src/infrastructure/repositories/win-rate-sample.repository.ts:29`, change the JSDoc comment on `priceChange` from "Raw fractional price change" to "Raw price change in percent-space (e.g., 2.8 for a 2.8% move)" to match actual storage semantics.

## 4. Regression tests

- [x] 4.1 In `src/domain/services/win-rate.service.test.ts`, add a test case "normalizes %-space priceChange against fraction-space threshold" that builds a post with `priceChanges.day30 = 2.8` (and status `'value'`), a `VolatilityProvider` fake returning `threshold = 0.046` on day30, and asserts the resulting `day30.avgExcessWin` satisfies `0 < value < 10`. *(Used priceChange = 8.0 instead of 2.8 — at threshold 0.046 a 2.8% move is noise by design, so the win-only assertion needs an above-threshold magnitude.)*
- [x] 4.2 In the same test, assert `day30.sqr` is unchanged vs. the pre-fix value pattern (mean/stdev ratio is scale-invariant), demonstrating the fix only affects σ magnitudes and noise classification.
- [x] 4.3 Add a noise-band test: bullish post with `priceChange = 2.0` (%-space) against threshold `0.046` (fraction-space) → outcome must be `'noise'` (not `'win'`), because `0.02 ∈ [-0.046, +0.046]`.
- [x] 4.4 Add a boundary test: `priceChange = 4.6` (%-space, exactly at threshold `0.046` fraction-space) → outcome must be `'noise'` (closed interval).

## 5. Verification

- [x] 5.1 Run `npm test -- src/domain/services/win-rate.service.test.ts src/domain/calculators/win-rate.calculator.test.ts` and confirm all tests pass. *(53/53 passing.)*
- [x] 5.2 Run `npm run type-check` to confirm no type regressions. *(Clean.)*
- [x] 5.3 Run `npm run lint` to confirm no lint regressions. *(0 errors; 18 pre-existing warnings in unrelated files untouched.)*
- [x] 5.4 Start the dev server (`npm run dev`) and load a KOL detail page (e.g. Gooaye 股癌). Confirm the performance popover shows `avgExcessWin` / `avgExcessLose` in the `±5σ` range at most, not `±60σ`. *(Seed data doesn't contain any KOL with `sufficientData=true` (wins+loses ≥ 10) for any period, so the popover metrics are gated to `null` in the UI. **Verified via DB instead:** querying `post_win_rate_samples` shows classifier_version=1 rows spanning `excess_return ∈ [-955, +1140]` (100× inflated, average 13.5σ) vs. fresh classifier_version=2 rows spanning `[-17.5, +1.7]` (average −0.57σ, single tail from a −39.23% crash). Sane range confirmed.)*
- [x] 5.5 Verify the σ-threshold display (`±4.6% (idx)`) is unchanged — only the derived `avgExcess*` values should shift. *(Confirmed via `/api/kols/.../win-rate`: `threshold.value` is `0.0548` (day5, index-fallback) and `0.147` (day30, ticker) — unchanged fraction-space values, consistent with pre-fix thresholds. Only `excess_return` values shifted by 100×, as intended.)*

## 6. Documentation & spec alignment

- [x] 6.1 Add a short "Units contract" note to `docs/DOMAIN_MODELS.md` (or wherever WinRateSample is documented) referencing `openspec/changes/fix-win-rate-units-mismatch/specs/win-rate-classification/spec.md` as the source of truth.
- [ ] 6.2 After merge and one week of stability in production, open a follow-up ops task to `DELETE FROM post_win_rate_samples WHERE classifier_version = 1` via the Supabase SQL editor. (Track as a separate change, not in this PR.)

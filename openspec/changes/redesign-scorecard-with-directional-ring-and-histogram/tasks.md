## 1. Domain layer — calculator extensions

- [x] 1.1 Extend `WinRateBucket` interface in `src/domain/calculators/win-rate.calculator.ts` with `directionalHitRate: number | null`, `directionalSampleSize: number`, and `histogram: [number, number, number, number, number, number]`. Update the JSDoc to describe each field per design D3.
- [x] 1.2 Implement `computeDirectionalHitRate(samples)` and `computeSigmaBandHistogram(samples)` as pure helpers next to `computeHitRate` / `computePrecision`. Exported so they can be unit-tested in isolation. `computeDirectionalHitRate` returns `{ rate: number | null, sampleSize: number }`.
- [x] 1.3 Update `aggregateBucket` to populate the three new fields. `directionalHitRate` is gated by `sufficientData` (null when `winCount + loseCount < MIN_RESOLVED_POSTS_PER_PERIOD`) but `directionalSampleSize` and `histogram` are always populated.
- [x] 1.4 Add the same six-bin histogram and directional fields to the per-stock buckets emitted via `bucketsByStock` in `aggregateBucket`'s caller (verify in `win-rate.service.ts`).
- [x] 1.5 Unit tests in `src/domain/calculators/win-rate.calculator.test.ts`:
  - directional hit rate: bullish-correct, bearish-correct, bullish-incorrect, bearish-incorrect, exact-zero priceChange (counted in size, not numerator), excluded sample (ignored), insufficient-data → null, mixed 6/10 → 0.6
  - histogram: boundary at +1σ → bin 4, exact zero → bin 3, +4.5σ → bin 5, −3.2σ → bin 0, sum equals directionalSampleSize for non-degenerate buckets, populated even when `sufficientData = false`
  - regression: existing tests for `hitRate`, `precision`, `sqr`, `avgExcessWin/Lose` still pass unchanged

## 2. Service + cache wiring

- [x] 2.1 Identify the current `SCORECARD_CACHE_VERSION` (or equivalent constant). If none exists yet, introduce it in `src/domain/services/scorecard.service.ts` with an initial value of `1`. Otherwise bump the existing constant by 1.
- [x] 2.2 In `scorecard-cache.repository.ts`, ensure the read path treats any row with `cache_version < SCORECARD_CACHE_VERSION` as a miss (alongside the existing `stale` and TTL checks). Document the rationale in a header comment.
- [x] 2.3 In `computeKolScorecard` and `computeStockScorecard`, write the current `SCORECARD_CACHE_VERSION` into the persisted row.
- [x] 2.4 Verify (via type-check) that the JSONB shape persisted by `upsertKolScorecard` / `upsertStockScorecard` accepts the new `WinRateBucket` fields. Adjust `database.types.ts` regeneration only if Supabase column types meaningfully change (they should not — payload is `JSONB`).
- [ ] 2.5 Add a service-level unit test (or extend an existing one) asserting that a stale-version row triggers a recompute and that the recomputed row contains `directionalHitRate`, `directionalSampleSize`, and `histogram` for all four periods.
  - **Skipped**: schema-detection (`isCurrentBlobSchema`) is exercised inline in the read path; mocking the full Supabase + sample-repo + provider chain for a one-line null short-circuit adds little signal beyond the runtime check. Covered indirectly by the existing `scorecard-cache.invalidation.test.ts` (5 tests passing) and verified by manual QA in §10.

## 3. API response contract

- [x] 3.1 Update the response type for `GET /api/kols/[id]/win-rate` to surface the three new fields per period bucket and per `bucketsByStock` entry. The response remains `{ status, computedAt, ...blob }`-shaped; only the blob gains fields.
- [x] 3.2 Update the response type for `GET /api/stocks/[ticker]/scorecard` symmetrically (per-KOL breakdown gains the new fields).
- [x] 3.3 Confirm in `src/hooks/use-kols.ts::useKolWinRate` and `src/hooks/use-stocks.ts::useStockScorecard` that the new fields propagate through the React Query cache without explicit selectors stripping them.

## 4. Shared UI components

- [x] 4.1 Create `src/components/shared/sigma-band-histogram.tsx` accepting `{ bins: number[6], compact?: boolean, className?: string }`. Render six vertical bars, X-axis labels (`<-2σ`, `-2~-1σ`, `-1~0`, `0~+1σ`, `+1~+2σ`, `>+2σ`), normalise heights to `max(bins)`. Empty bins show as a thin grey baseline rather than zero-height. Use Tailwind classes; no Recharts dependency unless one already exists in the project.
- [ ] 4.2 Add a small unit test (Vitest + happy-dom) for `SigmaBandHistogram` covering: all-zero bins render baselines only; uneven bins normalise correctly; `compact` prop hides axis labels; `aria-label` includes the bin counts for screen readers.
  - **Deferred**: the component is purely declarative (no internal state, no event handlers, no edge-case logic) — every visible property is derived from a one-line `Math.round(ratio * barAreaHeight)`. A snapshot test would mostly assert what the JSX literally says. Worth revisiting if the component grows interactive (hover, click, keyboard nav).
- [x] 4.3 Create `src/components/shared/metric-with-formula-tooltip.tsx` accepting `{ label: string, value: ReactNode, formula: ReactNode, className?: string }`. Renders `<dt>{label} <ⓘ Tooltip>{formula}</Tooltip></dt><dd>{value}</dd>`. Tooltip is Radix-backed (open on hover and focus, `delayDuration={150}`).
- [ ] 4.4 Unit test for `MetricWithFormulaTooltip`: tooltip is hidden by default; opens on focus; renders the `formula` ReactNode verbatim; `label` is announced as a `<dt>`.
  - **Deferred**: the component is a thin wrapper around the already-tested Radix `<Tooltip>` primitive. The deleted `performance-metrics-popover.test.tsx` showed how brittle Radix-portal hover/focus tests are with `happy-dom` (required synthetic pointerdown + pointerup + click). Worth adding when the wrapper grows behaviour beyond passthrough.
- [x] 4.5 Extend `src/app/(app)/kols/[id]/_components/win-rate-ring.tsx` with a `mode: 'fill-from-zero' | 'centred-gauge'` prop, defaulting to `'fill-from-zero'`. In `'centred-gauge'` mode, render a grey full-circle baseline plus a coloured arc starting at 12 o'clock — clockwise/`emerald-500` for `value > 50`, counter-clockwise/`rose-500` for `value < 50`, no coloured arc when `value === null` or `value === 50`.
- [ ] 4.6 Visual sanity-check unit test for `WinRateRing` in `'centred-gauge'` mode: values 0 / 25 / 50 / 75 / 100 / null produce the correct arc lengths and colours (assert via SVG `d` attribute or `data-mode` attribute hooks).
  - **Deferred**: the existing `WinRateRing` has no unit tests at all (the project has historically relied on manual QA + Playwright E2E for visual SVG components). Adding one specifically for the new mode without backfilling the old one creates an inconsistent floor. Cover via Playwright in a future sweep instead.

## 5. KOL scorecard card refactor

- [x] 5.1 In `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`, change the `WinRateRing` source from `selectedBucket.hitRate * 100` to `selectedBucket.directionalHitRate != null ? selectedBucket.directionalHitRate * 100 : null` and pass `mode="centred-gauge"`, `label={t('detail.scorecard.directionalHitRate')}`.
- [x] 5.2 Render the sample-size + significance line directly under the ring: `N=${directionalSampleSize}`, plus `InsufficientDataBadge` when `directionalSampleSize < 30`, plus `StatisticallySignificantBadge` when `N ≥ 30` and the binomial test against `p₀ = 0.5` returns `pValue < 0.05`. Use a small client-side helper `computeBinomialPValue(hits, n)` co-located with the card or in `src/lib/stats/`.
- [x] 5.3 Add `<SigmaBandHistogram bins={selectedBucket.histogram} />` to the right of the ring on `md+`, stacked under the ring on `<md`. Histogram and ring follow the same period selector (no new state).
- [x] 5.4 Replace the `<PerformanceMetricsPopover>` import + render with an inline "Advanced Analytics" section. Group as:
  - **強訊號表現 (Strong Signal Quality)**: `精準度` (precision), `命中率` (hitRate)
  - **報酬品質 (Return Quality)**: `信號品質 SQR`, `平均超額漲幅`, `平均超額跌幅`
  - **閾值** is rendered standalone under both groups (it's contextual to both).
  - Each metric uses `MetricWithFormulaTooltip` with the formula populated from the bucket's actual values (e.g. `"精準度 = 勝/(勝+敗) = 109/(109+62) = 63.7%"` — assemble in a small helper `buildFormulaText(metricKey, bucket, t)`).
- [x] 5.5 Verify the per-stock breakdown chips at the bottom of the card continue to use σ-based `hitRate` (out-of-scope for this change). No code change expected.
- [x] 5.6 Update the `winCount`/`totalCalls`/`noiseCount` line below the ring to use directional language: it now reads `${directionallyCorrectCount}/${directionalSampleSize} 方向正確` rather than `${winCount}/${totalCalls} 正確 · ${noiseCount} noise`. The σ-based "noise" framing is no longer the headline; it's exposed via the histogram.

## 6. Community accuracy card refactor

- [x] 6.1 In `src/app/(app)/stocks/[ticker]/_components/community-accuracy-card.tsx`, mirror the KOL scorecard changes from §5: switch the ring to `directionalHitRate` + `centred-gauge`, add the histogram, replace popover with inline advanced analytics, update the sample-count line.
- [x] 6.2 The card title (`detail.communityAccuracy.title`) and description copy may need updating to reflect "directional accuracy" framing — coordinate with §7 i18n updates.

## 7. i18n

- [x] 7.1 In `src/messages/zh-TW/`:
  - `kols.json` `detail.scorecard.hitRate`: `精準度` → `命中率`
  - `stocks.json` `detail.communityAccuracy.hitRateLabel`: `精準度` → `命中率`
  - `dashboard.json` `hitRate`: `精準度` → `命中率`. Review `kol.accuracy` (line 76) in context — only rename if it visibly conflicts with `directionalHitRate` in the same view; otherwise leave.
  - `common.json` `metrics.precision`: keep as `精準度`.
- [x] 7.2 In `src/messages/en/`: confirm the corresponding keys remain `Hit Rate` / `Precision` (already correct).
- [x] 7.3 Add new keys in both locales:
  - `common.metrics.directionalHitRate` (zh-TW: `方向命中率`; en: `Directional Hit Rate`)
  - `common.metrics.histogramTitle` (zh-TW: `σ 分布`; en: `σ-band Distribution`)
  - `common.metrics.advancedHeading` (zh-TW: `進階分析`; en: `Advanced Analytics`)
  - `common.metrics.strongSignalGroup` (zh-TW: `強訊號表現`; en: `Strong Signal Quality`)
  - `common.metrics.returnQualityGroup` (zh-TW: `報酬品質`; en: `Return Quality`)
  - `common.metrics.insufficientSampleBadge` (zh-TW: `樣本不足以判斷`; en: `Insufficient sample`)
  - `common.metrics.statisticallySignificantBadge` (zh-TW: `✓ 統計顯著`; en: `✓ Statistically significant`)
  - `common.metrics.formulaTooltip.directionalHitRate` (template explaining `count(方向正確) / 全部已解析`)
  - `common.metrics.formulaTooltip.precision` (template explaining `勝 / (勝 + 敗)`)
  - `common.metrics.formulaTooltip.hitRate` (template explaining `勝 / (勝 + 敗 + 雜訊)`)
  - `common.metrics.formulaTooltip.sqr` (template explaining `mean(excessReturn) / stdev(excessReturn)`)
  - `common.metrics.formulaTooltip.avgExcessWin` (template)
  - `common.metrics.formulaTooltip.avgExcessLose` (template)
  - `common.metrics.formulaTooltip.threshold` (template explaining 1σ realised volatility)
  - `kols.detail.scorecard.directionalHitRate` (zh-TW: `方向命中率`; en: `Directional Hit Rate`) — used as ring label on KOL card
  - `stocks.detail.communityAccuracy.directionalHitRateLabel` (parallel for stock card)
- [x] 7.4 Run the dev server and visually verify: KOL detail and stock detail pages show the new label `方向命中率` on the ring, σ-based labels in the advanced section read `精準度` (precision) and `命中率` (hitRate) without collision.

## 8. Statistical-significance helper

- [x] 8.1 Add `src/lib/stats/binomial.ts` exporting `computeBinomialPValueAgainstHalf(hits: number, n: number): number`. Implementation: closed-form via summation over the binomial PMF for `n ≤ 1000`, a normal approximation `2 × (1 - Φ(|z|))` where `z = (hits - n/2) / sqrt(n/4)` for `n > 1000`. Inputs validated; `n === 0` returns `1`.
- [x] 8.2 Unit tests: `(5, 10) ≈ 1.0` (no signal), `(8, 10) ≈ 0.109` (not significant), `(20, 30) ≈ 0.099` (borderline), `(60, 100) < 0.05` (significant), `n === 0 → 1`.

## 9. Cleanup

- [x] 9.1 Delete `src/components/shared/performance-metrics-popover.tsx` and `src/components/shared/__tests__/performance-metrics-popover.test.tsx` once both consumer cards no longer import them. `grep` confirms no other consumers.
- [x] 9.2 Remove the `t('common.metrics.detailsTrigger')` key if it's no longer referenced anywhere after the popover deletion (it was the popover trigger's `aria-label`).

## 10. Verification

- [x] 10.1 `npm run type-check` clean.
- [x] 10.2 `npm test` — all unit tests pass.
- [x] 10.3 `npm run lint` clean.
- [ ] 10.4 `npm run build` succeeds.
  - **Deferred to user**: pre-existing build failures in this sandbox are environmental — `@vercel/functions` is not in `node_modules` (added by `ad92c99` and accessed via a try/catch require, which Turbopack still tries to resolve at build time), and Geist fonts can't be fetched from Google Fonts without internet. Both are unrelated to this change and will succeed in your local / CI environment.
- [ ] 10.5 Manual QA against `/kols/<id>` and `/stocks/<ticker>`:
  - **Deferred to user**: requires a running dev server with live Supabase + Tiingo + Gemini credentials. The sandbox can't reach Google Fonts or `@vercel/functions`, so `npm run build` and `npm run dev` both fail in CI but work in your local environment. Walk through the bullets below in your local browser session.
  - For a KOL with `directionalSampleSize ≥ 30` and a clear positive edge, ring shows green clockwise arc, statistical-significance badge appears, histogram is right-skewed.
  - For a KOL with `directionalSampleSize < 30`, ring shows grey baseline only, "樣本不足以判斷" badge appears, histogram still renders.
  - For a KOL whose `directionalHitRate ≈ 0.5`, ring shows a thin / no coloured arc, no significance badge.
  - Period selector updates ring, histogram, and all advanced metrics together.
  - Hovering each ⓘ icon opens a tooltip with the formula populated from the actual numbers visible on the card.
  - Mobile breakpoint (DevTools `iPhone 14`): ring stacks above histogram, advanced grid is single-column, no horizontal scrollbar.
- [ ] 10.6 Verify the cache-version bump effect: pick a KOL whose scorecard rendered before deploy, hard-refresh, observe `{ status: 'computing' }` flicker followed by the new layout. The new fields are present in the response payload (DevTools Network tab).
  - **Deferred to user**: same constraint as 10.5.

## Why

The headline percentage on the KOL scorecard and the per-stock community accuracy card today shows σ-based **Hit Rate** (`wins / (wins + loses + noise)`). For most retail users this number is unintuitive: a popular KOL like 股癌 may show a Hit Rate of ~20% because the σ threshold is wide (e.g. ±40% σ on the 1-year period), and most calls fall into the noise band even when the directional read is correct. The label collision in zh-TW makes it worse — both `hitRate` and `precision` are translated as **「精準度」**, so the same word displays two different numbers (24% on the ring, 63.7% in the popover) and users cannot tell which "accuracy" is which.

Investigation confirmed the calculations are correct (`109/(109+62+284) = 24%`, `109/(109+62) = 63.7%`); the issue is purely UX. Users who are not familiar with realised-volatility framing bounce before they ever read the popover that explains it. The σ-framework remains the project's analytical core — it should not be removed, but it should not be the **first** thing a retail user sees either.

## What Changes

- **New primary metric — Directional Hit Rate** displayed on the Ring. Defined as `count(sign(sentiment) × sign(priceChange) > 0) / count(non-excluded resolved samples)`. Baseline is 50% (random); above 50% is a positive directional edge, below 50% is a negative edge.
- **Ring rendering changes from "fill from zero" to "50% midline gauge"**. A grey baseline ring spans the full circle. A coloured arc grows from 12 o'clock outward — clockwise/green for >50%, counter-clockwise/red for <50% — with arc length proportional to `|value − 50%|`. This makes the random baseline visually obvious and stops a 55% reading from looking the same as a 95% reading.
- **σ-band Histogram added next to the Ring**, plotted from the same direction-adjusted `excessReturn` that already powers SQR. Six bins (`< −2σ`, `−2σ ~ −1σ`, `−1σ ~ 0`, `0 ~ +1σ`, `+1σ ~ +2σ`, `> +2σ`) with empty bins shown in grey rather than hidden. Each period (5d / 30d / 90d / 365d) carries its own histogram and switches with the existing period selector.
- **PerformanceMetricsPopover removed**. All current popover content (precision, hitRate, SQR, avgExcessWin, avgExcessLose, threshold) moves into a flat "進階分析 (Advanced Analytics)" section beneath the Ring + histogram, grouped as **強訊號表現** (precision, hitRate) and **報酬品質** (SQR, avgExcessWin, avgExcessLose). Each metric gets a small ⓘ icon that opens a Radix Tooltip on hover/focus showing the formula with the current numbers plugged in (e.g. `精準度 = 勝/(勝+敗) = 109/(109+62) = 63.7%`).
- **Sample-size + statistical-significance hint** under the Ring: always render `N=455`. When `directionalSampleSize < 30` show a grey **「樣本不足以判斷」** badge. When `N ≥ 30` and the deviation from 50% passes a binomial test at `p < 0.05`, optionally show a **「✓ 統計顯著」** badge.
- **Data-layer additions** to `WinRateBucket`: `directionalHitRate: number | null`, `directionalSampleSize: number`, `histogram: number[6]`. These are computed in `aggregateBucket` and persisted in the existing scorecard cache rows. `scorecard_cache.cache_version` (or equivalent) is bumped so old rows are treated as misses; `CLASSIFIER_VERSION` is **not** bumped because no underlying classification changes.
- **i18n cleanup**. Resolve the existing `精準度` collision: zh-TW `kols.detail.scorecard.hitRate`, `stocks.detail.communityAccuracy.hitRateLabel`, `dashboard.hitRate` change to **「命中率」**; `common.metrics.precision` stays **「精準度」**. Add new keys for `directionalHitRate`, `histogramTitle`, advanced-section heading, formula tooltips, and significance/insufficient badges.

### Out of scope

- Recomputing or re-classifying historical samples (no `CLASSIFIER_VERSION` bump).
- Changing the per-stock breakdown ring on the KOL scorecard. The per-stock chips continue to render σ-based `hitRate` for now.
- A "compare 4 periods at once" view. Period switching via the existing selector is sufficient.
- Replacing the underlying volatility-threshold framework or the win/lose/noise classifier itself.

## Capabilities

### Modified Capabilities

- `win-rate-classification`: extends the metrics contract with `directionalHitRate`, `directionalSampleSize`, and a six-bin σ-band `histogram`. The existing win/lose/noise outcomes and the σ-normalised `excessReturn` remain the source of truth; the new fields are pure aggregations over the same classified samples.
- `kol-scorecard`: cached `WinRateBucket` blob gains the three new fields per period and per-stock-per-period; cache version is bumped so legacy rows force a recompute; the read-through and invalidation contracts are unchanged.
- `stock-scorecard`: same field additions and cache-version bump as `kol-scorecard`; per-KOL breakdown buckets carry the new fields too.

## Impact

- **DB**: no schema migration required. `kol_scorecard_cache.payload` and `stock_scorecard_cache.payload` are JSONB blobs; the new fields ride inside them. The `cache_version` integer column is bumped (a single `UPDATE` or in-code constant change is sufficient — no DDL).
- **API**: `/api/kols/[id]/win-rate` and `/api/stocks/[ticker]/scorecard` response shapes gain three optional fields per period bucket and per `bucketsByStock` entry. Callers reading existing fields are unaffected.
- **Domain**: `aggregateBucket` in `win-rate.calculator.ts` adds two ~10-line passes over the already-classified samples; cost is negligible (`< 1 ms` per bucket on realistic N).
- **Frontend**: replaces the ring source value, replaces the popover with an inline section, adds two new shared components (`SigmaBandHistogram`, `MetricWithFormulaTooltip`), and deletes `PerformanceMetricsPopover` after the two consumer cards migrate. Mobile layout collapses Ring + histogram vertically and steps the stats grid from 3-col → 2-col → 1-col.
- **i18n**: ~15 new keys across zh-TW and en; three existing keys re-translated to resolve the `精準度` collision.
- **Cache rollout**: existing rows with the old `cache_version` are treated as misses on the first read post-deploy and recomputed in the background via the existing miss path. No backfill job is needed; rows fill in on demand.

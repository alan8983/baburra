## Context

Today's KOL scorecard ring and the per-stock community accuracy ring both display the σ-based **Hit Rate** (`wins / (wins + loses + noise)`) as their headline number, while the popover detail shows **Precision** (`wins / (wins + loses)`). On a popular KOL with broad σ thresholds (e.g. ±40% σ on the 1-year period for a low-vol large-cap), the noise band swallows ~60% of resolved calls and the headline lands around 20%, which retail users read as "this KOL is bad" even when the directional read is consistently correct.

Two compounding problems:

1. **Label collision in zh-TW.** `kols.detail.scorecard.hitRate`, `stocks.detail.communityAccuracy.hitRateLabel`, and `dashboard.hitRate` all translate to **「精準度」**, and `common.metrics.precision` *also* translates to **「精準度」**. The same word displays two different numbers, with no way to tell from the UI which is which.
2. **Headline metric is too academic.** The σ-framework is the project's analytical core and is correct, but the explanation ("we use 1σ realised volatility as a noise-band, anything inside is filtered out, so 24% means…") doesn't fit on a card. Users bounce before they read the popover.

The σ-derived metrics (precision, SQR, avgExcessWin/Lose) remain valuable for advanced users — they should be retained but demoted from headline to a flat "advanced analytics" section. The headline should instead be a metric that has an obvious random baseline (50%) and that a retail user can read at a glance.

A small histogram of σ-normalised returns next to the ring makes the σ framework visually accessible: shape and skew of the distribution are immediately legible without requiring the user to interpret SQR or threshold numbers in isolation.

## Goals / Non-Goals

**Goals:**

- The ring's headline number is intuitive at first glance, with a built-in baseline (50%) so users can read "above" or "below" without external context.
- The σ framework remains visible for advanced users, on the same card, with formula tooltips that explain each number in place rather than in a popover.
- Period selector continues to drive the entire card; users do not need to memorise different controls for the ring, histogram, and stats.
- New aggregations are computed once on the existing scorecard recompute pass; they ride inside the existing JSONB cache payloads with zero schema migrations.
- Existing zh-TW collision (`hitRate` and `precision` both → 精準度) is resolved as part of this change.

**Non-Goals:**

- Changing the win/lose/noise classifier or the σ threshold computation. `CLASSIFIER_VERSION` does not bump; existing `post_win_rate_samples` rows are reused as-is.
- Backfilling historical data. `cache_version` is bumped so legacy cache rows are treated as misses; they recompute lazily on the existing miss path.
- Replacing the per-stock breakdown chips on the KOL scorecard. Those continue to render σ-based hit rate for now (separate proposal if we want the same treatment there).
- A "compare 4 periods at once" multi-histogram view. Period switching is sufficient.
- Server-side statistical-significance gating (e.g. hiding metrics until `p < 0.05`). The badge is advisory only; the underlying numbers always render.

## Decisions

### D1 — Directional Hit Rate definition and sample basis

`directionalHitRate` is computed over the same sample set as `hitRate` (i.e. samples with `outcome ∈ {win, lose, noise}`, equivalently `sentiment ≠ 0` and `priceChange !== null`). For each such sample:

```
isDirectionallyCorrect = (sign(sentiment) * sign(priceChange)) > 0
```

`directionalHitRate = count(isDirectionallyCorrect) / count(non-excluded resolved samples)`.

`sign(0) = 0`, so a `priceChange` of exactly zero is **neither** a hit nor a miss for the directional metric. These are extremely rare on real equity series (sub-tick discretisation) but we count them in `directionalSampleSize` to keep the denominator honest. Effectively this means a tied sample drags the ratio toward zero by one unit in the denominator only.

`directionalSampleSize` is exposed as a separate field so the UI can render the sample count with confidence — using `total` (which includes excluded) or `winCount + loseCount + noiseCount` would both be subtly wrong (the former includes neutral-sentiment posts; the latter equals `directionalSampleSize` only when no exact-zero priceChanges exist).

**Why not exclude noise from the directional metric?** The whole point is that noise-band moves still carry directional information. A bullish call where the stock rose 0.5% within a ±2% σ band is currently classified as `noise` for the σ-framework, but the directional read was correct. Excluding noise would just reproduce `precision` with extra steps.

**Why not normalise by σ?** Normalising would mean the metric collapses to "did the σ-normalised excess return land on the correct side of zero", which is identical to "did `priceChange × sign(sentiment) > 0`" for non-excluded samples (since σ > 0). The metric is identical with or without σ normalisation; we present it as the un-normalised ratio for clarity in formulas.

### D2 — Six-bin σ-band histogram

Bins are defined on the **direction-adjusted** `excessReturn` (which is already `sign(sentiment) × priceChange / σ`):

| Index | Range | Semantic |
|------:|----------------------|------------------------|
| 0     | `excessReturn < -2`  | 大敗 (≥ 2σ wrong way)  |
| 1     | `-2 ≤ excessReturn < -1` | 敗 (1σ ~ 2σ wrong)   |
| 2     | `-1 ≤ excessReturn < 0`  | 小逆 (noise, wrong half) |
| 3     | `0 ≤ excessReturn < 1`   | 小順 (noise, right half) |
| 4     | `1 ≤ excessReturn < 2`   | 勝 (1σ ~ 2σ right)   |
| 5     | `excessReturn ≥ 2`   | 大勝 (≥ 2σ right way)  |

Boundary rule: left-closed, right-open, except the last bin which is closed on both sides (as a half-line).

`excessReturn === 0` falls in bin 3 (small win side). This is intentional — a directionally-perfect miss-by-a-hair belongs on the positive half visually. We do not introduce a "tie" bin because it would be empty in practice.

**Why six bins, not 8 like the reference normal-distribution image?** With realistic N (a few hundred for the 1y period, tens for 5d), the `> +3σ` and `< -3σ` tails are usually empty or near-empty. Six bins keep every bin visually meaningful at small N. The bins still align with the canonical 68/27/5 normal-distribution split.

**Why store as a 6-element array instead of named fields?** Rendering iterates bins in order and the array form makes that trivial. The mapping from index to range is documented in one place (the rendering component) and the calculator simply produces the array.

`histogram[i]` is a raw count, not a percentage. The renderer normalises to `max(histogram) = 100% bar height` per period; this prevents layout shift when toggling periods. `directionalSampleSize` is the natural denominator if a percentage is needed.

### D3 — `WinRateBucket` extensions

```ts
// Added fields, in src/domain/calculators/win-rate.calculator.ts:WinRateBucket

interface WinRateBucket {
  // ... existing fields unchanged ...

  /**
   * count(sign(sentiment) × sign(priceChange) > 0) / directionalSampleSize.
   * Null when directionalSampleSize === 0 OR sufficientData === false.
   */
  directionalHitRate: number | null;

  /**
   * Count of samples with outcome ∈ {win, lose, noise} (i.e. sentiment ≠ 0 and
   * priceChange !== null). Equals winCount + loseCount + noiseCount in practice.
   * Exposed separately so the UI does not have to recompute or guess at the
   * denominator.
   */
  directionalSampleSize: number;

  /**
   * Six-bin σ-band histogram of direction-adjusted excessReturn:
   *   [< -2σ, -2σ ~ -1σ, -1σ ~ 0, 0 ~ +1σ, +1σ ~ +2σ, > +2σ]
   * Sum equals directionalSampleSize minus any samples whose excessReturn is
   * null (which is impossible for outcome ∈ {win, lose, noise} given current
   * classifier semantics, but we tolerate it defensively).
   */
  histogram: [number, number, number, number, number, number];
}
```

`sufficientData` continues to gate `hitRate`, `precision`, AND now `directionalHitRate`. The threshold is the existing `MIN_RESOLVED_POSTS_PER_PERIOD = 10` (winCount + loseCount), not a separate threshold for directional sample size — keeping one gate avoids three different "this period is/isn't ready" states.

**Why null-when-insufficient for `directionalHitRate` but raw count for `histogram`?** A null directional hit rate forces the UI into an explicit "insufficient" path (badge, no number); the histogram on the other hand renders fine even at small N — the bars just look short. The "樣本不足以判斷" badge under the ring is the user-facing signal in both cases.

### D4 — Ring rendering: 50%-centred gauge

The existing `WinRateRing` component uses a circular SVG progress arc filling clockwise from 12 o'clock proportional to the percentage. For directional hit rate, that visualisation is misleading: 50% is "no edge", not "half-full".

New rendering, in `WinRateRing` (extended via a `mode` prop) or a sibling component:

```
┌───────────────────────────┐
│      ╭───── 12pm ────╮    │
│     ╱   ↘ green arc   ╲   │   value > 50% → arc grows clockwise
│    ╱  ╭──────────────╮ ╲  │   value < 50% → arc grows counter-clockwise
│    │  │   55%        │  │ │   arc length = |value − 50%| × 2 × halfCircumference
│    ╲  ╰──────────────╯ ╱  │   colour: green for > 50%, red for < 50%, grey @ 50%
│     ╲                 ╱   │
│      ╰───────────────╯    │
└───────────────────────────┘
```

Implementation: the existing SVG circle is split into two arcs starting at 12 o'clock. For value `v ∈ [0, 100]` and full circumference `C`:

- Right (clockwise) arc length: `max(0, v − 50) / 100 × C` (green)
- Left (counter-clockwise) arc length: `max(0, 50 − v) / 100 × C` (red)
- Background: full circumference in muted grey

When `directionalHitRate` is null (`!sufficientData`), render the grey baseline ring only, no coloured arc, and show the "樣本不足以判斷" badge underneath.

**Mode prop, not a new component**, because the σ-based ring on the per-stock breakdown chips inside the same scorecard still uses fill-from-zero. `WinRateRing` gets a `mode: 'fill-from-zero' | 'centred-gauge'` prop, defaulting to the existing behaviour to avoid breaking unrelated callers.

### D5 — Cache versioning and rollout

`cache_version` is bumped at the application layer (constant in `scorecard.service.ts` or wherever it lives today). On read, rows with the old version are treated as misses — exactly the same path as `stale = TRUE`. No DDL, no backfill job. Existing TTL-based staleness logic continues to work unchanged.

**Why not `CLASSIFIER_VERSION`?** That constant gates `post_win_rate_samples` rows. Our changes are purely aggregational on top of those samples; the per-sample classification, threshold, and `excess_return` remain valid. Bumping `CLASSIFIER_VERSION` would force re-running the (expensive) classifier and price-fetch path for every existing sample — for zero functional gain.

**Cold-start cost**: on the first read post-deploy, every viewed KOL/stock recomputes once. The `aggregateBucket` call is `< 1 ms` and the dominant cost is the existing sample-row read, which already happens. The recompute is fired off via the existing miss path (`{ status: 'computing' }` + `setImmediate` enqueue), so user-perceived latency is unchanged.

### D6 — Statistical-significance hint

For `directionalSampleSize ≥ 30` we run a two-sided binomial test against `p₀ = 0.5`:

```
hits = round(directionalHitRate × directionalSampleSize)
n    = directionalSampleSize
pValue = 2 × min(P(X ≤ hits | n, 0.5), P(X ≥ hits | n, 0.5))
```

If `pValue < 0.05`, the UI shows a `✓ 統計顯著` badge. Otherwise no badge (we don't show a "not significant" badge — that creates noise on the more common case of borderline KOLs).

**Why client-side?** The computation is `O(n)` and trivial; serialising a precomputed `pValue` per period would inflate every cache row. The client also gets the entire bucket already, so no extra request.

**Why `p < 0.05` and not stricter?** This is a UX hint, not a publication threshold. 0.05 is the universally-recognised marker; bumping it to 0.01 would suppress the badge on ~80% of currently-tracked KOLs and remove most of its informational value.

### D7 — Removal of `PerformanceMetricsPopover`

The component is currently used in two places — `kol-scorecard.tsx` and `community-accuracy-card.tsx`. Both consumers migrate to inline rendering in the same change. After migration, the file `src/components/shared/performance-metrics-popover.tsx` and its test `src/components/shared/__tests__/performance-metrics-popover.test.tsx` are deleted. There are no other consumers (verified via grep).

Each metric in the inline section uses a new shared component `MetricWithFormulaTooltip`, which wraps `<dt>{label} <ⓘ Tooltip>{formula+values}</Tooltip></dt><dd>{value}</dd>` so the pattern is consistent across all six metrics.

### D8 — i18n collision resolution

| Key                                                | Old zh-TW | New zh-TW | en           |
|----------------------------------------------------|-----------|-----------|--------------|
| `kols.detail.scorecard.hitRate`                    | 精準度     | 命中率     | Hit Rate     |
| `stocks.detail.communityAccuracy.hitRateLabel`     | 精準度     | 命中率     | Hit Rate     |
| `dashboard.hitRate`                                | 精準度     | 命中率     | Hit Rate     |
| `dashboard.kol.accuracy`                           | 精準度     | (review)  | Accuracy     |
| `common.metrics.precision`                         | 精準度     | **精準度** (kept) | Precision |
| **NEW** `common.metrics.directionalHitRate`        | —         | 方向命中率 | Directional Hit Rate |
| **NEW** `common.metrics.histogramTitle`            | —         | σ 分布     | σ-band Distribution |
| **NEW** `common.metrics.advancedHeading`           | —         | 進階分析   | Advanced Analytics |
| **NEW** `common.metrics.strongSignalGroup`         | —         | 強訊號表現 | Strong Signal Quality |
| **NEW** `common.metrics.returnQualityGroup`        | —         | 報酬品質   | Return Quality |
| **NEW** `common.metrics.insufficientSampleBadge`   | —         | 樣本不足以判斷 | Insufficient sample |
| **NEW** `common.metrics.statisticallySignificantBadge` | —     | ✓ 統計顯著 | ✓ Statistically significant |
| **NEW** `common.metrics.formulaTooltip.<metric>`   | —         | (per-metric tooltip body) | (per-metric tooltip body) |

`dashboard.kol.accuracy` is reviewed but only renamed if it visibly conflicts in context — in some dashboard widgets "精準度" might still be the right word (it's used as a generic "accuracy" label, not specifically `precision`). This is decided at task time by reading the surrounding component.

### D9 — Mobile layout

Breakpoints follow the existing card patterns (`sm:`, `md:`, `lg:`):

- `< sm` (≤ 640px): Ring stacks above the histogram. Stats grid is 1-col.
- `sm` to `md`: Ring | histogram side-by-side. Stats grid is 2-col.
- `md+`: Ring | histogram side-by-side. Stats grid is 3-col (matching the desktop popover layout).

The histogram component takes a `compact` boolean to drop bin labels and shrink heights on mobile. The directional sample-size badge wraps under the ring on all sizes.

## Risks / Trade-offs

- **Risk**: Users misinterpret 55% directional hit rate as "wins 55% of the time" instead of "directionally correct 55% of the time" and over-trust the KOL. **Mitigation**: the formula tooltip is right next to the ring, the histogram visualises distribution shape, and the statistical-significance badge gates over-confident reads on small samples.
- **Risk**: A KOL with high-conviction calls (high σ-based precision) but narrowly directional reads loses some of their currently-displayed shine because the ring shifts to directional. **Mitigation**: precision moves into the prominently-displayed advanced section, not into a popover; users who care about strong-signal quality can still see it in one click.
- **Trade-off**: We lose the ability to show *only* one number for at-a-glance comparison (e.g. on a dashboard list of KOLs). The dashboard card currently uses `dashboard.hitRate` ("精準度" → "命中率"). This change does not modify the dashboard list itself; the rename happens but the data source stays the same. A follow-up may want the dashboard to also show `directionalHitRate`.
- **Trade-off**: Six bins is fewer than the reference normal-distribution image's eight, so the >3σ tails are merged into the >2σ bin. Acceptable because (a) those tails are usually empty at realistic N, and (b) the shape information that matters (left-skew vs right-skew vs centred) is preserved at six bins.

## Migration Plan

1. Land the calculator changes (`directionalHitRate`, `directionalSampleSize`, `histogram`) with full unit-test coverage. Existing tests still pass (existing fields unchanged).
2. Bump `cache_version` constant. Deploy. First reads recompute; users see `{ status: 'computing' }` → poll → ready in seconds, identical to today's cold-KOL behaviour.
3. Land UI components (`SigmaBandHistogram`, `MetricWithFormulaTooltip`) and `WinRateRing` mode prop.
4. Wire `kol-scorecard.tsx` and `community-accuracy-card.tsx` to the new layout. Land i18n updates in the same commit.
5. Delete `PerformanceMetricsPopover` and its test in a follow-up commit, after the two consumers are confirmed migrated. (Splitting the deletion lets us roll back the UI wiring in isolation if needed.)
6. Manual QA: open `/kols/<id>` and `/stocks/<ticker>` for at least one KOL with sufficient data and one with insufficient data; confirm ring colour, badge state, histogram shape, and tooltip content match the spec scenarios.

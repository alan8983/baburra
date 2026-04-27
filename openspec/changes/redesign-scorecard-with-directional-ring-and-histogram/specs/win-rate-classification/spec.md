## ADDED Requirements

### Requirement: Directional hit rate metric

The `WinRateBucket` SHALL expose a `directionalHitRate` field defined as the proportion of non-excluded resolved samples for which the call's direction agrees with the realised price movement, regardless of whether the move crossed the σ threshold. Specifically:

- Eligible samples are those with `outcome ∈ {win, lose, noise}` (equivalently `sentiment ≠ 0` and `priceChange !== null`).
- A sample is **directionally correct** when `sign(sentiment) × sign(priceChange) > 0`.
- A sample with `priceChange === 0` is neither directionally correct nor incorrect; it is counted in the denominator but not the numerator.
- `directionalHitRate = countDirectionallyCorrect / directionalSampleSize`.
- `directionalHitRate` is `null` when `directionalSampleSize === 0` OR when `sufficientData === false`.

The `WinRateBucket` SHALL also expose `directionalSampleSize: number` equal to the count of eligible samples (i.e. `winCount + loseCount + noiseCount` in the absence of zero-priceChange samples).

`directionalHitRate` SHALL NOT depend on the σ threshold; it is computed from `priceChange` and `sentiment` alone.

#### Scenario: Bullish call with positive price change is directionally correct

- **WHEN** a sample has `sentiment = +1` and `priceChange = +0.005` (below the σ threshold)
- **THEN** the sample is classified as `noise` for the σ-framework, but counts toward the directional-hit numerator and denominator

#### Scenario: Bearish call with negative price change is directionally correct

- **WHEN** a sample has `sentiment = -1` and `priceChange = -0.01`
- **THEN** the sample counts toward the directional-hit numerator and denominator regardless of the σ threshold

#### Scenario: Bullish call with negative price change is directionally incorrect

- **WHEN** a sample has `sentiment = +1` and `priceChange = -0.001`
- **THEN** the sample counts in the denominator only, not the numerator

#### Scenario: Sample with priceChange exactly zero is counted in the denominator only

- **WHEN** a sample has `sentiment = +1` and `priceChange = 0`
- **THEN** `directionalSampleSize` increases by 1 and the numerator does not change

#### Scenario: Excluded samples are ignored

- **WHEN** a sample has `sentiment = 0` or `priceChange === null`
- **THEN** it does not contribute to `directionalSampleSize` or the numerator

#### Scenario: Insufficient data nulls the rate but not the size

- **WHEN** a bucket has `winCount + loseCount < MIN_RESOLVED_POSTS_PER_PERIOD`
- **THEN** `directionalHitRate` is `null` and `directionalSampleSize` reflects the actual eligible-sample count

#### Scenario: Mixed sample produces ratio in [0, 1]

- **WHEN** a bucket has 6 directionally-correct samples out of 10 eligible samples and `sufficientData === true`
- **THEN** `directionalHitRate === 0.6` and `directionalSampleSize === 10`

### Requirement: σ-band histogram of direction-adjusted excess return

The `WinRateBucket` SHALL expose a `histogram` field of type `[number, number, number, number, number, number]` carrying the count of eligible samples whose direction-adjusted `excessReturn` falls in each of six contiguous σ bands. Eligible samples are those with `outcome ∈ {win, lose, noise}` AND `excessReturn !== null`. The bins are:

| Index | Range                          |
|------:|--------------------------------|
| 0     | `excessReturn < -2`            |
| 1     | `-2 ≤ excessReturn < -1`       |
| 2     | `-1 ≤ excessReturn < 0`        |
| 3     | `0 ≤ excessReturn < 1`         |
| 4     | `1 ≤ excessReturn < 2`         |
| 5     | `excessReturn ≥ 2`             |

Boundary rule: each interval is left-closed, right-open, except bin 5 which is closed (it is a half-line). A sample with `excessReturn === 0` MUST be assigned to bin 3.

`histogram` SHALL always be returned, even when `sufficientData === false`. Empty buckets contain `0`.

#### Scenario: Sample at exactly the +1σ boundary lands in bin 4

- **WHEN** a sample has `excessReturn = 1`
- **THEN** `histogram[4]` increases by 1 and `histogram[3]` is unchanged

#### Scenario: Sample at exactly zero lands in bin 3

- **WHEN** a sample has `excessReturn = 0`
- **THEN** `histogram[3]` increases by 1

#### Scenario: Strong positive excess lands in the rightmost bin

- **WHEN** a sample has `excessReturn = 4.5`
- **THEN** `histogram[5]` increases by 1

#### Scenario: Strong negative excess lands in the leftmost bin

- **WHEN** a sample has `excessReturn = -3.2`
- **THEN** `histogram[0]` increases by 1

#### Scenario: Histogram sum equals directional sample size for non-degenerate buckets

- **WHEN** a bucket contains only samples with non-null `excessReturn` and non-zero `priceChange`
- **THEN** `sum(histogram) === directionalSampleSize`

#### Scenario: Histogram is populated even when sufficientData is false

- **WHEN** a bucket has 5 eligible samples (below `MIN_RESOLVED_POSTS_PER_PERIOD`)
- **THEN** `histogram` reflects the actual distribution of those 5 samples and `directionalHitRate` is `null`

### Requirement: New aggregation fields are pure functions of existing classified samples

The computation of `directionalHitRate`, `directionalSampleSize`, and `histogram` SHALL NOT require new I/O, new threshold lookups, or new price fetches beyond those already performed for the existing `WinRateBucket` fields. They SHALL be derived in `aggregateBucket` from the same in-memory `ClassifiedSample[]` already used for `hitRate`, `precision`, `sqr`, `avgExcessWin`, and `avgExcessLose`.

The `CLASSIFIER_VERSION` constant SHALL NOT be incremented as part of adding these fields, because no per-sample classification, threshold computation, or excess-return formula changes.

#### Scenario: Existing samples remain valid after the field additions

- **WHEN** a `post_win_rate_samples` row was written under the current `CLASSIFIER_VERSION` before this change
- **THEN** `aggregateBucket` SHALL produce a `WinRateBucket` populated with all new fields without re-classifying or re-fetching that sample

#### Scenario: Aggregation pass remains O(n) over the sample list

- **WHEN** `aggregateBucket` is called on a list of N classified samples
- **THEN** the new fields SHALL be computed in additional time proportional to N (no nested iteration over thresholds, prices, or DB rows)

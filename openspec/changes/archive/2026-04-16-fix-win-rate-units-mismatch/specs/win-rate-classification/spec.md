## ADDED Requirements

### Requirement: Units contract for priceChange and threshold

The win-rate classification pipeline SHALL enforce a single units contract across its two primary inputs: `priceChange` is expressed in **percent-space** (a 2.8% move is the number `2.8`) and `threshold` is expressed in **fraction-space** (a 4.6% σ is the number `0.046`). The service layer (`computeWinRateStats`) MUST normalize `priceChange` to fraction-space (by dividing by 100) before passing it to the pure classifier functions `classifyOutcome` and `computeExcessReturn`. The pure classifier functions MUST assume both inputs arrive in fraction-space and MUST NOT perform any unit conversion themselves.

#### Scenario: Service normalizes percent-space priceChange before classification
- **WHEN** `computeWinRateStats` is invoked with a post whose `priceChanges.day30 = 2.8` and a provider returning `threshold = 0.046`
- **THEN** the resulting `avgExcessWin` / `avgExcessLose` for day30 satisfies `|value| < 10` (i.e. the σ-normalized excess return lands in the Information-Ratio-style band, not the 100×-inflated range)

#### Scenario: Pure classifier rejects unit conversion
- **WHEN** `computeExcessReturn({ sentiment: 1, priceChange: 0.028, threshold: 0.046 })` is called directly with fraction-space inputs
- **THEN** the returned value is approximately `0.609` and no implicit ×100 or ÷100 is applied

#### Scenario: Stored priceChange column remains in percent-space
- **WHEN** a fresh sample is persisted to `post_win_rate_samples` via `upsertSamples`
- **THEN** the `price_change` column value matches the raw `priceChanges.dayN` input in %-space (e.g., `2.8`), NOT the fraction-space value used internally for classification

### Requirement: Classification outcomes

Each (post, stock, period) tuple SHALL be classified into exactly one of four outcomes based on the sentiment, the σ-threshold-normalized priceChange, and the noise-band rule:

- `excluded` — sentiment is neutral (0), priceChange is null, or threshold is degenerate (0 or unresolved).
- `noise` — priceChange lies in the closed interval `[-threshold, +threshold]` (both endpoints inclusive).
- `win` — sentiment is bullish and priceChange > +threshold, OR sentiment is bearish and priceChange < -threshold.
- `lose` — sentiment is bullish and priceChange < -threshold, OR sentiment is bearish and priceChange > +threshold.

The `noise` band MUST be evaluated on the same-units basis (fraction-space for both sides) so that sub-σ moves are correctly classified as noise rather than win/lose.

#### Scenario: Sub-threshold move classifies as noise
- **WHEN** a bullish post has day30 priceChange of `+2.0%` (i.e. `0.02` in fraction-space) and the day30 threshold is `0.046`
- **THEN** the outcome is `noise` (because `0.02 ∈ [-0.046, +0.046]`)

#### Scenario: Threshold boundary is inclusive
- **WHEN** priceChange in fraction-space exactly equals `+threshold` or `-threshold`
- **THEN** the outcome is `noise`, not `win` or `lose`

#### Scenario: Bearish win flips the sign
- **WHEN** a bearish post has day30 priceChange of `-6%` (fraction-space `-0.06`) and threshold `0.05`
- **THEN** the outcome is `win` and `excessReturn` is positive (`+1.2`)

#### Scenario: Neutral sentiment is always excluded
- **WHEN** a post has `sentiment = 0` for any priceChange and threshold
- **THEN** the outcome is `excluded` regardless of move magnitude

### Requirement: σ-normalized excess return formula

The `excessReturn` for a non-excluded sample SHALL be computed as `sign(sentiment) × priceChange / threshold`, with both `priceChange` and `threshold` in fraction-space. Winning samples MUST produce a positive `excessReturn`; losing samples MUST produce a negative `excessReturn`. For typical KOL predictions on liquid equities/indices, `|excessReturn|` SHOULD fall in the `[0, 5]` range per sample; values exceeding `|10|` indicate a units or data bug and SHALL trigger a regression test failure in CI.

#### Scenario: Bullish win produces positive excessReturn proportional to move size
- **WHEN** a bullish post has fraction-space priceChange `+0.09` and threshold `0.03`
- **THEN** `excessReturn` equals `+3.0`

#### Scenario: Bearish win produces positive excessReturn (sign flipped)
- **WHEN** a bearish post has fraction-space priceChange `-0.05` and threshold `0.025`
- **THEN** `excessReturn` equals `+2.0`

#### Scenario: Regression guard on service-level output
- **WHEN** the `win-rate.service` regression test runs with realistic inputs (priceChange in %-space, threshold in fraction-space)
- **THEN** `avgExcessWin` and `avgExcessLose` both satisfy `|value| < 10`, and the test fails with a descriptive message if the assertion breaks

### Requirement: Classifier versioning for cache invalidation

Every persisted row in `post_win_rate_samples` SHALL carry a `classifier_version` integer stamped by the writer. All read queries MUST filter rows by `classifier_version = CLASSIFIER_VERSION` (the current in-code constant). When the classification math changes in a way that invalidates historical rows, the `CLASSIFIER_VERSION` constant MUST be bumped in the same commit as the math change so old rows become invisible on the read path and get re-classified lazily on next access. The current change bumps `CLASSIFIER_VERSION` from `1` to `2`.

#### Scenario: Bumping version hides old rows
- **WHEN** `CLASSIFIER_VERSION` is set to `2` and `loadSamplesByPostIds` is called with posts that only have `classifier_version = 1` rows in the database
- **THEN** the returned map is empty and the caller re-classifies via the compute path

#### Scenario: New rows are written at the current version
- **WHEN** `upsertSamples` writes freshly classified rows
- **THEN** every row has `classifier_version` equal to the current `CLASSIFIER_VERSION` constant

#### Scenario: Rollback restores old rows
- **WHEN** `CLASSIFIER_VERSION` is reverted from `2` back to `1` (e.g., a PR revert)
- **THEN** the pre-existing `classifier_version = 1` rows become visible again on the read path without any database change

### Requirement: Sufficient-data gating for derived metrics

Per-period derived metrics (`hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`) SHALL be exposed only when the period has at least `MIN_RESOLVED_POSTS_PER_PERIOD` resolved samples (sum of `winCount + loseCount`). Below that threshold, each of these fields MUST be `null` and the bucket's `sufficientData` flag MUST be `false`. Noise-only or pending-only buckets do not count toward sufficiency.

#### Scenario: Bucket with too few resolved samples hides metrics
- **WHEN** a period has `winCount = 4` and `loseCount = 3` (below the `MIN_RESOLVED_POSTS_PER_PERIOD = 10` threshold)
- **THEN** `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, and `sqr` are all `null` and `sufficientData` is `false`

#### Scenario: Bucket at or above threshold exposes metrics
- **WHEN** a period has `winCount + loseCount >= MIN_RESOLVED_POSTS_PER_PERIOD`
- **THEN** all derived metrics are computed (non-null when their intrinsic denominator is non-zero) and `sufficientData` is `true`

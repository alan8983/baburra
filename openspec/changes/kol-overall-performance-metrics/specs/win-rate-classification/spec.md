## ADDED Requirements

### Requirement: Period Metrics Shape

The system SHALL expose a `PeriodMetrics` structure per time window (5d / 30d / 90d / 365d) containing at minimum the fields `wins`, `noise`, `loses`, `total`, `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`, and `sufficientData`, in addition to any existing classifier fields.

#### Scenario: All four periods returned
- **WHEN** a caller invokes the KOL win-rate service for a KOL with posts
- **THEN** the result contains `day5`, `day30`, `day90`, and `day365` entries, each a `PeriodMetrics` object
- **AND** each entry reports the counts and derived metrics for its own period only, with no cross-period borrowing

#### Scenario: Counts always populated even under the sample floor
- **WHEN** a period has fewer than 10 resolved (`wins + loses`) samples
- **THEN** `wins`, `noise`, `loses`, and `total` are still populated with the actual counts
- **AND** `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, and `sqr` are `null`
- **AND** `sufficientData` is `false`

### Requirement: Hit Rate

The service SHALL compute `hitRate = wins / (wins + noise + loses)` per period and return it as the primary accuracy number.

#### Scenario: Hit Rate includes noise in denominator
- **WHEN** a period has 6 wins, 2 loses, and 12 noise samples (wins+loses ≥ 10)
- **THEN** `hitRate` equals `6 / 20 = 0.30`
- **AND** `precision` equals `6 / 8 = 0.75`

#### Scenario: Noise-dominated KOL is distinguished
- **WHEN** a period has 1 win, 0 loses, and 20 noise samples
- **THEN** `sufficientData` is `false` and `hitRate` is `null`
- **AND** the counts still reveal the noise-dominated distribution to the caller

### Requirement: Precision (Secondary)

The service SHALL compute `precision = wins / (wins + loses)` per period and return it alongside `hitRate` as a secondary metric.

#### Scenario: Precision equals the legacy win rate
- **WHEN** a period meets the sample floor
- **THEN** `precision` equals the previous `winRate` definition exactly
- **AND** any existing consumer binding to `winRate` receives the same value if a backwards-compat alias is preserved

### Requirement: Sigma-Normalized Excess Returns

For every classified sample that is not `excluded`, the service SHALL compute `excessReturn = directionSign * priceChange / threshold.value`, where `directionSign` is `+1` for bullish sentiment and `-1` for bearish sentiment, so that winning samples produce positive values and losing samples produce negative values.

#### Scenario: Bullish win
- **WHEN** a bullish post's 30-day return is `+0.06` against a 1σ threshold of `0.02`
- **THEN** the sample's `excessReturn` is `+3.0`

#### Scenario: Bearish win
- **WHEN** a bearish post's 30-day return is `-0.05` against a 1σ threshold of `0.02`
- **THEN** the sample's `excessReturn` is `+2.5`

#### Scenario: Bullish lose
- **WHEN** a bullish post's 30-day return is `-0.04` against a 1σ threshold of `0.02`
- **THEN** the sample's `excessReturn` is `-2.0`

### Requirement: Average Excess Win and Lose

The service SHALL compute `avgExcessWin` as the arithmetic mean of `excessReturn` over samples classified as `win`, and `avgExcessLose` as the mean over samples classified as `lose`.

#### Scenario: Average Excess Win is positive
- **WHEN** a period has win samples with σ-normalized returns `[1.2, 3.0, 2.1]`
- **THEN** `avgExcessWin` equals `2.1`

#### Scenario: Average Excess Lose carries its sign
- **WHEN** a period has lose samples with σ-normalized returns `[-1.5, -2.5, -2.0]`
- **THEN** `avgExcessLose` equals `-2.0`
- **AND** the negative sign is preserved so downstream formatters can render the magnitude directly

#### Scenario: No eligible samples
- **WHEN** a period has zero win samples
- **THEN** `avgExcessWin` is `null`
- **AND** the same rule applies symmetrically to `avgExcessLose`

### Requirement: Signal Quality Ratio

The service SHALL compute `sqr = mean(excessReturn) / stdev(excessReturn)` over all `win`, `lose`, and `noise` samples for the period (excluding `excluded` samples), using a sample standard deviation with Bessel's correction.

#### Scenario: SQR includes noise samples
- **WHEN** a period has samples classified as win, lose, and noise
- **THEN** noise samples are included in both the mean and the stdev computation with their signed σ-normalized values (which will be within `[-1, +1]` for noise)

#### Scenario: SQR is null when undefined
- **WHEN** a period has fewer than 2 classified samples, or when `stdev(excessReturn) === 0`, or when `sufficientData` is false
- **THEN** `sqr` is `null`

#### Scenario: SQR benchmarks documented
- **WHEN** a caller interprets `sqr`
- **THEN** the following bands are documented: `sqr > 1.0` excellent, `0.5 ≤ sqr ≤ 1.0` decent, `sqr < 0.5` unstable

### Requirement: Minimum Sample Floor

The service SHALL treat a period as `sufficientData` only when `wins + loses ≥ 10`, and SHALL null-out `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, and `sqr` when this condition is not met. The threshold SHALL be exposed as a single named constant `MIN_RESOLVED_POSTS_PER_PERIOD = 10`.

#### Scenario: Below floor
- **WHEN** a period has 9 resolved samples (wins + loses)
- **THEN** `sufficientData` is `false`
- **AND** all derived metrics are `null`
- **AND** the raw counts are still returned

#### Scenario: At the floor
- **WHEN** a period has exactly 10 resolved samples
- **THEN** `sufficientData` is `true`
- **AND** all derived metrics are populated

### Requirement: Per-Period Independence

The service SHALL compute `sufficientData` and all derived metrics independently per period, with no cross-period aggregation, averaging, or inheritance.

#### Scenario: Mixed sufficiency across periods
- **WHEN** a KOL has 25 resolved samples for day5 but only 3 for day365
- **THEN** `day5.sufficientData` is `true` with full metrics populated
- **AND** `day365.sufficientData` is `false` with null derived metrics
- **AND** no day5 data leaks into day365 computation

### Requirement: API Response Shape

The `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate` routes SHALL return a payload whose `day5`, `day30`, `day90`, and `day365` entries satisfy the `PeriodMetrics` contract.

#### Scenario: KOL win-rate route returns PeriodMetrics
- **WHEN** a client requests `GET /api/kols/[id]/win-rate` for an existing KOL
- **THEN** the JSON response contains all four period keys
- **AND** each period object contains the fields `wins`, `noise`, `loses`, `total`, `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`, and `sufficientData`

#### Scenario: Stock win-rate route returns PeriodMetrics
- **WHEN** a client requests `GET /api/stocks/[ticker]/win-rate` for a tracked ticker
- **THEN** the same `PeriodMetrics` contract is honored for each period

### Requirement: Backwards-Compatible winRate Alias (Transitional)

During the transition, the API response and service return value SHALL include a `winRate` field per period whose value equals `precision`, so existing consumers continue to render the same number until they migrate to `hitRate`. The alias SHALL be marked `@deprecated` in TypeScript types.

#### Scenario: Alias matches precision
- **WHEN** a period is `sufficientData`
- **THEN** `winRate === precision`
- **AND** both are `null` together when the floor is not met

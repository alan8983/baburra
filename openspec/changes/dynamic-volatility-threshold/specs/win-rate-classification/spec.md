## ADDED Requirements

### Requirement: Single Source of Truth for Win Rate Classification
The system SHALL classify a Post-stock-period tuple as `win`, `lose`, `noise`, or `excluded` through a single shared classifier (`win-rate.calculator.ts`). All consumer surfaces (KOL scorecard, dashboard pulse, KOL leaderboard, stock detail) SHALL obtain win-rate metrics from this classifier (directly or through the `WinRateService` and its API routes); they SHALL NOT reimplement classification inline.

#### Scenario: Inline computations replaced
- **WHEN** any consumer renders a "win rate" value
- **THEN** the value originates from the central `win-rate.calculator.ts` (via service or hook), not from a local `useMemo` reimplementation

### Requirement: Sentiment Mapping
The classifier SHALL interpret the project's `Sentiment` integer scale `-3..+3` such that any `sentiment > 0` is treated as Bullish, any `sentiment < 0` is treated as Bearish, and `sentiment === 0` is treated as Neutral and excluded.

#### Scenario: Strength does not affect classification in v1
- **WHEN** two posts have sentiment `+1` and `+3` respectively, identical price change, and identical threshold
- **THEN** both posts receive the same outcome

#### Scenario: Neutral excluded
- **WHEN** a post's `sentiment === 0`
- **THEN** the classifier returns `excluded` regardless of the price change

### Requirement: Dynamic 1σ Threshold Replaces Implicit Zero
The classifier SHALL use a per-(ticker, periodDays, postedAt) threshold equal to 1 standard deviation of the ticker's realized N-day returns, supplied by the volatility module. The previous implicit zero-threshold rule (`change > 0` ⇒ Win) SHALL NOT be used.

#### Scenario: Bullish post above +1σ
- **WHEN** a Bullish post's realized return for period N is strictly greater than `+1σ(ticker, N, postedAt)`
- **THEN** the classifier returns `win`

#### Scenario: Bullish post within ±1σ is Noise
- **WHEN** a Bullish post's realized return for period N is in the closed interval `[-1σ, +1σ]`
- **THEN** the classifier returns `noise`

#### Scenario: Bullish post below -1σ
- **WHEN** a Bullish post's realized return for period N is strictly less than `-1σ`
- **THEN** the classifier returns `lose`

#### Scenario: Bearish post mirror
- **WHEN** a Bearish post's realized return for period N is strictly less than `-1σ`
- **THEN** the classifier returns `win`

#### Scenario: Missing price change
- **WHEN** the price change for the period is `null` (no data or pending)
- **THEN** the classifier returns `excluded`

### Requirement: Realized Volatility from Overlapping N-Day Returns
The system SHALL compute `σ(ticker, N, asOfDate)` as the sample standard deviation of every overlapping N-day return observable in the lookback window for the ticker, ending strictly before `asOfDate`. √T scaling of daily volatility SHALL NOT be used.

#### Scenario: Overlapping return series
- **WHEN** the lookback window contains close prices `p[0..L-1]`
- **THEN** the system forms `r_i = p[i+N]/p[i] - 1` for every valid `i` and computes the sample standard deviation of `{r_i}`

#### Scenario: Lookback by period
- **WHEN** σ is requested for periods 5d, 30d, 90d, 365d
- **THEN** the lookback window calendar lengths are 1 year, 1 year, 2 years, and 3 years respectively

### Requirement: No Look-Ahead Bias
The system SHALL compute σ using only price rows whose date is strictly earlier than the post's `postedAt`.

#### Scenario: Strict bound on asOfDate
- **WHEN** σ is computed with `asOfDate = postedAt`
- **THEN** no price row with `date >= postedAt` is included in the return series

### Requirement: IPO Fallback to Same-Market Index
The system SHALL detect when a ticker has insufficient price history to cover the required lookback for the requested period, and SHALL fall back to the same-market index for σ computation. For `'TW'` markets the fallback index SHALL be the TWSE weighted index. For `'US'` and `'CRYPTO'` markets the fallback index SHALL be the S&P 500. No industry-level fallback SHALL be introduced.

#### Scenario: Insufficient ticker history
- **WHEN** the ticker has fewer price rows than the required lookback for the period
- **THEN** the system computes σ on the same-market index over the same lookback and returns it with `source: 'index-fallback'`

#### Scenario: Sufficient ticker history
- **WHEN** the ticker has full lookback coverage
- **THEN** the system computes σ on the ticker's own prices and returns it with `source: 'ticker'`

#### Scenario: Unsupported market
- **WHEN** σ is requested for a ticker whose `stocks.market` is `'HK'` (or any other unsupported market)
- **THEN** the system raises a typed `UnsupportedMarketError`

### Requirement: Deterministic σ Caching
The system SHALL cache `getVolatilityThreshold` results in-memory keyed by `(ticker, periodDays, asOfDate-YYYY-MM-DD)` for the lifetime of the service instance, so repeated calls for the same key in the same batch do not re-query the price provider or recompute σ.

#### Scenario: Cache hit avoids reprovider
- **WHEN** `getVolatilityThreshold` is called twice in the same service instance with the same `(ticker, periodDays, asOfDate)` (day-granularity)
- **THEN** the second call returns an identical result without invoking the price provider

### Requirement: WinRateStats Aggregation Contract
The system SHALL expose a `WinRateStats` aggregate with one bucket per period (`day5`, `day30`, `day90`, `day365`). Each bucket SHALL include `winCount`, `loseCount`, `noiseCount`, `excludedCount`, `total = winCount + loseCount + noiseCount`, `winRate = winCount / (winCount + loseCount)` (or `null` when the denominator is `0`), and a representative `threshold` for the bucket (`{ value, source }` or `null` when the bucket has no classifiable posts).

#### Scenario: Win rate excludes Noise from denominator
- **WHEN** a bucket contains 4 wins, 2 losses, 10 noise, and 1 excluded
- **THEN** `winRate` equals `4 / (4 + 2)` and `noiseCount` equals `10`

#### Scenario: Empty bucket
- **WHEN** a bucket has 0 wins and 0 losses
- **THEN** `winRate` is `null`

#### Scenario: Threshold representative carries source
- **WHEN** every post in a bucket used the index fallback
- **THEN** the bucket's `threshold.source` is `'index-fallback'`

### Requirement: Server-Side WinRate API Routes
The system SHALL expose `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate`, each returning a `WinRateStats` payload computed by the `WinRateService`. The existing `/return-rate` routes SHALL remain unchanged and continue to serve the average-return metric.

#### Scenario: KOL win-rate endpoint
- **WHEN** a client calls `GET /api/kols/{id}/win-rate`
- **THEN** the response is a `WinRateStats` JSON object with the four period buckets

#### Scenario: Stock win-rate endpoint
- **WHEN** a client calls `GET /api/stocks/{ticker}/win-rate`
- **THEN** the response is a `WinRateStats` JSON object with the four period buckets

#### Scenario: Return-rate routes untouched
- **WHEN** a client calls `GET /api/kols/{id}/return-rate` or `GET /api/stocks/{ticker}/return-rate`
- **THEN** the response shape and values match the pre-change behavior

## MODIFIED Requirements

### Requirement: KOL scorecard cache holds pre-aggregated performance metrics

The system SHALL persist a per-KOL aggregated scorecard row in `kol_scorecard_cache` containing, for each period in {5d, 30d, 90d, 365d}, the fields `winCount`, `loseCount`, `noiseCount`, `excludedCount`, `total`, `hitRate`, `precision`, `sqr`, `avgExcessWin`, `avgExcessLose`, `avgReturn`, `returnSampleSize`, `pendingCount`, `sufficientData`, `threshold`, **`directionalHitRate`, `directionalSampleSize`, and `histogram`**, plus a `bucketsByStock` map keyed by `stockId` whose values carry the same per-period structure including the three new fields. Each row is qualified by `classifier_version` and an application-level `cache_version`; rows whose `cache_version` is older than the current constant SHALL be treated as misses regardless of `stale` and `computed_at`.

#### Scenario: Read serves the cached blob unchanged when both versions match

- **WHEN** a warm row exists for `kolId` with the current `classifier_version`, the current `cache_version`, and `stale = FALSE`, and `computed_at` is within the TTL
- **THEN** the scorecard service SHALL return the blob verbatim, including the directional and histogram fields, without recomputing

#### Scenario: Stale cache_version forces a recompute

- **WHEN** a row exists with the current `classifier_version` but a `cache_version` lower than the current constant
- **THEN** the scorecard service SHALL treat it as a miss and enqueue `computeKolScorecard(kolId)`; the response SHALL be `{ status: 'computing', computedAt: null }`

#### Scenario: Mismatched classifier version is still treated as a miss

- **WHEN** the only row for `kolId` has a `classifier_version` lower than the current `CLASSIFIER_VERSION`
- **THEN** the scorecard service SHALL treat it as a miss and enqueue a recompute (existing behaviour retained)

#### Scenario: Per-stock buckets carry the new fields

- **WHEN** a warm row contains `bucketsByStock[stockId][period]`
- **THEN** that nested bucket SHALL include `directionalHitRate`, `directionalSampleSize`, and `histogram` populated from the same sample subset used for the per-stock `hitRate`

## ADDED Requirements

### Requirement: Cache version constant gates legacy blob shapes

The scorecard service SHALL maintain an application-level `SCORECARD_CACHE_VERSION` constant. Any persisted row with a `cache_version` lower than this constant SHALL be treated as a miss on read. The constant SHALL be incremented whenever the `WinRateBucket` blob shape gains required fields, even when `CLASSIFIER_VERSION` does not change. Newly-computed rows SHALL persist the current `cache_version`.

#### Scenario: Bumping cache_version causes existing rows to recompute on first read

- **WHEN** the deploy raises `SCORECARD_CACHE_VERSION` from N to N+1, and a user requests a KOL whose only cache row has `cache_version = N`
- **THEN** the response SHALL be `{ status: 'computing' }` and the recompute SHALL persist a new row at `cache_version = N+1`

#### Scenario: Subsequent reads after recompute serve the new shape

- **WHEN** the recompute from the previous scenario completes and a user re-requests the same KOL
- **THEN** the response SHALL be `{ status: 'ready', ...blob }` with the new fields (`directionalHitRate`, `directionalSampleSize`, `histogram`) populated for every period

#### Scenario: No DDL is required to bump cache_version

- **WHEN** `SCORECARD_CACHE_VERSION` is incremented in code and deployed
- **THEN** no migration on `kol_scorecard_cache` SHALL be required; the existing JSONB columns and `cache_version` integer column accommodate the new fields

### Requirement: Aggregation populates new fields without new I/O

`computeKolScorecard(kolId)` SHALL populate `directionalHitRate`, `directionalSampleSize`, and `histogram` on every period bucket and every per-stock-per-period bucket using only the sample rows already loaded for the existing fields. The function SHALL NOT issue additional reads to `post_win_rate_samples`, `volatility_thresholds`, or any candle / price source as a result of the new fields being computed.

#### Scenario: Recompute time is dominated by existing aggregation cost

- **WHEN** `computeKolScorecard(kolId)` runs after this change
- **THEN** the additional time attributable to the three new fields SHALL be proportional to the in-memory sample count and SHALL NOT trigger any new database round-trips

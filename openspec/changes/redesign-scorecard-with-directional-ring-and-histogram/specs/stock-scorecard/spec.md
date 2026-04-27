## MODIFIED Requirements

### Requirement: Stock scorecard cache holds pre-aggregated community performance metrics

The system SHALL persist a per-Stock aggregated scorecard row in `stock_scorecard_cache` containing, for each period in {5d, 30d, 90d, 365d}, the same fields as the KOL scorecard (`winCount`, `loseCount`, `noiseCount`, `excludedCount`, `total`, `hitRate`, `precision`, `sqr`, `avgExcessWin`, `avgExcessLose`, `avgReturn`, `returnSampleSize`, `pendingCount`, `sufficientData`, `threshold`, **`directionalHitRate`, `directionalSampleSize`, `histogram`**), plus a `bucketsByKol` map keyed by `kolId` whose values carry the same per-period structure including the three new fields. Each row is qualified by `classifier_version` and an application-level `cache_version` shared with the KOL scorecard.

#### Scenario: Read serves the cached blob unchanged when both versions match

- **WHEN** a warm row exists for `stockTicker` with the current `classifier_version`, the current `cache_version`, and `stale = FALSE`, and `computed_at` is within the TTL
- **THEN** the community accuracy endpoint SHALL return the blob verbatim, including the directional and histogram fields, without recomputing

#### Scenario: Stale cache_version forces a recompute

- **WHEN** a row exists with the current `classifier_version` but a `cache_version` lower than the current constant
- **THEN** the service SHALL treat it as a miss and enqueue `computeStockScorecard(stockId)`; the response SHALL be `{ status: 'computing', computedAt: null }`

#### Scenario: Per-KOL buckets carry the new fields

- **WHEN** a warm row contains `bucketsByKol[kolId][period]`
- **THEN** that nested bucket SHALL include `directionalHitRate`, `directionalSampleSize`, and `histogram` populated from the same sample subset used for the per-KOL `hitRate`

## ADDED Requirements

### Requirement: Stock scorecard shares cache_version with KOL scorecard

The `SCORECARD_CACHE_VERSION` constant SHALL apply to both `kol_scorecard_cache` and `stock_scorecard_cache`. A version bump SHALL invalidate both tables simultaneously, ensuring the two caches never disagree about which fields are present in the blob.

#### Scenario: One bump invalidates both caches

- **WHEN** `SCORECARD_CACHE_VERSION` is incremented from N to N+1 and deployed
- **THEN** every existing row in both `kol_scorecard_cache` and `stock_scorecard_cache` with `cache_version = N` SHALL be treated as a miss on next read

#### Scenario: Recompute paths populate the new fields on both caches

- **WHEN** `computeKolScorecard` and `computeStockScorecard` run after the bump
- **THEN** both SHALL persist new rows at `cache_version = N+1` with `directionalHitRate`, `directionalSampleSize`, and `histogram` populated on every period bucket and every nested per-stock or per-KOL bucket

## ADDED Requirements

### Requirement: Stock scorecard cache holds per-Stock community metrics

The system SHALL persist a per-Stock aggregated scorecard row in `stock_scorecard_cache` containing, for each period in {5d, 30d, 90d, 365d}, the same bucket shape as `kol_scorecard_cache` (`winCount`, `loseCount`, `noiseCount`, `hitRate`, `precision`, `sqr`, `avgExcessWin`, `avgExcessLose`, `avgReturn`, `returnSampleSize`, `pendingCount`, `sufficientData`, `threshold`), plus a `bucketsByKol` map keyed by `kolId`. Each row is qualified by `classifier_version`.

#### Scenario: Stock scorecard aggregates across all KOLs

- **WHEN** `computeStockScorecard(stockId)` runs for a stock covered by five different KOLs
- **THEN** the resulting `day30` bucket SHALL be derived from samples belonging to all five KOLs, and `bucketsByKol` SHALL contain one entry per KOL with at least one sample

#### Scenario: Mismatched classifier version is treated as a miss

- **WHEN** the only row for `stockId` has a `classifier_version` lower than the current `CLASSIFIER_VERSION`
- **THEN** the scorecard service SHALL treat it as a miss and enqueue a recompute

### Requirement: Stock scorecard invalidation is triggered by any post mentioning the stock

The scraper ingestion pipeline SHALL mark `stock_scorecard_cache.stale = TRUE` for every `stockId` referenced in a newly-created, updated, or deleted post, regardless of which KOL authored it.

#### Scenario: New post invalidates every mentioned stock

- **WHEN** `createPostAtomic` succeeds for a post that references stocks X, Y, Z
- **THEN** the pipeline SHALL set `stale = TRUE` on `stock_scorecard_cache[X]`, `[Y]`, and `[Z]` and enqueue recomputes for each

#### Scenario: Post from different KOL still invalidates the stock

- **WHEN** KOL B creates a post about Stock X (which KOL A has also covered)
- **THEN** `stock_scorecard_cache[X]` SHALL be marked stale, even though KOL A's `kol_scorecard_cache[A]` row SHALL remain unchanged

### Requirement: Stock scorecard read-through path mirrors KOL scorecard

`GET /api/stocks/[ticker]/scorecard` SHALL resolve `ticker` to `stockId`, read `stock_scorecard_cache[stockId]` with the current classifier version and `stale = FALSE`, and SHALL return either the cached blob with `status: 'ready'` or `{ status: 'computing', computedAt: null }` on miss. The miss path SHALL enqueue a background recompute.

#### Scenario: Cached stock returns immediately

- **WHEN** a warm row exists for the stock
- **THEN** the endpoint SHALL return the blob with `status: 'ready'` and a `computedAt` timestamp

#### Scenario: Cold stock enqueues recompute

- **WHEN** no row exists for the stock
- **THEN** the endpoint SHALL return `{ status: 'computing', computedAt: null }` and enqueue a background `computeStockScorecard(stockId)`

### Requirement: Stock scorecard TTL staleness matches KOL scorecard

Stock scorecard cache rows SHALL follow the same 12-hour TTL staleness rule as KOL scorecards: a row with `stale = FALSE` but `computed_at < NOW() - INTERVAL '12 hours'` SHALL be treated as a miss by the read path.

#### Scenario: Row older than 12 hours triggers recompute

- **WHEN** a `stock_scorecard_cache` row exists with `stale = FALSE` and `computed_at` more than 12 hours old
- **THEN** the next read SHALL return `{ status: 'computing' }` and enqueue `computeStockScorecard(stockId)`

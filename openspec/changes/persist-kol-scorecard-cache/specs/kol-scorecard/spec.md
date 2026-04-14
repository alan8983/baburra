## ADDED Requirements

### Requirement: KOL scorecard cache holds pre-aggregated performance metrics

The system SHALL persist a per-KOL aggregated scorecard row in `kol_scorecard_cache` containing, for each period in {5d, 30d, 90d, 365d}, the fields `winCount`, `loseCount`, `noiseCount`, `excludedCount`, `total`, `hitRate`, `precision`, `sqr`, `avgExcessWin`, `avgExcessLose`, `avgReturn`, `returnSampleSize`, `pendingCount`, `sufficientData`, and `threshold`, plus a `bucketsByStock` map keyed by `stockId` whose values carry the same per-period structure. Each row is qualified by `classifier_version`; rows with a non-current `classifier_version` SHALL NOT be served.

#### Scenario: Read serves the cached blob unchanged

- **WHEN** a warm row exists for `kolId` with the current `classifier_version` and `stale = FALSE`
- **THEN** the scorecard service SHALL return the blob verbatim without recomputing

#### Scenario: Stale flag marks the row as invalid

- **WHEN** a row exists with `stale = TRUE`
- **THEN** the scorecard service SHALL treat it as a miss and enqueue a recompute

#### Scenario: Mismatched classifier version is treated as a miss

- **WHEN** the only row for `kolId` has a `classifier_version` lower than the current `CLASSIFIER_VERSION`
- **THEN** the scorecard service SHALL treat it as a miss and enqueue a recompute

### Requirement: Scorecard invalidation is full-row on every related post event

The scraper ingestion pipeline SHALL mark `kol_scorecard_cache.stale = TRUE` for the post's KOL whenever a post is created, updated (including re-analysis), or deleted. A post about Stock X by a different KOL SHALL NOT mark KOL A's row as stale — KOL scorecard invalidation is scoped strictly to events whose `post.kol_id` equals the row's `kol_id`.

#### Scenario: New post triggers KOL invalidation

- **WHEN** `createPostAtomic` succeeds for a post with `kol_id = A`
- **THEN** the pipeline SHALL set `stale = TRUE` on `kol_scorecard_cache[A]` and enqueue a recompute

#### Scenario: Post by different KOL does not invalidate unrelated KOL

- **WHEN** a post about Stock X is inserted with `kol_id = B`
- **THEN** `kol_scorecard_cache[A]` SHALL remain unchanged even if A has posts about X

#### Scenario: Post deletion invalidates the originating KOL

- **WHEN** `deletePostPromoteMirror` removes a post with `kol_id = A`
- **THEN** the pipeline SHALL set `stale = TRUE` on `kol_scorecard_cache[A]` and enqueue a recompute

### Requirement: Miss path returns a computing status instead of blocking

When no eligible cache row exists for a requested KOL, the scorecard service SHALL return a response with `status: 'computing'` and `computedAt: null`, and SHALL enqueue a background recompute if one is not already in flight for that `kolId`. The service SHALL NOT block the request for the duration of the recompute.

#### Scenario: Cold KOL returns computing status

- **WHEN** a user requests the scorecard for a KOL with no cache row
- **THEN** the response SHALL be `{ status: 'computing', computedAt: null }` and a background recompute SHALL be enqueued

#### Scenario: Concurrent requests dedupe the compute

- **WHEN** two requests for the same cold KOL arrive within the same recompute window
- **THEN** both SHALL receive `{ status: 'computing' }` and only one background recompute SHALL be enqueued

### Requirement: TTL-based staleness guarantees eventual freshness without an external cron

The KOL scorecard read path SHALL treat any cache row whose `computed_at` is older than 12 hours as stale, even when the `stale` flag is `FALSE`. The next read crossing that boundary SHALL trigger a background recompute via the normal miss path.

#### Scenario: Row older than 12 hours is treated as a miss

- **WHEN** a cache row exists for `kolId` with `stale = FALSE` but `computed_at < NOW() - INTERVAL '12 hours'`
- **THEN** the scorecard service SHALL return `{ status: 'computing' }` and enqueue `computeKolScorecard(kolId)`

#### Scenario: Recently-computed row is served directly

- **WHEN** a cache row exists with `stale = FALSE` and `computed_at >= NOW() - INTERVAL '12 hours'`
- **THEN** the scorecard service SHALL return the cached blob without recomputing

### Requirement: Aggregation produces Return deterministically across devices

`avgReturn` for a period SHALL be computed as `mean(price_change × sign(sentiment))` over all samples with `outcome ∈ {win, lose, noise}`, `price_change_status = 'value'`, and `sentiment ≠ 0`. Samples with `price_change_status = 'pending'` SHALL be counted in `pendingCount` but excluded from the mean. Samples with `price_change_status = 'no_data'` SHALL be excluded entirely from both `avgReturn` and `pendingCount`.

#### Scenario: Return excludes pending samples but reports the count

- **WHEN** aggregating a 5d bucket with 18 samples where 3 have `price_change_status = 'pending'`
- **THEN** `avgReturn` SHALL be computed over the remaining 15 samples and `pendingCount` SHALL be 3

#### Scenario: Return is identical across repeated calls

- **WHEN** `computeKolScorecard(kolId)` is invoked twice without any intervening sample changes
- **THEN** both invocations SHALL produce the same `avgReturn` value for every period

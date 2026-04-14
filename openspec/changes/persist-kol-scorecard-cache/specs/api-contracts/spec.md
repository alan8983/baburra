## ADDED Requirements

### Requirement: Stock scorecard endpoint is exposed under /api/stocks

The system SHALL expose `GET /api/stocks/[ticker]/scorecard` returning the per-Stock aggregated scorecard blob from `stock_scorecard_cache`. The endpoint SHALL require the same authentication as other `/api/stocks/*` read endpoints.

#### Scenario: Warm stock returns aggregated metrics

- **WHEN** `GET /api/stocks/NVDA/scorecard` is requested for an active stock with a warm cache row
- **THEN** the response SHALL be `200 { status: 'ready', computedAt: ..., day5, day30, day90, day365, bucketsByKol }`

#### Scenario: Cold stock returns computing status

- **WHEN** `GET /api/stocks/NVDA/scorecard` is requested for a stock with no cache row
- **THEN** the response SHALL be `200 { status: 'computing', computedAt: null }` and a background recompute SHALL be enqueued

## MODIFIED Requirements

### Requirement: KOL win-rate endpoint reads from the aggregated cache

`GET /api/kols/[id]/win-rate` SHALL serve its response from `kol_scorecard_cache` rather than recomputing on each request. The response SHALL be a discriminated union: either `{ status: 'ready', computedAt, day5, day30, day90, day365, bucketsByStock }` when a warm row exists, or `{ status: 'computing', computedAt: null }` when no eligible cache row exists (triggering a background recompute). The endpoint SHALL NOT block the request while recomputing.

#### Scenario: Warm KOL returns ready blob

- **WHEN** `GET /api/kols/[id]/win-rate` is requested for a KOL with a warm cache row
- **THEN** the response SHALL be `200 { status: 'ready', computedAt, day5, day30, day90, day365, bucketsByStock }`

#### Scenario: Cold KOL returns computing status

- **WHEN** `GET /api/kols/[id]/win-rate` is requested for a KOL with no cache row
- **THEN** the response SHALL be `200 { status: 'computing', computedAt: null }` and a background recompute SHALL be enqueued without blocking the response

#### Scenario: Stale KOL is treated as a miss

- **WHEN** the row has `stale = TRUE` or a mismatched `classifier_version`
- **THEN** the response SHALL behave identically to the cold-KOL case

## REMOVED Requirements

### Requirement: Return-rate endpoint provides lifetime Return stats
**Reason**: Return is now aggregated into `kol_scorecard_cache` alongside Hit Rate and SQR and served via `/api/kols/[id]/win-rate`. The standalone `/api/kols/[id]/return-rate` endpoint was never wired to any client and is dead code.
**Migration**: Consumers (if any appear in the future) read `avgReturn` and `returnSampleSize` per period from the `/api/kols/[id]/win-rate` response.

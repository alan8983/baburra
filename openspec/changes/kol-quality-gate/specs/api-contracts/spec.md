## MODIFIED Requirements

### Requirement: KOL list endpoint filters by validation status
`GET /api/kols` SHALL accept an optional `validationStatus` query parameter. When omitted, the endpoint SHALL default to returning only KOLs with `validation_status = 'active'`. When provided, the endpoint SHALL filter by the specified status.

#### Scenario: Default list returns only active KOLs
- **WHEN** `GET /api/kols` is called without `validationStatus` parameter
- **THEN** only KOLs with `validation_status = 'active'` are returned

#### Scenario: Filtered list returns specified status
- **WHEN** `GET /api/kols?validationStatus=rejected` is called
- **THEN** only KOLs with `validation_status = 'rejected'` are returned

#### Scenario: All statuses can be requested
- **WHEN** `GET /api/kols?validationStatus=all` is called
- **THEN** KOLs of all validation statuses are returned

## ADDED Requirements

### Requirement: KOL validation status in detail response
`GET /api/kols/[id]` SHALL include `validationStatus`, `validationScore`, `validatedAt`, and `validatedBy` in the response for all KOLs regardless of status.

#### Scenario: Active KOL detail includes validation fields
- **WHEN** `GET /api/kols/[id]` is called for an active KOL
- **THEN** the response includes `validationStatus: 'active'` and the full validation score if available

#### Scenario: Rejected KOL detail includes failure reason
- **WHEN** `GET /api/kols/[id]` is called for a rejected KOL
- **THEN** the response includes `validationStatus: 'rejected'` and `validationScore` with `failedCriteria`

### Requirement: KOL validation override endpoint
`PATCH /api/kols/[id]` SHALL accept `validationStatus` in the request body to allow admin override of validation status.

#### Scenario: Admin overrides rejected to active
- **WHEN** `PATCH /api/kols/[id]` is called with `{ validationStatus: 'active' }`
- **THEN** the KOL's `validation_status` is updated to `active` and `validated_at` is updated

#### Scenario: Invalid status transition is rejected
- **WHEN** `PATCH /api/kols/[id]` is called with `{ validationStatus: 'pending' }` for an active KOL
- **THEN** the endpoint returns a 400 error (only `rejected` → `active` override is allowed)

### Requirement: Scrape profile triggers validation for new KOLs
`POST /api/scrape/profile` SHALL detect when the KOL being scraped is new (not yet in the pool) and create a `validation_scrape` job instead of an `initial_scrape` job. The KOL SHALL be created with `validation_status = 'pending'`.

#### Scenario: New KOL profile scrape creates validation job
- **WHEN** `POST /api/scrape/profile` is called for a KOL URL not yet in the system
- **THEN** a new KOL is created with `validation_status = 'pending'` and a `validation_scrape` job is queued

#### Scenario: Existing active KOL scrape creates normal job
- **WHEN** `POST /api/scrape/profile` is called for a KOL already in the system with `validation_status = 'active'`
- **THEN** a normal `initial_scrape` or `incremental_check` job is created (existing behavior)

### Requirement: Post-stock source in post responses
`GET /api/posts/[id]` and `GET /api/posts` SHALL include `source` and `inferenceReason` in each post's stock link data.

#### Scenario: Post detail includes stock source tracking
- **WHEN** `GET /api/posts/[id]` is called for a post with both explicit and inferred tickers
- **THEN** each stock in the response includes `source` ('explicit' or 'inferred') and `inferenceReason` (if inferred)

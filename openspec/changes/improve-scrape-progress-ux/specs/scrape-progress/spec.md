## ADDED Requirements

### Requirement: Per-URL state machine for scrape jobs
The system SHALL persist per-URL progress for every scrape job in a `scrape_job_items` table, one row per URL in the job. Each row SHALL carry a `stage` ∈ `{ queued, discovering, downloading, transcribing, analyzing, done, failed }`, along with `bytes_downloaded`, `bytes_total`, `duration_seconds`, `error_message`, `ordinal`, `started_at`, and `finished_at`.

#### Scenario: Job creation seeds one item per URL
- **WHEN** a new scrape job is created with 5 URLs
- **THEN** 5 rows SHALL exist in `scrape_job_items` for that `job_id`, each with `stage = 'queued'` and a unique `ordinal` in `0..4`

#### Scenario: Stage transitions persist mid-pipeline
- **WHEN** `processUrl` starts the download stage for a URL
- **THEN** the corresponding item row SHALL have `stage = 'downloading'` and `started_at` set to the current timestamp
- **AND** as audio bytes arrive, `bytes_downloaded` SHALL increase monotonically

#### Scenario: Failure writes an error message
- **WHEN** `processUrl` fails during transcription for a URL
- **THEN** the corresponding item row SHALL have `stage = 'failed'`, `error_message` populated with the failure reason, and `finished_at` set
- **AND** the parent `scrape_jobs.error_count` SHALL increment

### Requirement: Items endpoint for per-URL progress
The system SHALL expose `GET /api/scrape/jobs/[id]/items` returning an array of the job's items, ordered by `ordinal`. The endpoint SHALL enforce the same ownership rule as `GET /api/scrape/jobs/[id]`: only the user who triggered the job may read its items.

#### Scenario: Owner fetches items
- **WHEN** the authenticated user who triggered job `J` calls `GET /api/scrape/jobs/J/items`
- **THEN** the response SHALL be a JSON array of every item row for `J`, ordered by `ordinal` ascending

#### Scenario: Non-owner receives 403
- **WHEN** a different authenticated user calls the same endpoint for job `J`
- **THEN** the response SHALL be `403 Forbidden` and the response body SHALL NOT leak any item data

### Requirement: Realtime push for job and item changes
The frontend SHALL subscribe to Supabase Realtime `postgres_changes` events on both `scrape_jobs` (UPDATE filtered by the viewed `id`) and `scrape_job_items` (all events filtered by the viewed `job_id`). On each event it SHALL apply a patch to the local React Query cache so the UI reflects the new state within 1 second of the database write.

#### Scenario: Stage change arrives within 1 second
- **WHEN** the server writes `stage = 'transcribing'` for item `I` belonging to job `J`
- **AND** a client is subscribed to job `J`'s Realtime channel
- **THEN** the client SHALL receive the change event and update the rendered stage for `I` within 1 second

#### Scenario: Polling fallback when channel drops
- **WHEN** the Realtime channel is disconnected for more than 10 seconds while the job is active
- **THEN** the client SHALL fetch `GET /api/scrape/jobs/[id]/items` as a fallback to recover state

### Requirement: Per-URL progress rendering
The `ScrapeProgress` component SHALL render a list of URL rows for any job that has `scrape_job_items`. Each row SHALL display the URL's title (or URL fallback), a stage label, and a progress bar. For items in the `downloading` stage, the bar SHALL display `bytes_downloaded / bytes_total` when `bytes_total` is known; otherwise it SHALL show an indeterminate pulse. For other stages, the bar SHALL reflect stage-based completion (0%, 25%, 50%, 75%, 100%).

#### Scenario: Download progress is visible
- **WHEN** a URL is in the `downloading` stage with `bytes_downloaded = 2_000_000` and `bytes_total = 8_000_000`
- **THEN** the corresponding row's progress bar SHALL render at 25% fill

#### Scenario: Legacy jobs without items still render
- **WHEN** a historical scrape job has no `scrape_job_items` rows
- **THEN** `ScrapeProgress` SHALL fall back to the legacy `processedUrls / totalUrls` progress bar without errors

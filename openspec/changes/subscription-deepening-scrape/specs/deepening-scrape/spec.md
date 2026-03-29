## ADDED Requirements

### Requirement: Subscription triggers deepening scrape
When a `kol_subscription` record is created, the system SHALL check if the associated `kol_source` is below its platform scrape cap and, if so, create a `deepening_scrape` job to fetch older historical posts.

#### Scenario: Source below platform cap with no active jobs
- **WHEN** a user subscribes to a kol_source with `posts_scraped_count` below the platform cap AND no active (queued/processing) `initial_scrape` or `deepening_scrape` job exists for that source
- **THEN** the system SHALL create a `scrape_jobs` record with `job_type = 'deepening_scrape'`, `triggered_by = NULL`, and `status = 'queued'`

#### Scenario: Source at or above platform cap
- **WHEN** a user subscribes to a kol_source with `posts_scraped_count >= SCRAPE_CAPS[platform]`
- **THEN** the system SHALL skip deepening silently (no error, no job created)

#### Scenario: Active scrape job already exists
- **WHEN** a user subscribes to a kol_source that has an active (queued or processing) `initial_scrape` or `deepening_scrape` job
- **THEN** the system SHALL skip deepening silently to prevent duplicate work

#### Scenario: Subscription API response is not delayed
- **WHEN** a deepening scrape is triggered
- **THEN** the subscription API SHALL respond immediately; the deepening job runs asynchronously via the job queue

### Requirement: Platform upper limits on scraped posts
The system SHALL enforce per-platform maximum post limits for each kol_source. The limits are: youtube=200, twitter=500, instagram=500, facebook=500. The default for unknown platforms SHALL be 200.

#### Scenario: Deepening respects remaining capacity
- **WHEN** a deepening scrape discovers N older URLs but `SCRAPE_CAPS[platform] - posts_scraped_count < N`
- **THEN** the system SHALL only process `SCRAPE_CAPS[platform] - posts_scraped_count` URLs

#### Scenario: Job completes immediately when at limit
- **WHEN** a deepening scrape job begins processing but the source has reached its platform cap
- **THEN** the system SHALL mark the job as completed with a note indicating the cap was reached, without processing any URLs

### Requirement: Deepening scrape fetches older content
A `deepening_scrape` job SHALL discover and process posts OLDER than the currently oldest scraped post for the kol_source, using the `oldest_scraped_at` cursor or a fallback query.

#### Scenario: YouTube deepening with existing posts
- **WHEN** a YouTube deepening scrape executes for a kol_source with existing posts
- **THEN** the system SHALL call the YouTube Data API v3 Search endpoint with `publishedBefore` set to the oldest scraped post date, `order=date`, and `maxResults=DEEPENING_BATCH_SIZE` (10)

#### Scenario: Deepening with no existing posts (fallback)
- **WHEN** a deepening scrape executes for a kol_source with no existing posts and no `oldest_scraped_at` value
- **THEN** the system SHALL use the current timestamp as the `publishedBefore` cursor

#### Scenario: Oldest scraped at cursor is updated after processing
- **WHEN** a deepening scrape batch completes and the oldest post in the batch has a `posted_at` earlier than the current `oldest_scraped_at`
- **THEN** the system SHALL update `kol_sources.oldest_scraped_at` to the new oldest date

### Requirement: Deepening scrape is quota-exempt
Deepening scrape jobs SHALL be processed as system cost and MUST NOT consume the subscribing user's AI analysis credits or daily scrape quota.

#### Scenario: Job created with no user attribution
- **WHEN** a deepening scrape job is created
- **THEN** the `triggered_by` field SHALL be NULL, indicating system-initiated work

#### Scenario: Credits not deducted during processing
- **WHEN** posts from a deepening scrape are processed through the AI analysis pipeline
- **THEN** no user's `ai_credits_used` counter SHALL be incremented

### Requirement: Deepening scrape job type in scrape_jobs
The `scrape_jobs` table SHALL support `'deepening_scrape'` as a valid `job_type` value alongside `'initial_scrape'` and `'incremental_check'`.

#### Scenario: Database accepts deepening_scrape job type
- **WHEN** a scrape_jobs row is inserted with `job_type = 'deepening_scrape'`
- **THEN** the insert SHALL succeed without constraint violation

### Requirement: Oldest scraped at tracking on kol_sources
The `kol_sources` table SHALL have an `oldest_scraped_at` column (TIMESTAMPTZ, nullable) that caches the oldest `posted_at` date among scraped posts for that source.

#### Scenario: Column is NULL for sources without scraped posts
- **WHEN** a kol_source has no scraped posts
- **THEN** `oldest_scraped_at` SHALL be NULL

#### Scenario: Column is updated after any scrape imports posts
- **WHEN** a scrape (initial, incremental, or deepening) imports posts with a `posted_at` earlier than the current `oldest_scraped_at`
- **THEN** the system SHALL update `oldest_scraped_at` to the new minimum date

### Requirement: posts_scraped_count accuracy
The system SHALL verify `posts_scraped_count` accuracy on each deepening trigger by reconciling against the actual post count in the database.

#### Scenario: Count matches reality
- **WHEN** a deepening trigger checks `posts_scraped_count` and it matches `SELECT COUNT(*) FROM posts WHERE kol_id = kol_source.kol_id`
- **THEN** the system SHALL proceed with the cached count

#### Scenario: Count has drifted
- **WHEN** a deepening trigger detects that `posts_scraped_count` differs from the actual post count
- **THEN** the system SHALL correct `posts_scraped_count` to the actual count before evaluating the platform cap

### Requirement: Process-jobs routes deepening scrape jobs
The `process-jobs` cron handler SHALL route `deepening_scrape` jobs to the deepening executor, separate from `initial_scrape` and `incremental_check` handlers.

#### Scenario: Deepening job picked up by cron
- **WHEN** the process-jobs handler picks up a queued job with `job_type = 'deepening_scrape'`
- **THEN** the system SHALL call `executeDeepeningScrape()` (not `processJobBatch()` for initial scrapes)

#### Scenario: Deepening job updates posts_scraped_count
- **WHEN** a deepening scrape successfully imports N posts
- **THEN** the system SHALL increment `posts_scraped_count` by N (counting only successfully imported posts, not duplicates or errors)

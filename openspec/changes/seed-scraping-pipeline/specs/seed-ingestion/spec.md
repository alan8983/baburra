## ADDED Requirements

### Requirement: Seed Config File

The system SHALL provide a version-controlled `scripts/seed-kol-config.json` file that lists the seed KOLs with `{ platform, identifier, displayName, maxPosts, priority }` for each entry, covering the 19 KOLs from `baburra-seed-kol-candidates.md`.

#### Scenario: Config file drives script execution
- **WHEN** the operator runs `npm run seed:scrape`
- **THEN** the script reads `scripts/seed-kol-config.json` and iterates KOLs in `priority` order (ascending)
- **AND** each entry's `platform`, `identifier`, and `maxPosts` are used to drive discovery and URL slicing

#### Scenario: Invalid config rejects at startup
- **WHEN** the config file is missing, invalid JSON, or an entry has an unrecognized `platform` value
- **THEN** the script exits with a non-zero code and prints a clear error identifying the offending entry
- **AND** no DB writes are attempted

### Requirement: Platform System User

The system SHALL provision a single "platform" auth user whose UUID is used as the owner for all seed-sourced KOLs, kol_sources, scrape_jobs, and posts.

#### Scenario: Idempotent platform user creation
- **WHEN** the migration runs
- **THEN** a user row with email `platform@baburra.com` is inserted into `auth.users` if absent
- **AND** re-running the migration is a no-op (no duplicate user, no error)

#### Scenario: Seed script uses platform user UUID
- **WHEN** the script calls the profile-scrape service
- **THEN** it passes the platform user UUID as `ownerUserId`
- **AND** resulting `kols`, `kol_sources`, and `posts` rows are written with that UUID as their owner

### Requirement: Source Column on KOL Sources and Posts

The system SHALL add a nullable `source TEXT` column (with CHECK constraint `source IN ('seed','user') OR source IS NULL`) to `kol_sources` and `posts`, defaulting to `'user'` for new rows.

#### Scenario: Existing rows unchanged
- **WHEN** the migration applies
- **THEN** no existing rows are updated, and all existing rows have NULL or `'user'` in `source`
- **AND** query-layer code that does not filter on `source` continues to return the same results

#### Scenario: Seed script writes source='seed'
- **WHEN** the script inserts a kol_source or a post
- **THEN** the row has `source = 'seed'`

### Requirement: Scrape Service Overrides

The `profile-scrape.service` SHALL accept an optional `ScrapeOverrides` object — `ownerUserId`, `source`, and `quotaExempt` — that override the default values when provided, and fall back to the current behavior otherwise. Historical depth is controlled via the existing `selectedUrls` parameter.

#### Scenario: Override passed through to pipeline
- **WHEN** the seed script calls `initiateProfileScrape(url, userId, selectedUrls, { ownerUserId: PLATFORM_UUID, source: 'seed', quotaExempt: true })`
- **THEN** the job processes only the `selectedUrls` (sliced to `maxPosts` from config)
- **AND** the resulting KOL, kol_source, and post rows are owned by `PLATFORM_UUID` with `source='seed'`
- **AND** no credit charges are applied

#### Scenario: API routes unaffected
- **WHEN** any existing API route calls the service without the new overrides
- **THEN** the service behaves exactly as before — request-context userId, `source` defaulted to `'user'` or NULL, credits charged normally

### Requirement: Async Job Model Integration

The seed script SHALL drive the existing async job model rather than calling `processUrl()` directly, reusing all existing concurrency, progress tracking, and error handling.

#### Scenario: Script creates and processes scrape jobs
- **WHEN** the script processes a KOL
- **THEN** it calls `initiateProfileScrape()` to create a `scrape_job` and `scrape_job_items`
- **AND** it loops `processJobBatch(jobId)` until the job status reaches `'completed'` or `'failed'`
- **AND** per-URL progress is tracked via `scrape_job_items` stages

#### Scenario: YouTube concurrency managed by service
- **WHEN** YouTube URLs are processed within a batch
- **THEN** the service's built-in semaphore (default 3 concurrent) manages parallelism
- **AND** the seed script does not implement its own concurrency control

### Requirement: Idempotent Re-runs

The seed script SHALL skip work that has already been completed so re-running after a crash only processes the unfinished portion.

#### Scenario: KOL already seeded
- **WHEN** the script processes a KOL whose `kol_sources.(platform, platform_id)` already exists with `source='seed'`
- **THEN** the KOL is skipped entirely
- **AND** the script proceeds to the next KOL in the config

#### Scenario: Post already seeded
- **WHEN** the pipeline encounters a URL that matches an existing `posts.source_url`
- **THEN** the URL is skipped by the existing `findPostBySourceUrl` duplicate detection
- **AND** counted in the scrape job's `duplicateCount`

### Requirement: Quality Gate Preserved for Seed Data

The seed script SHALL run every post through the existing content filter, AI sentiment extraction, and quality gate with the same thresholds as production, with no bypass or relaxation.

#### Scenario: Failing quality gate drops the post
- **WHEN** an extracted post scores below the Coverage, Directionality, or Analytical-depth thresholds
- **THEN** the post is not written to `posts` or `post_arguments`
- **AND** the failure is counted in the scrape job's `filteredCount`

### Requirement: Per-Post Error Isolation

The seed script SHALL leverage the existing per-URL error handling in `processJobBatch()` (which wraps each URL in try/catch) and additionally emit a structured error log for post-mortem analysis.

#### Scenario: Broken URL is logged and skipped
- **WHEN** extraction or AI analysis throws for a single URL
- **THEN** the `scrape_job_items` row for that URL transitions to `stage='failed'` with an `errorMessage`
- **AND** after each batch, the script reads failed items and appends `{ kol, url, phase, error, timestamp }` to `scripts/logs/seed-errors-<timestamp>.jsonl`
- **AND** the scrape job's `errorCount` is incremented

#### Scenario: High error rate warning
- **WHEN** the error rate for a single KOL exceeds 50% of processed URLs
- **THEN** the script prints a warning line to stdout naming the KOL and the current error rate

### Requirement: Summary Report

The seed script SHALL emit a per-KOL summary and an overall summary to stdout on completion, reading from scrape job counters.

#### Scenario: Per-KOL summary line
- **WHEN** a KOL finishes processing (scrape job completed)
- **THEN** a single line is printed with `{ displayName, totalUrls, importedCount, duplicateCount, filteredCount, errorCount, tickersFound }`

#### Scenario: Final summary block
- **WHEN** the script exits successfully
- **THEN** a final block lists total KOLs seeded, total posts imported, total errors, and the list of tickers covered by ≥3 KOLs

### Requirement: Success Criteria

A successful seed run SHALL meet all of the following: ≥17 of 19 KOLs seeded, ≥600 posts passed the quality gate and landed in `posts`, quality-gate pass rate ≥55%, and ≥5 tickers with ≥3 covering KOLs.

#### Scenario: Success criteria verification
- **WHEN** the operator compares the final summary to the success criteria
- **THEN** a run that meets all four thresholds is treated as complete
- **AND** a run that misses any threshold triggers follow-up investigation before launch

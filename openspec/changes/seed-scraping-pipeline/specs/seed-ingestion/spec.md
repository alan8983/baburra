## ADDED Requirements

### Requirement: Seed Config File

The system SHALL provide a version-controlled `scripts/seed-kol-config.json` file that lists the seed KOLs with `{ platform, identifier, displayName, maxPosts, priority }` for each entry, covering the 19 KOLs from `baburra-seed-kol-candidates.md`.

#### Scenario: Config file drives script execution
- **WHEN** the operator runs `npm run seed:scrape`
- **THEN** the script reads `scripts/seed-kol-config.json` and iterates KOLs in `priority` order (ascending)
- **AND** each entry's `platform`, `identifier`, and `maxPosts` are used verbatim for the extractor call

#### Scenario: Invalid config rejects at startup
- **WHEN** the config file is missing, invalid JSON, or an entry has an unrecognized `platform` value
- **THEN** the script exits with a non-zero code and prints a clear error identifying the offending entry
- **AND** no DB writes are attempted

### Requirement: Platform System User

The system SHALL provision a single "platform" auth user whose UUID is used as the owner for all seed-sourced KOLs, profile scrapes, and posts.

#### Scenario: Idempotent platform user creation
- **WHEN** the migration runs
- **THEN** a user row with email `platform@baburra.com` is inserted into `auth.users` if absent
- **AND** re-running the migration is a no-op (no duplicate user, no error)

#### Scenario: Seed script uses platform user UUID
- **WHEN** the script calls the profile-scrape service
- **THEN** it passes the platform user UUID as `ownerUserId`
- **AND** resulting `kols`, `profile_scrapes`, and `posts` rows are written with that UUID as their owner

### Requirement: Source Column on Profile Scrapes and Posts

The system SHALL add a nullable `source TEXT` column (with CHECK constraint `source IN ('seed','user') OR source IS NULL`) to `profile_scrapes` and `posts`, defaulting to `'user'` for new rows.

#### Scenario: Existing rows unchanged
- **WHEN** the migration applies
- **THEN** no existing rows are updated, and all existing rows have NULL or `'user'` in `source`
- **AND** query-layer code that does not filter on `source` continues to return the same results

#### Scenario: Seed script writes source='seed'
- **WHEN** the script inserts a profile_scrape or a post
- **THEN** the row has `source = 'seed'`

### Requirement: Scrape Service Overrides

The `profile-scrape.service` SHALL accept three optional parameters — `maxPosts`, `ownerUserId`, and `source` — that override the default values when provided, and fall back to the current behavior otherwise.

#### Scenario: Override passed through to extractor
- **WHEN** the seed script calls `initiateScrape(..., { maxPosts: 50, ownerUserId: PLATFORM_UUID, source: 'seed' })`
- **THEN** the discovery phase fetches up to 50 URLs
- **AND** the resulting KOL, profile_scrape, and post rows are owned by `PLATFORM_UUID` with `source='seed'`

#### Scenario: API routes unaffected
- **WHEN** any existing API route calls the service without the new overrides
- **THEN** the service behaves exactly as before — default maxPosts, request-context userId, `source` defaulted to `'user'` or NULL

### Requirement: Idempotent Re-runs

The seed script SHALL skip work that has already been completed so re-running after a crash only processes the unfinished portion.

#### Scenario: KOL already seeded
- **WHEN** the script processes a KOL whose `(platform, platform_id)` already exists in the DB with `source='seed'`
- **THEN** the KOL row is not recreated
- **AND** the script reuses the existing KOL ID for subsequent post inserts

#### Scenario: Post already seeded
- **WHEN** the script encounters a URL that matches an existing `posts.source_url`
- **THEN** the URL is skipped silently and counted in the per-KOL `duplicateCount`
- **AND** no duplicate row is created

### Requirement: Quality Gate Preserved for Seed Data

The seed script SHALL run every post through the existing content filter, AI sentiment extraction, and quality gate with the same thresholds as production, with no bypass or relaxation.

#### Scenario: Failing quality gate drops the post
- **WHEN** an extracted post scores below the Coverage, Directionality, or Analytical-depth thresholds
- **THEN** the post is not written to `posts` or `arguments`
- **AND** the failure is counted in `filteredCount` for that KOL

### Requirement: Per-Post Error Isolation

The seed script SHALL wrap per-post processing in a try/catch such that one failure does not abort the batch, and SHALL emit a structured error log.

#### Scenario: Broken URL is logged and skipped
- **WHEN** extraction or AI analysis throws for a single URL
- **THEN** an entry `{ kol, url, phase, error, timestamp }` is appended to `scripts/logs/seed-errors-<timestamp>.jsonl`
- **AND** the script proceeds to the next URL
- **AND** the KOL's `errorCount` is incremented

#### Scenario: High error rate warning
- **WHEN** the error rate for a single KOL exceeds 50% of processed URLs
- **THEN** the script prints a warning line to stdout naming the KOL and the current error rate

### Requirement: Summary Report

The seed script SHALL emit a per-KOL summary and an overall summary to stdout on completion.

#### Scenario: Per-KOL summary line
- **WHEN** a KOL finishes processing
- **THEN** a single line is printed with `{ displayName, totalDiscovered, imported, duplicates, filtered, errors, tickersFound }`

#### Scenario: Final summary block
- **WHEN** the script exits successfully
- **THEN** a final block lists total KOLs seeded, total posts imported, total errors, and the list of tickers covered by ≥3 KOLs

### Requirement: Success Criteria

A successful seed run SHALL meet all of the following: ≥17 of 19 KOLs seeded, ≥600 posts passed the quality gate and landed in `posts`, quality-gate pass rate ≥55%, and ≥5 tickers with ≥3 covering KOLs.

#### Scenario: Success criteria verification
- **WHEN** the operator compares the final summary to the success criteria
- **THEN** a run that meets all four thresholds is treated as complete
- **AND** a run that misses any threshold triggers follow-up investigation before launch

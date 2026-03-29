## ADDED Requirements

### Requirement: Monitor-subscriptions cron checks eligible sources with backpressure
The `GET /api/cron/monitor-subscriptions` endpoint SHALL process at most `MONITORING_BATCH_LIMIT` (20) kol_sources per invocation, ordered by `next_check_at` ascending, with a 50-second timeout safeguard.

#### Scenario: Fewer eligible sources than batch limit
- **WHEN** the cron fires and 5 sources have `monitoring_enabled = true AND next_check_at <= NOW()`
- **THEN** the system SHALL check all 5 sources and return `{ checked: 5, newJobsCreated: N }`

#### Scenario: More eligible sources than batch limit
- **WHEN** 30 sources are eligible but `MONITORING_BATCH_LIMIT = 20`
- **THEN** the system SHALL process the 20 oldest (by `next_check_at`) and leave 10 for the next cycle

#### Scenario: Timeout during processing
- **WHEN** 50 seconds elapse before all eligible sources are checked
- **THEN** the system SHALL stop processing additional sources and return results for those already completed

### Requirement: Per-source failure isolation
The monitoring cron SHALL handle individual source failures without blocking remaining sources.

#### Scenario: One source fails, others succeed
- **WHEN** source A throws an error during `checkForNewContent()` and sources B and C are also eligible
- **THEN** the system SHALL log the error for source A, continue processing B and C, and include the failure count in the response

### Requirement: YouTube incremental discovery uses publishedAfter
The `YouTubeChannelExtractor` SHALL provide a `discoverNewerVideos(channelId, publishedAfter, maxResults)` method that queries the YouTube Data API v3 Search endpoint with the `publishedAfter` parameter.

#### Scenario: New videos exist since last check
- **WHEN** `discoverNewerVideos()` is called with `publishedAfter = '2026-03-25T00:00:00Z'` and 3 videos were published after that date
- **THEN** the method SHALL return 3 `DiscoveredUrl` objects with title, publishedAt, and contentType

#### Scenario: No new videos since last check
- **WHEN** `discoverNewerVideos()` is called and no videos were published after the given date
- **THEN** the method SHALL return an empty array

### Requirement: checkForNewContent uses publishedAfter discovery
The `checkForNewContent()` function SHALL use platform-specific `publishedAfter` discovery instead of full profile extraction when the platform supports it (YouTube).

#### Scenario: YouTube source with last_scraped_at
- **WHEN** `checkForNewContent()` runs for a YouTube source with `last_scraped_at = '2026-03-25T00:00:00Z'`
- **THEN** the system SHALL call `discoverNewerVideos()` with `publishedAfter = last_scraped_at` instead of `extractProfile()`

#### Scenario: Source with no last_scraped_at (fallback)
- **WHEN** `checkForNewContent()` runs for a source with `last_scraped_at = null`
- **THEN** the system SHALL fall back to full profile extraction via `extractProfile()`

### Requirement: Platform cap enforcement during monitoring
The monitoring loop SHALL enforce `SCRAPE_CAPS` limits and auto-disable monitoring for sources at capacity.

#### Scenario: Source at platform cap
- **WHEN** a kol_source has `posts_scraped_count >= SCRAPE_CAPS[platform]` during a monitoring check
- **THEN** the system SHALL call `disableMonitoring()` for that source and log a warning

#### Scenario: Source below cap with new content
- **WHEN** new URLs are discovered but importing all would exceed the cap
- **THEN** the system SHALL only import URLs up to the remaining capacity (`SCRAPE_CAPS[platform] - posts_scraped_count`)

### Requirement: Staggered initial monitoring schedule
When monitoring is first enabled for a kol_source, `next_check_at` SHALL be set to `NOW() + random(0, monitor_frequency_hours)` to distribute load across the monitoring window.

#### Scenario: First subscriber enables monitoring
- **WHEN** monitoring is enabled with `monitor_frequency_hours = 24`
- **THEN** `next_check_at` SHALL be set to a random time between NOW and NOW + 24 hours

#### Scenario: Subsequent checks after initial stagger
- **WHEN** a monitoring check completes
- **THEN** `next_check_at` SHALL be set to `NOW() + monitor_frequency_hours` (no randomisation)

### Requirement: Incremental jobs are quota-exempt
Incremental check jobs created by the monitoring cron SHALL be system cost and MUST NOT consume any user's credits.

#### Scenario: Job created with null triggered_by
- **WHEN** `checkForNewContent()` creates an `incremental_check` job
- **THEN** `triggered_by` SHALL be NULL

#### Scenario: AI analysis during incremental processing
- **WHEN** posts from an incremental_check job are processed through the AI pipeline
- **THEN** no user's `ai_credits_used` counter SHALL be incremented

### Requirement: Monitoring cron updates next_check_at after each source
After checking a source (whether new content is found or not), the system SHALL update `next_check_at` to `NOW() + monitor_frequency_hours`.

#### Scenario: Source checked with new content
- **WHEN** `checkForNewContent()` finds and creates a job for 3 new URLs
- **THEN** `next_check_at` SHALL be updated to `NOW() + monitor_frequency_hours` and `last_scraped_at` to NOW

#### Scenario: Source checked with no new content
- **WHEN** `checkForNewContent()` finds 0 new URLs
- **THEN** `next_check_at` SHALL still be updated to prevent re-checking on the next cron cycle

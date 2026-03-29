## Context

Baburra uses a shared data model where all users benefit from scraped KOL posts. Currently, the subscription route has a stub `triggerHistoricalExpansion()` that creates an empty `incremental_check` job — it doesn't actually fetch older content. The YouTube channel extractor only discovers the most recent 50 videos (newest first). There is no mechanism to page backwards through a KOL's content history.

The `SCRAPE_CAPS` constants already exist in `config.ts` with the correct per-platform limits. The `kol_sources` table tracks `posts_scraped_count` but lacks a cursor for "oldest already scraped" content.

## Goals / Non-Goals

**Goals:**
- Automatically deepen a KOL's scraped history by 10 posts each time any user subscribes
- Enforce per-platform upper limits to prevent unbounded growth
- Make deepening quota-exempt (system cost, not charged to the subscribing user)
- Prevent duplicate work via race condition checks (skip if active job exists)
- Support YouTube deepening immediately; design for future platform extensibility

**Non-Goals:**
- Twitter/Instagram/Facebook deepening (extractors not yet built)
- User-facing UI for deepening progress
- Cron-based automatic scheduling (uses existing manual/cron trigger)
- Re-deepening optimisation on re-subscribe (allowed but not special-cased)

## Decisions

### D1: New `deepening_scrape` job type vs reusing `incremental_check`

**Decision**: Add `deepening_scrape` as a new job type.

**Rationale**: `incremental_check` semantically means "check for NEW content since last scrape" while deepening fetches OLDER content. Separate types enable:
- Different routing in `process-jobs` cron handler
- Quota-exempt processing (deepening is system cost; incremental may be user-triggered)
- Clearer audit trail in the `scrape_jobs` table

**Alternative**: Reuse `incremental_check` with a metadata flag. Rejected because it conflates two semantically different operations and complicates job routing.

### D2: `oldest_scraped_at` cached cursor vs query-time `MIN(posted_at)`

**Decision**: Add `oldest_scraped_at` column to `kol_sources`, updated after each scrape batch.

**Rationale**: A `SELECT MIN(posted_at) FROM posts WHERE kol_id = ?` query would work but is expensive for KOLs with hundreds of posts. The cached column makes deepening triggers O(1) instead of O(n). It's updated atomically when posts are imported.

**Fallback**: If `oldest_scraped_at` is NULL (never set), fall back to querying `MIN(posted_at)` from posts. This handles existing data without a backfill migration.

### D3: YouTube `publishedBefore` API parameter for backward pagination

**Decision**: Use the YouTube Data API v3 Search endpoint's native `publishedBefore` parameter.

**Rationale**: The API supports this natively — no pagination hacking or cursor management needed. Pass the `oldest_scraped_at` timestamp and request `order=date` with `maxResults=DEEPENING_BATCH_SIZE`. This returns the next batch of older videos in a single API call (~100 quota units).

### D4: Quota-exempt processing via `triggered_by = NULL`

**Decision**: Deepening jobs are created with `triggered_by = NULL` to indicate system-initiated work. The batch processing pipeline checks this field — NULL means quota-exempt.

**Rationale**: Simpler than adding a `quota_exempt` boolean column. The semantic is clear: NULL triggered_by = system job = no user quota impact. Existing code already handles NULL triggered_by gracefully.

### D5: Race condition prevention strategy

**Decision**: Before creating a deepening job, query `scrape_jobs` for any active (queued/processing) job of type `initial_scrape` or `deepening_scrape` for the same `kol_source_id`. If found, skip silently.

**Rationale**: An ongoing initial scrape will cover the same content. An ongoing deepening job means another subscription already triggered one. Both cases make a new job redundant. This is a simple SELECT check — no locking needed since the worst case (two concurrent deepenings) just results in some duplicate detection, not data corruption.

### D6: Keep `SCRAPE_CAPS` in `config.ts`, add `DEEPENING_BATCH_SIZE` there

**Decision**: Add `DEEPENING_BATCH_SIZE = 10` to the existing `config.ts` alongside `SCRAPE_CAPS`, rather than creating a new `scrape-limits.ts` file.

**Rationale**: The constants are closely related and the file is small. A separate file adds indirection without meaningful organizational benefit.

## Risks / Trade-offs

**[YouTube API quota consumption]** → Each deepening trigger costs ~100 API quota units (search endpoint). Mitigation: platform caps prevent unbounded growth; race condition check prevents duplicate jobs; batch size of 10 is conservative.

**[`oldest_scraped_at` drift]** → If posts are deleted but the column isn't updated, the cursor may point to a deleted post's date, causing a gap. Mitigation: the `posts_scraped_count` reconciliation catches this — if count is lower than expected, the cursor is still valid (it just means we have room to scrape more).

**[Deepening job processing delay]** → On Vercel Hobby plan, cron runs every 5 minutes and processes 1 job per invocation. A deepening job may wait behind other queued jobs. Mitigation: acceptable — deepening is not time-critical, and the data appears silently once processed.

**[No backfill of `oldest_scraped_at` for existing data]** → Existing kol_sources will have NULL `oldest_scraped_at`. Mitigation: the deepening function falls back to querying `MIN(posted_at)` from posts when the cached column is NULL, then updates it for future use.

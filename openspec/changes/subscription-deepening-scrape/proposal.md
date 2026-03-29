## Why

Baburra's core moat is compounding historical data. In the shared data model, every user benefits from every other user's KOL subscriptions. Currently, the shared pool only grows when users manually initiate full scrapes. A deepening mechanism makes growth automatic and proportional to user interest — popular KOLs naturally accumulate the deepest history through organic subscriptions, creating a positive network effect and improving backtesting accuracy for everyone.

A stub `triggerHistoricalExpansion()` already exists in the subscription route but creates an empty `incremental_check` job that doesn't actually fetch older content. This change replaces that stub with a proper deepening scrape pipeline that discovers and processes older posts using platform-specific cursor-based fetching.

## What Changes

- **New `deepening_scrape` job type** added to `scrape_jobs` — distinct from `initial_scrape` and `incremental_check` to enable separate routing and quota-exempt processing
- **`discoverOlderVideos()` method** on `YouTubeChannelExtractor` — uses YouTube Data API v3 `publishedBefore` parameter to discover videos older than the current oldest scraped post
- **`executeDeepeningScrape()` function** in `profile-scrape.service.ts` — orchestrates the deepening pipeline: limit check → find oldest post → discover older URLs → process batch → update counts
- **`oldest_scraped_at` column** on `kol_sources` — cached cursor to avoid expensive `MIN(posted_at)` queries on every deepening trigger
- **Replace `triggerHistoricalExpansion()` stub** in subscription route with proper deepening trigger including race condition prevention (skip if active deepening/initial job exists)
- **`posts_scraped_count` reconciliation** — verify count accuracy on deepening trigger to prevent drift from edge cases
- **Extend `process-jobs` cron handler** to route `deepening_scrape` jobs to the new executor
- **Move scrape limit constants** to dedicated `src/lib/constants/scrape-limits.ts` with `DEEPENING_BATCH_SIZE = 10`

## Capabilities

### New Capabilities
- `deepening-scrape`: Subscription-triggered background scrape of older historical posts, with platform upper limits, quota-exempt processing, and race condition prevention

### Modified Capabilities
- (none — existing scrape and subscription APIs retain their current behavior; deepening adds a new code path without changing existing contracts)

## Impact

- **Database**: New migration adding `oldest_scraped_at` column to `kol_sources` and `deepening_scrape` to `scrape_jobs.job_type` constraint
- **API routes**: `POST /api/subscriptions` trigger logic changes (internal only — response shape unchanged)
- **Cron handler**: `GET /api/cron/process-jobs` gains a new job type routing case
- **YouTube extractor**: New method `discoverOlderVideos()` — additional YouTube Data API v3 calls (quota impact: ~100 units per deepening trigger)
- **Domain models**: `ScrapeJobType` union gains `'deepening_scrape'`; `KolSource` gains `oldestScrapedAt` field
- **Constants**: `SCRAPE_CAPS` already exists in `config.ts`; add `DEEPENING_BATCH_SIZE` alongside it (or in new file)

## 1. Database & Types

- [ ] 1.1 Create migration: add `oldest_scraped_at TIMESTAMPTZ` column to `kol_sources`
- [ ] 1.2 Create migration: update `scrape_jobs.job_type` constraint to include `'deepening_scrape'`
- [ ] 1.3 Update `KolSource` domain model to add `oldestScrapedAt: Date | null` field
- [ ] 1.4 Update `ScrapeJobType` union type to include `'deepening_scrape'`
- [ ] 1.5 Update `kol-source.repository.ts` mapper to include `oldest_scraped_at` field
- [ ] 1.6 Run migrations and regenerate Supabase TypeScript types

## 2. Constants

- [ ] 2.1 Add `DEEPENING_BATCH_SIZE = 10` constant to `src/lib/constants/config.ts` alongside `SCRAPE_CAPS`

## 3. YouTube Extractor

- [ ] 3.1 Add `discoverOlderVideos(channelId, publishedBefore, maxResults)` method to `YouTubeChannelExtractor` using YouTube Data API v3 Search endpoint with `publishedBefore` parameter

## 4. Repository Helpers

- [ ] 4.1 Add `findOldestPostForKolSource(kolSourceId)` query to post repository (returns oldest `posted_at` for a kol_source's kol_id)
- [ ] 4.2 Add `getActiveJobForSource(kolSourceId, jobTypes[])` query to scrape-job repository (checks for queued/processing jobs)
- [ ] 4.3 Add `updateOldestScrapedAt(sourceId, date)` method to kol-source repository
- [ ] 4.4 Add `reconcilePostsScrapedCount(sourceId)` method to kol-source repository (verify and correct count against actual post count)

## 5. Deepening Scrape Service

- [ ] 5.1 Implement `executeDeepeningScrape(jobId)` in `profile-scrape.service.ts` — orchestrates: limit check → find oldest post → discover older URLs → cap to remaining capacity → process batch → update `posts_scraped_count` and `oldest_scraped_at`
- [ ] 5.2 Implement `triggerDeepeningScrapeIfEligible(kolSourceId)` function — encapsulates all checks (platform cap, active job race condition, count reconciliation) and creates the job if appropriate

## 6. Integration Points

- [ ] 6.1 Replace `triggerHistoricalExpansion()` stub in `POST /api/subscriptions` with call to `triggerDeepeningScrapeIfEligible()`
- [ ] 6.2 Extend `process-jobs` cron handler to route `deepening_scrape` jobs to `executeDeepeningScrape()`
- [ ] 6.3 Update existing scrape completion logic to set `oldest_scraped_at` when importing posts (initial and incremental scrapes too)

## 7. Tests

- [ ] 7.1 Unit test `triggerDeepeningScrapeIfEligible` — covers: below cap, at cap, active job exists, count reconciliation
- [ ] 7.2 Unit test `executeDeepeningScrape` — covers: limit check, URL discovery, capacity capping, count/cursor updates
- [ ] 7.3 Unit test `discoverOlderVideos` — covers: API call with correct `publishedBefore`, result mapping
- [ ] 7.4 Run full test suite and type-check to verify no regressions

## Why

The scrape feature has three UX/reliability issues discovered during manual testing: (1) YouTube videos without captions fail with timeouts because the Gemini transcription timeout (120s) interacts poorly with the batch processing timeout (50s), causing repeated re-processing and eventually silent errors; (2) when processing completes with all errors, the flow chart stays stuck on step 3 with no way for the user to exit or understand what happened; (3) the "Recent Tasks" section shows blank cards because job data lacks KOL names and meaningful stats.

## What Changes

- **Fix Gemini transcription timeout**: Increase `TRANSCRIPTION_TIMEOUT_MS` or reduce parallelism for no-caption videos so they don't exceed the batch timeout. Add per-URL error logging so failures are visible.
- **Add completion summary with "Start Over" button**: When a job completes (whether success or all-errors), show a summary card with counts (imported, errors, filtered) and a "Start Over" / "View KOL" button instead of only auto-redirecting. This exits the user from step 3.
- **Enrich "Recent Tasks" section**: Join KOL name into job data. Display KOL name, date, and counts (successful imports / errors) on each job card. Link completed jobs to their KOL detail page.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

_(none — these are implementation fixes, not spec-level requirement changes)_

## Impact

- `src/infrastructure/api/gemini.client.ts` — timeout constant adjustment
- `src/domain/services/profile-scrape.service.ts` — batch processing: serialize no-caption URLs or reduce batch size for them
- `src/components/scrape/scrape-progress.tsx` — completion summary card with stats and "Start Over" button
- `src/app/(app)/scrape/page.tsx` — flow chart exit on completion, enriched recent tasks section
- `src/infrastructure/repositories/scrape-job.repository.ts` — join KOL name into job query
- `src/hooks/use-scrape.ts` — expose enriched job data

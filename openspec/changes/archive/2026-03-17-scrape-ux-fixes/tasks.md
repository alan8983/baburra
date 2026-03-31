## 1. Fix Gemini transcription timeouts

- [x] 1.1 Increase `TRANSCRIPTION_TIMEOUT_MS` from 120s to 180s in `gemini.client.ts`
- [x] 1.2 In `processJobBatch` (`profile-scrape.service.ts`), detect no-caption URLs from `discoveredUrls` metadata and process them with `batchSize=1` instead of the default 5. Keep normal batch size for caption-available URLs.
- [x] 1.3 Add error logging in `processUrl` when Gemini transcription fails — log the video URL and error message so failures are visible in server logs

## 2. Completion summary and step 3 exit

- [x] 2.1 In `ScrapeProgress`, replace auto-redirect with a completion summary card showing: imported count, error count, filtered count, duplicate count
- [x] 2.2 Add "View KOL" (primary) and "Start Over" (outline) buttons to the summary card. "View KOL" navigates to KOL detail page, "Start Over" calls `onReset`
- [x] 2.3 When `importedCount === 0` and `errorCount > 0`, show a message explaining that no posts were imported and no credits were consumed
- [x] 2.4 Update `scrape/page.tsx` state machine: transition flow chart to step 4 when job status is `completed` or `failed`, not just on redirect
- [x] 2.5 Show "Start Over" button during active processing state as well (secondary/ghost), so users can abandon a long-running job

## 3. Enrich Recent Tasks section

- [x] 3.1 Modify `getScrapeJobsByUser` in `scrape-job.repository.ts` to join `kol_sources → kols` and return `kolName` with each job
- [x] 3.2 Update the Recent Tasks card in `scrape/page.tsx` to display: KOL name, date (relative or formatted), imported count, and error count
- [x] 3.3 Make completed job cards clickable — link to the KOL detail page

## 4. Verify

- [ ] 4.1 Test scrape flow with a YouTube channel that has videos without captions — verify Gemini transcription succeeds without timeout
- [ ] 4.2 Preview the completion summary card after a job finishes (both success and all-errors cases)
- [ ] 4.3 Preview the Recent Tasks section with enriched data

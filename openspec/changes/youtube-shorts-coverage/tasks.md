## 1. Investment content pre-filter

- [x] 1.1 Create `src/domain/services/content-filter.ts` with `isLikelyInvestmentContent(title: string, description: string): boolean` — keyword substring matching against positive and negative word lists (Chinese + English)
- [x] 1.2 Add unit tests for the pre-filter in `src/domain/services/content-filter.test.ts` — test positive matches, negative matches, mixed signals, empty inputs, case insensitivity

## 2. Type system updates

- [x] 2.1 Add `'youtube_short'` to the `SourcePlatform` union in `src/domain/models/post.ts`
- [x] 2.2 Add `'youtube_short'` to the `sourcePlatform` field type in `src/infrastructure/extractors/types.ts` (`UrlFetchResult`)
- [x] 2.3 Add `short_transcription: 3` to `CREDIT_COSTS` in `src/domain/models/user.ts`
- [x] 2.4 Update `docs/URL_FETCHER_OUTPUT_SPEC.md` to document the new `youtube_short` source platform value

## 3. Shorts detection in YouTube extractor

- [x] 3.1 In `YouTubeExtractor.extract()` (`youtube.extractor.ts`), set `sourcePlatform` to `'youtube_short'` when `durationSeconds <= 60`
- [x] 3.2 In `YouTubeExtractor.checkCaptionAvailability()`, use flat `CREDIT_COSTS.short_transcription` (3 credits) for Shorts (<=60s) instead of per-minute calculation

## 4. Gemini short-video transcription

- [x] 4.1 Add `geminiTranscribeShort(youtubeUrl: string): Promise<string>` to `src/infrastructure/api/gemini.client.ts` — uses `file_uri` with the YouTube URL and a transcription-only prompt
- [x] 4.2 Add error handling: catch Gemini failures and return a typed error so the caller can fall back to Deepgram

## 5. Import pipeline Shorts routing

- [x] 5.1 In `processUrl()` (`import-pipeline.service.ts`), detect Shorts via `durationSeconds <= 60` on the `UrlFetchResult`
- [x] 5.2 For captionless Shorts, call `isLikelyInvestmentContent()` with the video title/description. If it fails, return `{ status: 'error', error: 'filtered_not_investment' }` with no credit consumption
- [x] 5.3 For captionless Shorts passing the filter, attempt `geminiTranscribeShort()` first. On failure, fall back to existing Deepgram path (yt-dlp + deepgramTranscribe)
- [x] 5.4 Use flat `CREDIT_COSTS.short_transcription` (3 credits) for captionless Shorts instead of per-minute pricing. Skip credit reconciliation for flat-rate Shorts.
- [x] 5.5 Override `sourcePlatform` to `'youtube_short'` when creating the post for Shorts

## 6. Audit `youtube` platform checks

- [x] 6.1 Search codebase for `sourcePlatform === 'youtube'` and `=== 'youtube'` comparisons. Update each to also handle `'youtube_short'` (use helper function or add `|| sourcePlatform === 'youtube_short'`)
- [x] 6.2 Verify credit consumption logic in `processUrl()` correctly handles both `'youtube'` and `'youtube_short'`
- [x] 6.3 Verify post repository and API routes handle the new platform value without errors

## 7. Discovery UI: auto-filter for Shorts-heavy channels

- [x] 7.1 In `UrlDiscoveryList`, compute Shorts ratio on initial render. If `shorts_count / total_count > 0.6`, initialize `activeFilters` to `new Set(['short'])` and set `autoFilterApplied` flag
- [x] 7.2 Show a localized hint banner when auto-filter is applied: "此頻道以短影片為主，已自動選取短影片"
- [x] 7.3 Add translation keys for the hint in `src/messages/zh-TW/` and `src/messages/en/` translation files

## 8. UI: Shorts badge in posts list

- [x] 8.1 Update post platform badge rendering to show a distinct badge for `youtube_short` (purple pill, matching discovery UI color scheme)
- [x] 8.2 Verify the posts list, KOL detail page, and stock detail page all render the new badge correctly

## 9. Verify end-to-end

- [ ] 9.1 Test pre-filter: import a non-investment Short URL (e.g., cooking Short from investment KOL) — verify it gets filtered before transcription
- [ ] 9.2 Test Shorts transcription: import a captionless investment Short — verify Gemini file_uri transcription works and flat 3-credit pricing is applied
- [ ] 9.3 Test discovery auto-filter: discover a Shorts-heavy channel — verify auto-filter activates and hint appears
- [ ] 9.4 Test platform tracking: verify imported Shorts appear with `youtube_short` platform and distinct badge in posts list
- [x] 9.5 Run `npm run type-check` and `npm test` — verify no type errors or test failures

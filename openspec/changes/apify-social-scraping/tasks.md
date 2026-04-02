## Phase A: Apify Client + TikTok Extractor

### 1. Install dependency and add env var

- [ ] 1.1 Run `npm install apify-client` to add the official Apify SDK
- [ ] 1.2 Add `APIFY_API_TOKEN=` to `.env.example` with a comment explaining it
- [ ] 1.3 Add `APIFY_API_TOKEN` to `.env.local` (user provides value)
- [ ] 1.4 Verify `npm run type-check` passes

### 2. Create ApifyClient wrapper

- [ ] 2.1 Create `src/infrastructure/api/apify.client.ts` with:
  - `ApifyClient` class wrapping the `apify-client` package
  - `runActorSync(actorId, input, timeoutMs?)` — calls Actor synchronously, returns dataset items directly (for single-post extraction, <60s)
  - `runActor(actorId, input)` — starts Actor run asynchronously, returns `{ runId, datasetId }`
  - `waitForRun(runId, timeoutMs?)` — polls until run completes or times out
  - `getDatasetItems(datasetId, limit?)` — retrieves items from a completed run's dataset
  - Error normalization: map Apify errors to `ExtractorError` codes (`FETCH_FAILED`, `NETWORK_ERROR`)
  - Default timeout: 120,000ms
  - Token from `process.env.APIFY_API_TOKEN`
- [ ] 2.2 Export a singleton `apifyClient` instance
- [ ] 2.3 Verify `npm run type-check` passes

### 3. Create TikTok single-video extractor

- [ ] 3.1 Add `'tiktok'` to the `sourcePlatform` union in `src/infrastructure/extractors/types.ts` (it already has `'facebook'` in the union)
- [ ] 3.2 Create `src/infrastructure/extractors/tiktok.extractor.ts`:
  - Extends `SocialMediaExtractor` with `platform = 'tiktok'`
  - `URL_PATTERNS`: match `tiktok.com/@user/video/` and `vm.tiktok.com/` short URLs
  - `isValidUrl()`: test against URL patterns
  - `extract(url, config)`:
    1. Call `apifyClient.runActorSync('apidojo/tiktok-scraper', { postURLs: [url] })`
    2. Map Apify result to `UrlFetchResult`: `desc` → content, `createTime` → postedAt, `authorMeta.name` → kolName, `authorMeta.avatar` → kolAvatarUrl
    3. If content (description) passes investment keyword filter AND audio transcription is warranted:
       - Download audio via `downloadYouTubeAudio(url)` from `youtube-audio.client.ts` (supports TikTok natively)
       - Transcribe with `deepgramTranscribe(audioBuffer)`
       - Prepend description to transcript as final `content`
    4. Return `UrlFetchResult` with `sourcePlatform: 'tiktok'`, `durationSeconds` from Apify result
- [ ] 3.3 Export `tiktokExtractor` singleton
- [ ] 3.4 Verify `npm run type-check` passes

### 4. Create TikTok profile extractor

- [ ] 4.1 Create `src/infrastructure/extractors/tiktok-profile.extractor.ts`:
  - Extends `ProfileExtractor` with `platform = 'tiktok'`
  - `PROFILE_PATTERNS`: match `tiktok.com/@username` (without `/video/`)
  - `isValidProfileUrl()`: test against profile patterns
  - `extractProfile(url)`:
    1. Parse username from URL
    2. Call `apifyClient.runActor('apidojo/tiktok-scraper', { profiles: [username], resultsPerPage: 20 })`
    3. Wait for run completion with `waitForRun()`
    4. Retrieve items with `getDatasetItems()`
    5. Map to `ProfileExtractResult`:
       - `kolName` from first result's `authorMeta.name`
       - `kolAvatarUrl` from `authorMeta.avatar`
       - `platformId` from `authorMeta.id` or username
       - `postUrls` from video URLs
       - `discoveredUrls` with `contentType: 'short'`, `durationSeconds` from result
- [ ] 4.2 Export `tiktokProfileExtractor` singleton
- [ ] 4.3 Verify `npm run type-check` passes

### 5. Register TikTok extractors

- [ ] 5.1 In `src/infrastructure/extractors/factory.ts`: import and register `tiktokExtractor` in constructor
- [ ] 5.2 In `src/infrastructure/extractors/index.ts`: export `TikTokExtractor`, `tiktokExtractor`, `TikTokProfileExtractor`, `tiktokProfileExtractor`
- [ ] 5.3 In `src/domain/services/profile-scrape.service.ts`:
  - Import `tiktokProfileExtractor`
  - Add to `profileExtractors` array
  - Add TikTok credit cost logic in `discoverProfileUrls()`: use `CREDIT_COSTS.video_transcription_per_min` for TikTok videos (same as captionless YouTube)
- [ ] 5.4 Add `tiktok: 200` to `SCRAPE_CAPS` in `src/lib/constants/config.ts`
- [ ] 5.5 Verify `npm run type-check` and `npm test` pass

## Phase B: Facebook Extractor

### 6. Create Facebook single-post extractor

- [ ] 6.1 Create `src/infrastructure/extractors/facebook.extractor.ts`:
  - Extends `SocialMediaExtractor` with `platform = 'facebook'`
  - `URL_PATTERNS`: match `facebook.com/.../posts/`, `facebook.com/permalink.php?story_fbid=`, `facebook.com/share/p/`, `fb.com/`
  - `isValidUrl()`: test against URL patterns
  - `extract(url, config)`:
    1. Call `apifyClient.runActorSync('apify/facebook-posts-scraper', { startUrls: [{ url }], resultsLimit: 1 })`
    2. Map Apify result to `UrlFetchResult`: `postText` → content, `timestamp` → postedAt, `pageName` → kolName
    3. Validate content length (reuse `validateContent()`)
    4. Return `UrlFetchResult` with `sourcePlatform: 'facebook'`, no transcription
- [ ] 6.2 Export `facebookExtractor` singleton
- [ ] 6.3 Verify `npm run type-check` passes

### 7. Create Facebook profile extractor

- [ ] 7.1 Add `'text_post'` to `ContentType` union in `src/infrastructure/extractors/profile-extractor.ts`
- [ ] 7.2 Create `src/infrastructure/extractors/facebook-profile.extractor.ts`:
  - Extends `ProfileExtractor` with `platform = 'facebook'`
  - `PROFILE_PATTERNS`: match `facebook.com/PageName` (no `/posts/`, `/permalink`, etc.)
  - `isValidProfileUrl()`: test against profile patterns, exclude post-level URLs
  - `extractProfile(url)`:
    1. Call `apifyClient.runActor('apify/facebook-posts-scraper', { startUrls: [{ url }], resultsLimit: 20 })`
    2. Wait for completion, retrieve items
    3. Map to `ProfileExtractResult`:
       - `kolName` from first result's `pageName`
       - `platformId` from `pageId` or page name from URL
       - `postUrls` from `postUrl` fields
       - `discoveredUrls` with `contentType: 'text_post'`, title from first 100 chars of postText
- [ ] 7.3 Export `facebookProfileExtractor` singleton
- [ ] 7.4 Verify `npm run type-check` passes

### 8. Register Facebook extractors

- [ ] 8.1 In `src/infrastructure/extractors/factory.ts`: import and register `facebookExtractor` in constructor
- [ ] 8.2 In `src/infrastructure/extractors/index.ts`: export `FacebookExtractor`, `facebookExtractor`, `FacebookProfileExtractor`, `facebookProfileExtractor`
- [ ] 8.3 In `src/domain/services/profile-scrape.service.ts`:
  - Import `facebookProfileExtractor`
  - Add to `profileExtractors` array
  - Add Facebook credit cost logic: use `CREDIT_COSTS.text_analysis` (1 credit per post)
- [ ] 8.4 Add `facebook: 300` to `SCRAPE_CAPS` in `src/lib/constants/config.ts` (update existing entry if present)
- [ ] 8.5 Update any existing tests that assert Facebook/Threads URLs throw `INVALID_URL` — they should now succeed for Facebook
- [ ] 8.6 Verify `npm run type-check` and `npm test` pass

## Phase C: UI and Integration

### 9. Platform icons and URL detection

- [ ] 9.1 Add TikTok and Facebook platform icons (use `lucide-react` or inline SVG) to components that display platform-specific icons. Check: `url-discovery-list.tsx`, `detected-urls.tsx`, `import-result.tsx`, post detail pages
- [ ] 9.2 Update URL auto-detection in scrape page input to recognize TikTok and Facebook URLs and show platform badge
- [ ] 9.3 Update discovery list to handle `contentType: 'text_post'` (skip duration display, show text icon)

### 10. Verification

- [ ] 10.1 Run `npm run type-check`
- [ ] 10.2 Run `npm test`
- [ ] 10.3 Run `npm run build`
- [ ] 10.4 Manual smoke test: verify TikTok profile URL triggers discovery, single TikTok video extracts content with transcription, Facebook page URL triggers discovery, single Facebook post extracts text content

## Pre-flight

- [ ] All tasks in tasks.md marked `[x]`
- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes
- [ ] `npm run build` succeeds

## Change-Specific Tests

### V-001: ApifyClient wrapper — runActorSync method
- **method**: static
- **severity**: critical
- **expected**: `ApifyClient` class exists in `apify.client.ts` with `runActorSync()`, `runActor()`, `waitForRun()`, `getDatasetItems()` methods, error normalization to `ExtractorError`, and 120s default timeout
- **steps**:
  1. Read `src/infrastructure/api/apify.client.ts`
  2. Verify all methods exist with correct signatures
  3. Verify error mapping to `ExtractorError` codes

### V-002: `tiktok` in sourcePlatform union
- **method**: static
- **severity**: critical
- **expected**: `'tiktok'` exists in SourcePlatform union in `types.ts`
- **steps**:
  1. Grep for `tiktok` in `src/infrastructure/extractors/types.ts`
  2. Verify it appears in the union type

### V-003: `facebook` in sourcePlatform union
- **method**: static
- **severity**: critical
- **expected**: `'facebook'` exists in SourcePlatform union in `types.ts`
- **steps**:
  1. Grep for `facebook` in `src/infrastructure/extractors/types.ts`
  2. Verify it appears in the union type (may already be there)

### V-004: TikTok extractor — URL pattern matching
- **method**: static
- **severity**: critical
- **expected**: `TikTokExtractor.isValidUrl()` matches `tiktok.com/@user/video/` and `vm.tiktok.com/` short URLs
- **steps**:
  1. Read `src/infrastructure/extractors/tiktok.extractor.ts`
  2. Verify URL patterns cover both formats

### V-005: TikTok extractor — Apify Actor invocation
- **method**: static
- **severity**: critical
- **expected**: `extract()` calls `apifyClient.runActorSync('apidojo/tiktok-scraper', ...)` and maps result fields correctly
- **steps**:
  1. Read `tiktok.extractor.ts`
  2. Verify Actor ID and field mapping (desc → content, createTime → postedAt, authorMeta → kolName/avatar)

### V-006: TikTok extractor — audio transcription pipeline
- **method**: static
- **severity**: critical
- **expected**: `extract()` downloads audio via `downloadYouTubeAudio()` (yt-dlp) and transcribes via `deepgramTranscribe()`, prepending description to transcript
- **steps**:
  1. Read `tiktok.extractor.ts`
  2. Verify audio download → Deepgram transcription → content concatenation flow

### V-007: TikTok profile extractor — discovery
- **method**: static
- **severity**: critical
- **expected**: `TikTokProfileExtractor.extractProfile()` parses username from URL, calls Apify with `profiles` input, maps results to `DiscoveredUrl[]` with `contentType: 'short'`
- **steps**:
  1. Read `src/infrastructure/extractors/tiktok-profile.extractor.ts`
  2. Verify username parsing, Actor input, and result mapping

### V-008: Facebook extractor — URL pattern matching
- **method**: static
- **severity**: critical
- **expected**: `FacebookExtractor.isValidUrl()` matches `/posts/`, `/permalink.php?story_fbid=`, `/share/p/`, and `fb.com/` variations
- **steps**:
  1. Read `src/infrastructure/extractors/facebook.extractor.ts`
  2. Verify all URL patterns

### V-009: Facebook extractor — text-only extraction (no transcription)
- **method**: static
- **severity**: critical
- **expected**: `extract()` maps `postText` → content, `timestamp` → postedAt, `pageName` → kolName. No audio download or transcription calls.
- **steps**:
  1. Read `facebook.extractor.ts`
  2. Verify field mapping and absence of transcription logic

### V-010: Facebook profile extractor — `text_post` content type
- **method**: static
- **severity**: high
- **expected**: `FacebookProfileExtractor.extractProfile()` returns `DiscoveredUrl[]` with `contentType: 'text_post'`
- **steps**:
  1. Read `src/infrastructure/extractors/facebook-profile.extractor.ts`
  2. Verify `contentType: 'text_post'` in discovery results

### V-011: ExtractorFactory — TikTok registered
- **method**: static
- **severity**: critical
- **expected**: `tiktokExtractor` is imported and registered in `factory.ts` constructor
- **steps**:
  1. Read `src/infrastructure/extractors/factory.ts`
  2. Verify TikTok extractor registration

### V-012: ExtractorFactory — Facebook registered
- **method**: static
- **severity**: critical
- **expected**: `facebookExtractor` is imported and registered in `factory.ts` constructor
- **steps**:
  1. Read `src/infrastructure/extractors/factory.ts`
  2. Verify Facebook extractor registration

### V-013: Profile scrape service — both profile extractors registered
- **method**: static
- **severity**: critical
- **expected**: `tiktokProfileExtractor` and `facebookProfileExtractor` are in `profileExtractors` array in `profile-scrape.service.ts`
- **steps**:
  1. Read `src/domain/services/profile-scrape.service.ts`
  2. Verify both extractors in array

### V-014: SCRAPE_CAPS — TikTok and Facebook limits
- **method**: static
- **severity**: high
- **expected**: `SCRAPE_CAPS` in `config.ts` includes `tiktok: 200` and `facebook: 300`
- **steps**:
  1. Read `src/lib/constants/config.ts`
  2. Verify both entries

### V-015: `apify-client` installed
- **method**: static
- **severity**: critical
- **expected**: `apify-client` is in `package.json` dependencies
- **steps**:
  1. Read `package.json`
  2. Verify dependency exists

### V-016: `.env.example` updated
- **method**: static
- **severity**: medium
- **expected**: `APIFY_API_TOKEN` is in `.env.example` with a descriptive comment
- **steps**:
  1. Read `.env.example`
  2. Verify env var is listed

### V-017: Old Facebook/Threads `INVALID_URL` test assertions removed
- **method**: static
- **severity**: high
- **expected**: No test assertions expect Facebook URLs to throw `INVALID_URL`
- **steps**:
  1. Grep for `INVALID_URL` combined with `facebook` or `Facebook` in test files
  2. Verify no remaining assertions that Facebook URLs are unsupported

## Browser MCP E2E Tests (Final Gatekeeper)

### E2E-001: Scrape page accepts TikTok profile URL
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Verify page loads (no console errors)
  3. Paste a TikTok profile URL (e.g., `https://www.tiktok.com/@username`) into the URL input
  4. Verify the platform is detected as "TikTok"
  5. Take a screenshot for proof

### E2E-002: Scrape page accepts TikTok video URL
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Paste a TikTok video URL (e.g., `https://www.tiktok.com/@user/video/1234567890`)
  3. Verify the platform is detected as "TikTok"
  4. Take a screenshot for proof

### E2E-003: Scrape page accepts Facebook page URL
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Paste a Facebook page URL (e.g., `https://www.facebook.com/PageName`)
  3. Verify the platform is detected as "Facebook"
  4. Take a screenshot for proof

### E2E-004: Scrape page accepts Facebook post URL
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Paste a Facebook post URL (e.g., `https://www.facebook.com/PageName/posts/123456`)
  3. Verify the platform is detected as "Facebook"
  4. Take a screenshot for proof

### E2E-005: Platform icons render in discovery list for TikTok
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Submit a TikTok profile URL on scrape page
  2. Wait for discovery results
  3. Verify TikTok icon appears alongside discovered videos
  4. Verify `contentType: 'short'` items show duration and credit estimate
  5. Take a screenshot for proof

### E2E-006: Platform icons render in discovery list for Facebook
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Submit a Facebook page URL on scrape page
  2. Wait for discovery results
  3. Verify Facebook icon appears alongside discovered posts
  4. Verify `contentType: 'text_post'` items show text icon (no duration)
  5. Take a screenshot for proof

### E2E-007: No console errors on key pages
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `/scrape`, `/posts`, `/kols`
  2. Check browser console for errors
  3. Verify no unhandled errors related to TikTok, Facebook, or Apify

## Regression

### Area: KOL Management
- GET /api/kols → 200, returns array

### Area: Posts
- GET /api/posts → 200, returns paginated object

### Area: Stocks
- GET /api/stocks → 200, returns array

### Area: Health
- GET /api/health → 200

### Area: Existing YouTube flow
- Importing a YouTube video still works with existing `youtube` platform

### Area: Existing Twitter flow
- Importing a Twitter URL still works with existing `twitter` platform

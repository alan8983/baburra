## Pre-flight

- [ ] All tasks in tasks.md marked `[x]`
- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes
- [ ] `npm run build` succeeds

## Change-Specific Tests

### V-001: Investment content pre-filter — positive keywords
- **method**: unit
- **severity**: critical
- **expected**: `isLikelyInvestmentContent()` returns `true` for titles with investment keywords like 股票, ETF, 台積電, bullish
- **steps**:
  1. Run `npx vitest run src/domain/services/content-filter.test.ts`
  2. Verify positive keyword tests pass

### V-002: Investment content pre-filter — negative keywords
- **method**: unit
- **severity**: critical
- **expected**: `isLikelyInvestmentContent()` returns `false` for titles with negative keywords like 開箱, vlog, cooking
- **steps**:
  1. Run `npx vitest run src/domain/services/content-filter.test.ts`
  2. Verify negative keyword tests pass

### V-003: `youtube_short` in SourcePlatform union
- **method**: static
- **severity**: critical
- **expected**: `'youtube_short'` exists in SourcePlatform union in `post.ts` and `types.ts`
- **steps**:
  1. Grep for `youtube_short` in `src/domain/models/post.ts` and `src/infrastructure/extractors/types.ts`
  2. Verify it appears in the union type

### V-004: Shorts credit pricing — flat 3 credits
- **method**: static
- **severity**: critical
- **expected**: `CREDIT_COSTS` includes `short_transcription: 3` and `processUrl()` uses flat pricing for <=60s videos
- **steps**:
  1. Read `src/domain/models/user.ts` — verify `short_transcription` constant
  2. Read `import-pipeline.service.ts` — verify flat pricing branch for `durationSeconds <= 60`

### V-005: YouTube extractor sets `youtube_short` for <=60s
- **method**: static
- **severity**: critical
- **expected**: `YouTubeExtractor.extract()` sets `sourcePlatform: 'youtube_short'` when `durationSeconds <= 60`
- **steps**:
  1. Read `youtube.extractor.ts`
  2. Verify conditional platform assignment based on duration

### V-006: Gemini short-video transcription function exists
- **method**: static
- **severity**: high
- **expected**: `geminiTranscribeShort()` exists in `gemini.client.ts` with `file_uri` approach and error handling for Deepgram fallback
- **steps**:
  1. Read `src/infrastructure/api/gemini.client.ts`
  2. Verify function signature and error handling

### V-007: Pipeline routes Shorts through pre-filter before transcription
- **method**: static
- **severity**: critical
- **expected**: `processUrl()` calls `isLikelyInvestmentContent()` for captionless Shorts BEFORE calling any transcription service
- **steps**:
  1. Read `import-pipeline.service.ts`
  2. Verify pre-filter call order precedes transcription

### V-008: Discovery UI auto-filter for Shorts-heavy channels
- **method**: static
- **severity**: high
- **expected**: `UrlDiscoveryList` computes shorts ratio and auto-activates "short" filter when ratio > 0.6, with a hint banner
- **steps**:
  1. Read `url-discovery-list.tsx`
  2. Verify ratio calculation and auto-filter logic

### V-009: i18n strings for auto-filter hint
- **method**: static
- **severity**: medium
- **expected**: Translation keys for Shorts auto-filter hint exist in both `zh-TW` and `en` locales
- **steps**:
  1. Read translation files in `src/messages/zh-TW/` and `src/messages/en/`
  2. Verify hint text keys exist

### V-010: Shorts badge in posts list
- **method**: static
- **severity**: medium
- **expected**: Platform badge rendering handles `youtube_short` with a distinct visual (purple pill or similar)
- **steps**:
  1. Search for `youtube_short` in component files
  2. Verify badge rendering logic

### V-011: URL_FETCHER_OUTPUT_SPEC updated
- **method**: static
- **severity**: medium
- **expected**: `docs/URL_FETCHER_OUTPUT_SPEC.md` documents `youtube_short` as a valid `sourcePlatform` value
- **steps**:
  1. Read `docs/URL_FETCHER_OUTPUT_SPEC.md`
  2. Verify `youtube_short` is listed

### V-012: Codebase audit — no broken `youtube` platform checks
- **method**: static
- **severity**: critical
- **expected**: All `sourcePlatform === 'youtube'` comparisons also handle `'youtube_short'`
- **steps**:
  1. Grep for `=== 'youtube'` and `=== "youtube"` across the codebase
  2. Verify each occurrence also accounts for `youtube_short`

## Browser MCP E2E Tests (Final Gatekeeper)

### E2E-001: Scrape page loads and accepts a YouTube Shorts URL
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Verify page loads (HTTP 200, no console errors)
  3. Paste a YouTube Shorts URL (e.g., `https://www.youtube.com/shorts/VIDEO_ID`) into the URL input
  4. Verify the platform is auto-detected as "YouTube"
  5. Take a screenshot for proof

### E2E-002: Discovery UI shows Shorts filter and auto-selects for Shorts-heavy channel
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Navigate to scrape page
  2. Submit a YouTube channel URL known to have >60% Shorts
  3. Wait for discovery results to load
  4. Verify the "Short" filter toggle is auto-activated
  5. Verify the auto-filter hint banner is visible
  6. Take a screenshot for proof

### E2E-003: Posts list shows `youtube_short` badge
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Navigate to `/posts` or a KOL detail page that has imported Shorts
  2. Verify posts with `sourcePlatform: 'youtube_short'` display a distinct Shorts badge
  3. Verify badge is visually distinguishable from regular YouTube badge
  4. Take a screenshot for proof

### E2E-004: No console errors on key pages
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `/scrape`, `/posts`, `/kols`
  2. Check browser console for errors
  3. Verify no unhandled errors related to `youtube_short` or content filter

## Regression

### Area: KOL Management
- GET /api/kols → 200, returns array

### Area: Posts
- GET /api/posts → 200, returns paginated object

### Area: Stocks
- GET /api/stocks → 200, returns array

### Area: Health
- GET /api/health → 200

### Area: Existing YouTube long-video flow
- Importing a regular (>60s) YouTube video still works with existing `youtube` platform and per-minute credit pricing

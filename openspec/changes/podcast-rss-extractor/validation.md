## Pre-flight

- [ ] All tasks in tasks.md marked `[x]`
- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes
- [ ] `npm run build` succeeds

## Change-Specific Tests

### V-001: VTT parser — strips timestamps and speaker labels
- **method**: unit
- **severity**: critical
- **expected**: `parseVttToText()` correctly strips WEBVTT header, timestamps, `<v>` voice tags, and returns clean text
- **steps**:
  1. Run `npx vitest run src/lib/utils/__tests__/vtt-parser.test.ts`
  2. Verify all parser tests pass (VTT, SRT, plain text, empty, malformed)

### V-002: PodcastIndex client — auth header generation
- **method**: unit
- **severity**: critical
- **expected**: `searchByTerm()` generates correct SHA-1 HMAC auth headers per PodcastIndex spec
- **steps**:
  1. Run `npx vitest run src/infrastructure/api/__tests__/podcast-index.client.test.ts`
  2. Verify auth header and search result tests pass

### V-003: Apple Podcasts RSS resolution
- **method**: static
- **severity**: critical
- **expected**: `resolveAppleToRss()` extracts numeric ID from Apple URL and calls iTunes Lookup API
- **steps**:
  1. Read the RSS resolver code
  2. Verify URL parsing regex matches `podcasts.apple.com/{locale}/podcast/{slug}/id{numericId}`
  3. Verify iTunes API call pattern

### V-004: Spotify RSS resolution via PodcastIndex
- **method**: static
- **severity**: high
- **expected**: `resolveSpotifyToRss()` fetches show name via Spotify oEmbed, then queries PodcastIndex for RSS feed URL
- **steps**:
  1. Read the RSS resolver code
  2. Verify two-step resolution chain

### V-005: `podcast` in sourcePlatform union
- **method**: static
- **severity**: critical
- **expected**: `'podcast'` exists in SourcePlatform union in `types.ts`
- **steps**:
  1. Grep for `podcast` in `src/infrastructure/extractors/types.ts`
  2. Verify it appears in the union type

### V-006: Podcast profile extractor — episode discovery
- **method**: unit
- **severity**: critical
- **expected**: Profile extractor parses RSS XML, extracts episodes, applies investment keyword filter, returns `DiscoveredUrl[]` with credit estimates
- **steps**:
  1. Run `npx vitest run src/infrastructure/extractors/__tests__/podcast-profile.extractor.test.ts`
  2. Verify RSS parsing, episode limit, keyword filtering, and credit estimation tests pass

### V-007: Podcast episode extractor — three-tier transcript fallback
- **method**: unit
- **severity**: critical
- **expected**: Episode extractor attempts Tier 1 (RSS transcript), then Tier 2 (cache), then Tier 3 (Deepgram) in order
- **steps**:
  1. Run `npx vitest run src/infrastructure/extractors/__tests__/podcast.extractor.test.ts`
  2. Verify fallback chain tests pass

### V-008: Episode URL encoding/decoding roundtrip
- **method**: unit
- **severity**: high
- **expected**: `encodeEpisodeUrl()` and `decodeEpisodeUrl()` roundtrip correctly for feed URLs with special characters
- **steps**:
  1. Run `npx vitest run src/infrastructure/extractors/__tests__/podcast.extractor.test.ts`
  2. Verify encoding/decoding tests pass

### V-009: Duration guard — skip episodes >90 minutes
- **method**: unit
- **severity**: medium
- **expected**: Episodes longer than 90 minutes are rejected with appropriate error message
- **steps**:
  1. Verify duration guard test exists and passes

### V-010: Factory registration — podcast extractor
- **method**: static
- **severity**: critical
- **expected**: `PodcastEpisodeExtractor` is registered in `ExtractorFactory` constructor
- **steps**:
  1. Read `src/infrastructure/extractors/factory.ts`
  2. Verify podcast extractor import and `register()` call

### V-011: Profile scrape service — podcast profile extractor registered
- **method**: static
- **severity**: critical
- **expected**: `PodcastProfileExtractor` is in the `profileExtractors` array in `profile-scrape.service.ts`
- **steps**:
  1. Read `src/domain/services/profile-scrape.service.ts`
  2. Verify podcast profile extractor in array

### V-012: Credit pricing — 2 credits with transcript, 5/min without
- **method**: static
- **severity**: high
- **expected**: `CREDIT_COSTS` includes `podcast_transcript_analysis: 2` and podcast episodes without transcript use `video_transcription_per_min` rate
- **steps**:
  1. Read `src/domain/models/user.ts` for constant
  2. Read profile extractor credit estimation logic

### V-013: `.env.example` updated
- **method**: static
- **severity**: medium
- **expected**: `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` are in `.env.example` with comments
- **steps**:
  1. Read `.env.example`
  2. Verify both env vars are listed

### V-014: `fast-xml-parser` installed
- **method**: static
- **severity**: critical
- **expected**: `fast-xml-parser` is in `package.json` dependencies
- **steps**:
  1. Read `package.json`
  2. Verify dependency exists

## Browser MCP E2E Tests (Final Gatekeeper)

### E2E-001: Scrape page accepts Apple Podcast URL
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Verify page loads (no console errors)
  3. Paste an Apple Podcast show URL (e.g., `https://podcasts.apple.com/tw/podcast/gooaye/id1462336720`) into the URL input
  4. Verify the platform is detected as "Podcast"
  5. Take a screenshot for proof

### E2E-002: Scrape page accepts Spotify Podcast URL
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Paste a Spotify show URL (e.g., `https://open.spotify.com/show/SHOW_ID`) into the URL input
  3. Verify the platform is detected as "Podcast"
  4. Take a screenshot for proof

### E2E-003: Scrape page accepts direct RSS feed URL
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Navigate to `http://localhost:3000/scrape`
  2. Paste a direct RSS feed URL (e.g., `https://feeds.soundon.fm/podcast.xml`)
  3. Verify the platform is detected as "Podcast"
  4. Take a screenshot for proof

### E2E-004: Discovery list shows podcast episodes with transcript indicator
- **method**: browser-mcp
- **severity**: high
- **steps**:
  1. Submit a podcast URL on scrape page
  2. Wait for discovery results to load
  3. Verify episodes are listed with titles and dates
  4. Verify transcript availability indicator ("有逐字稿" or "需轉錄") is shown per episode
  5. Verify credit estimates are displayed
  6. Take a screenshot for proof

### E2E-005: Podcast icon appears in discovery list
- **method**: browser-mcp
- **severity**: medium
- **steps**:
  1. View podcast discovery results
  2. Verify a podcast icon (Headphones/Mic) is displayed alongside episodes
  3. Take a screenshot for proof

### E2E-006: No console errors on key pages
- **method**: browser-mcp
- **severity**: critical
- **steps**:
  1. Navigate to `/scrape`, `/posts`, `/kols`
  2. Check browser console for errors
  3. Verify no unhandled errors related to podcast extractor or RSS parsing

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

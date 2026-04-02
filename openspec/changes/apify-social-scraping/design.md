## Overview

Add TikTok and Facebook as supported scraping platforms by integrating Apify as a managed scraping layer. The implementation follows the existing extractor architecture: `SocialMediaExtractor` subclasses for single-post extraction, `ProfileExtractor` subclasses for profile-level discovery, all registered in `ExtractorFactory` and the profile scrape service respectively. A shared `ApifyClient` wraps the `apify-client` npm package.

## Architecture

### Data Flow — TikTok (with transcription)

```
TikTok profile URL
  → TikTokProfileExtractor.extractProfile()
    → ApifyClient.runActor('apidojo/tiktok-scraper')
      → DiscoveredUrl[] (contentType: 'short')
        → User selects URLs → initiateScrape()
          → TikTokExtractor.extract()
            → ApifyClient (metadata: description, author, timestamp)
            → yt-dlp-exec (audio download — already supports TikTok)
            → deepgramTranscribe() (Deepgram Nova-3)
            → transcript cached in transcripts table
          → processUrl() pipeline (Gemini sentiment analysis)
```

### Data Flow — Facebook (text-only)

```
Facebook page URL
  → FacebookProfileExtractor.extractProfile()
    → ApifyClient.runActor('apify/facebook-posts-scraper')
      → DiscoveredUrl[] (contentType: 'text_post')
        → User selects URLs → initiateScrape()
          → FacebookExtractor.extract()
            → ApifyClient (postText, timestamp, pageName)
          → processUrl() pipeline (Gemini sentiment analysis)
```

### Component Hierarchy

```
ExtractorFactory
├── TwitterExtractor (existing)
├── YouTubeExtractor (existing)
├── TikTokExtractor (NEW — uses ApifyClient + yt-dlp + Deepgram)
└── FacebookExtractor (NEW — uses ApifyClient, text-only)

ProfileExtractor Registry (profile-scrape.service.ts)
├── YouTubeChannelExtractor (existing)
├── TwitterProfileExtractor (existing)
├── TikTokProfileExtractor (NEW — uses ApifyClient)
└── FacebookProfileExtractor (NEW — uses ApifyClient)

ApifyClient (NEW — shared infrastructure)
└── apify-client npm package (handles REST API, polling, auth)
```

## Design Decisions

### 1. Use `apify-client` npm package instead of raw REST API

**Decision**: Depend on the official `apify-client` package rather than hand-rolling REST calls.

**Rationale**: The package handles authentication, polling for Actor run completion, retry logic, and typed responses. Our `ApifyClient` wrapper is a thin facade that adds timeout enforcement and error normalization to `ExtractorError` codes. Total wrapper: ~80 lines vs ~300+ for raw REST.

**Trade-off**: Adds one npm dependency (~150KB). Acceptable given the complexity it absorbs.

### 2. TikTok transcription reuses existing yt-dlp + Deepgram pipeline

**Decision**: Download TikTok audio via `yt-dlp-exec` (which natively supports TikTok URLs) and transcribe with the existing `deepgramTranscribe()` function.

**Rationale**: Zero new transcription infrastructure. `yt-dlp` already handles TikTok URL resolution, authentication-free video download, and audio extraction. Deepgram Nova-3 handles any audio format. The existing `transcripts` table caches results.

**Implementation**: In `TikTokExtractor.extract()`, after fetching metadata from Apify, check if the video description passes the investment keyword filter. If yes, call `downloadYouTubeAudio()` (rename consideration: it works for TikTok too) then `deepgramTranscribe()`. Merge the transcript with the description as the final `content` field.

### 3. Facebook extractor is text-only (no video transcription)

**Decision**: `FacebookExtractor` extracts `postText` directly and sets it as `content`. No audio/video processing.

**Rationale**: Taiwan investment KOL Facebook posts are predominantly text (long-form analysis, stock picks, market commentary). Video posts are rare and typically duplicate content from YouTube. Adding FB video transcription would increase complexity without proportional value. Can be added in a future iteration if needed.

### 4. New `ContentType` value: `'text_post'`

**Decision**: Add `'text_post'` to the `ContentType` union in `profile-extractor.ts` for Facebook posts.

**Rationale**: Existing content types (`long_video`, `short`, `live_stream`) are all video-oriented. Facebook posts are fundamentally text content with no duration concept. The discovery list UI can use this to show appropriate icons and skip duration/caption-related display logic.

### 5. Apify Actor selection

**Decision**:
- TikTok: `apidojo/tiktok-scraper` (most popular, 98% success rate)
- Facebook: `apify/facebook-posts-scraper` (official Apify-maintained)

**Rationale**: Both Actors are well-maintained with high reliability scores. The TikTok scraper supports profile-level scraping with configurable result limits. The Facebook scraper supports page URLs with `maxPosts` parameter.

**Actor input/output mapping**:

TikTok profile discovery:
```
Input:  { "profiles": ["username"], "resultsPerPage": 20 }
Output: [{ id, videoUrl, desc, createTime, authorMeta, stats }]
  → Map to DiscoveredUrl { url, title: desc, publishedAt: createTime, contentType: 'short' }
```

TikTok single video:
```
Input:  { "postURLs": ["https://www.tiktok.com/@user/video/123"] }
Output: [{ desc, createTime, authorMeta: { name, avatar }, musicMeta, stats }]
  → Map to UrlFetchResult { content: desc + transcript, sourcePlatform: 'tiktok', ... }
```

Facebook profile discovery:
```
Input:  { "startUrls": [{ "url": "https://www.facebook.com/PageName" }], "resultsLimit": 20 }
Output: [{ postId, postUrl, postText, timestamp, likes, comments, shares }]
  → Map to DiscoveredUrl { url: postUrl, title: first100chars, publishedAt: timestamp, contentType: 'text_post' }
```

Facebook single post:
```
Input:  { "startUrls": [{ "url": "https://www.facebook.com/.../posts/123" }], "resultsLimit": 1 }
Output: [{ postText, timestamp, pageName }]
  → Map to UrlFetchResult { content: postText, sourcePlatform: 'facebook', ... }
```

### 6. Vercel timeout handling

**Decision**: Use the synchronous Apify endpoint (`run-sync-get-dataset-items`) for single-post extraction (typically completes in 10-30s). Use the async pattern (start run, poll for completion) for profile discovery which may take longer.

**Rationale**: Vercel Hobby plan has a 60s timeout. Single-post scrapes via Apify typically complete within 30s. Profile discovery with 20+ posts may exceed this, so it uses the existing scrape job async pattern (start job, return immediately, client polls for progress).

**Implementation**: `ApifyClient` exposes both `runActorSync()` (blocks until result) and `runActor()` (returns run ID for polling). Extractors choose the appropriate method based on expected execution time.

### 7. Credit pricing for TikTok

**Decision**: Same as YouTube Shorts — flat 3 credits for videos <=60s, 5 credits/min for longer videos (uses `CREDIT_COSTS.video_transcription_per_min`).

**Rationale**: TikTok videos require the same transcription pipeline as captionless YouTube videos (yt-dlp download + Deepgram). Cost structure should match. Most TikTok investment content is 60-180s.

### 8. Facebook credit pricing

**Decision**: 1 credit per post (uses `CREDIT_COSTS.text_analysis`).

**Rationale**: Facebook posts are text-only extraction with no transcription cost. Same as Twitter posts.

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `apify-client` dependency |
| `.env.example` | Add `APIFY_API_TOKEN` |
| `src/infrastructure/api/apify.client.ts` | **NEW** — ApifyClient wrapper (~80 lines) |
| `src/infrastructure/extractors/tiktok.extractor.ts` | **NEW** — TikTok single-video extractor |
| `src/infrastructure/extractors/tiktok-profile.extractor.ts` | **NEW** — TikTok profile discovery |
| `src/infrastructure/extractors/facebook.extractor.ts` | **NEW** — Facebook single-post extractor |
| `src/infrastructure/extractors/facebook-profile.extractor.ts` | **NEW** — Facebook profile discovery |
| `src/infrastructure/extractors/types.ts` | Add `'tiktok'` to `sourcePlatform` union |
| `src/infrastructure/extractors/profile-extractor.ts` | Add `'text_post'` to `ContentType` union |
| `src/infrastructure/extractors/factory.ts` | Register TikTok + Facebook extractors |
| `src/infrastructure/extractors/index.ts` | Export new extractors |
| `src/domain/services/profile-scrape.service.ts` | Register profile extractors, add TikTok/FB credit logic |
| `src/lib/constants/config.ts` | Add `tiktok: 200`, `facebook: 300` to `SCRAPE_CAPS` |
| `supabase/migrations/xxx_add_tiktok_facebook_platforms.sql` | **NEW** — Expand `kol_sources.platform` |
| UI components | Platform icons, URL detection, discovery list updates |

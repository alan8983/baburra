## Why

TikTok and Facebook are the two largest platforms where Taiwanese retail investment KOLs publish content, yet Baburra currently only supports Twitter/X and YouTube. Adding these platforms unlocks a significant pool of trackable KOL opinions:

1. **TikTok (P2)** — Taiwan's fastest-growing investment KOL platform. Short-form video KOLs post 1-3 minute videos with explicit stock calls at high frequency (daily). Strong emotional signal, cheap to process. The real investment opinion is in spoken audio, so transcription via Deepgram Nova-3 is essential.

2. **Facebook (P3)** — Taiwan's largest investment community. Investment communities and pages host long-form text posts where KOLs share detailed analysis. Zero transcription cost since posts are text-based.

3. **Apify as managed scraping layer** — Both TikTok and Facebook have aggressive anti-bot measures. Apify's managed Actors handle proxy rotation, session management, CAPTCHA avoidance, and platform updates for $39/month. One `APIFY_API_TOKEN` covers both platforms (and future IG Reels).

## What Changes

### 1. Apify Client (shared infrastructure)

A thin wrapper around the `apify-client` npm package in `src/infrastructure/api/apify.client.ts`. Core methods: `runActor()`, `getDatasetItems()`, `waitForRun()`. Supports both async (poll for completion) and synchronous Actor invocation patterns. All TikTok and Facebook extractors use this shared client.

### 2. TikTok Extractors

**Profile-level discovery** (`TikTokProfileExtractor`):
- Input: TikTok profile URL (`https://www.tiktok.com/@username`)
- Uses `apidojo/tiktok-scraper` Apify Actor to fetch recent videos
- Returns `DiscoveredUrl[]` with `contentType: 'short'`

**Single video extraction** (`TikTokExtractor`):
- Input: TikTok video URL
- Extracts description, createTime, author metadata via Apify
- Returns `UrlFetchResult` with `sourcePlatform: 'tiktok'`

**Transcription pipeline** (reuses existing infra):
- Pre-filter descriptions with investment keyword checker
- Download audio via `yt-dlp-exec` (natively supports TikTok)
- Transcribe with Deepgram Nova-3 (existing `deepgramTranscribe()`)
- Cache transcript in `transcripts` table
- Feed transcript to Gemini for sentiment analysis

### 3. Facebook Extractors

**Profile-level discovery** (`FacebookProfileExtractor`):
- Input: Facebook page/profile URL
- Uses `apify/facebook-posts-scraper` Actor to fetch recent posts
- Returns `DiscoveredUrl[]` with `contentType: 'text_post'` (new content type)

**Single post extraction** (`FacebookExtractor`):
- Input: Facebook post URL (supports `/posts/`, `/permalink.php`, `/share/p/` formats)
- Extracts `postText` as content, `timestamp` as postedAt, `pageName` as kolName
- Returns `UrlFetchResult` with `sourcePlatform: 'facebook'`
- No transcription needed — Taiwan FB investment posts are predominantly text

### 4. Factory and Type Updates

- Register `TikTokExtractor` and `FacebookExtractor` in `ExtractorFactory`
- Register `TikTokProfileExtractor` and `FacebookProfileExtractor` in profile scrape service
- Add `'tiktok'` to `sourcePlatform` union type
- Add `'text_post'` to `ContentType` union
- Add TikTok and Facebook to `SCRAPE_CAPS` in `config.ts`

### 5. UI Enhancements

- Platform icons for TikTok and Facebook in post lists and KOL pages
- Auto-detect TikTok and Facebook URLs in scrape page input
- Discovery list support for both platforms

### 6. Database Updates

- Add `'tiktok'` and `'facebook'` to `kol_sources.platform` allowed values

## Capabilities

### New Capabilities

- `apify-client`: Shared Apify API client for running Actors and retrieving dataset results
- `tiktok-extractor`: Single TikTok video content extraction with audio transcription
- `tiktok-profile-extractor`: TikTok profile discovery (list recent videos)
- `facebook-extractor`: Single Facebook post content extraction (text-only)
- `facebook-profile-extractor`: Facebook page/profile discovery (list recent posts)

### Modified Capabilities

- `extractor-factory`: Register TikTok and Facebook extractors
- `profile-scrape-service`: Register TikTok and Facebook profile extractors, add credit cost logic
- `source-platform-type`: Expand union with `'tiktok'` (note: `'facebook'` already exists in type)
- `content-type`: Add `'text_post'` variant for Facebook posts
- `scrape-caps`: Add TikTok (200) and Facebook (300) platform limits
- `platform-icons`: Add TikTok and Facebook icons throughout UI

## Impact

| File | Change |
|------|--------|
| `src/infrastructure/api/apify.client.ts` | **NEW** — Apify client wrapper |
| `src/infrastructure/extractors/tiktok.extractor.ts` | **NEW** — TikTok single-video extractor |
| `src/infrastructure/extractors/tiktok-profile.extractor.ts` | **NEW** — TikTok profile discovery |
| `src/infrastructure/extractors/facebook.extractor.ts` | **NEW** — Facebook single-post extractor |
| `src/infrastructure/extractors/facebook-profile.extractor.ts` | **NEW** — Facebook profile discovery |
| `src/infrastructure/extractors/types.ts` | Add `'tiktok'` to `sourcePlatform` union |
| `src/infrastructure/extractors/profile-extractor.ts` | Add `'text_post'` to `ContentType` |
| `src/infrastructure/extractors/factory.ts` | Register TikTok and Facebook extractors |
| `src/infrastructure/extractors/index.ts` | Export new extractors |
| `src/domain/services/profile-scrape.service.ts` | Register profile extractors, add credit cost logic |
| `src/lib/constants/config.ts` | Add TikTok/Facebook to `SCRAPE_CAPS` |
| `supabase/migrations/` | Add migration for `kol_sources.platform` values |
| `.env.example` | Add `APIFY_API_TOKEN` |
| `package.json` | Add `apify-client` dependency |
| UI components (various) | Platform icons, URL detection, discovery list |

## Out of Scope

- Instagram Reels (P4, future)
- Threads platform
- TikTok video download for archiving
- Facebook group scraping (requires login, privacy concerns)
- Facebook video transcription
- Real-time webhook-based monitoring

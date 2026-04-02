## Why

YouTube Shorts (<=60s videos) are the highest-frequency, lowest-cost data source for KOL investment opinions. Investment KOLs post 3-5 Shorts/week vs 1 long video/week, each costing ~$0.012 to process (12x cheaper than a 15-min video). Shorts are emotion-driven and opinion-heavy, making them ideal for sentiment extraction — KOLs often make explicit bullish/bearish calls. The `scrape-content-type-tags` change (archived, all tasks done) already classifies discovered URLs as `short | long_video | live_stream` and shows filter toggles in the discovery UI. This change builds on that foundation to make Shorts a first-class content type in the import pipeline, credit system, and post tracking.

## What Changes

### 1. Title/description pre-filter for Shorts (cost saver)

Add a lightweight keyword-based pre-filter that checks video title and description for investment relevance before spending credits on transcription + AI analysis. This is critical for Shorts where KOLs mix investment and non-investment content (cooking, unboxing, vlogs).

- Positive signal keywords (Chinese + English): 股票, 投資, ETF, 財報, bullish, bearish, earnings, etc.
- Negative signal keywords: 開箱, vlog, 日常, unboxing, cooking, travel, etc.
- Only applied to `contentType === 'short'` — long videos have enough transcript context for AI to judge.
- Runs BEFORE transcription, saving Deepgram/Gemini costs on irrelevant Shorts.

### 2. Shorts-optimized transcription path

For Shorts (<=60s), use Gemini `file_uri` (direct YouTube URL) instead of yt-dlp + Deepgram. Gemini can process YouTube URLs without downloading audio, and for <=60s the cost is comparable (~$0.006 Gemini vs $0.009 Deepgram). This avoids the yt-dlp binary dependency for short content. Falls back to Deepgram if Gemini fails.

### 3. Flat credit pricing for Shorts

Current model charges captionless videos at 5 credits/min — a 60s Short costs 5 credits, same as a 60s segment of a 45-min video. Introduce a flat 3-credit cost for captionless Shorts (<=60s), reflecting their lower per-point value but higher frequency. Update fee estimation UI.

### 4. Smart discovery defaults for Shorts-heavy channels

When a channel is primarily Shorts (>60% of discovered URLs), auto-activate the "Short" filter and pre-select all Shorts. Show a localized hint explaining the auto-selection.

### 5. `youtube_short` as a distinct `sourcePlatform`

Add `'youtube_short'` to the `SourcePlatform` union type. This enables separate win rate tracking, UI badges distinguishing Shorts from long videos, and future analytics comparing KOL accuracy across content formats. No DB migration needed — `posts.source_platform` is TEXT.

## Capabilities

### New Capabilities

- `isLikelyInvestmentContent(title, description)` — keyword-based relevance filter for Shorts
- Gemini `file_uri` transcription path for short videos (<=60s)

### Modified Capabilities

- Credit pricing: new `CREDIT_COSTS.short_transcription` flat cost (3 credits)
- Discovery UI: auto-filter behavior for Shorts-heavy channels
- `SourcePlatform` type: `'youtube_short'` added
- Import pipeline: content type routing in `processUrl()`

## Impact

- `src/domain/services/import-pipeline.service.ts` — add pre-filter gate and Shorts transcription routing
- `src/domain/models/user.ts` — add `short_transcription` to `CREDIT_COSTS`
- `src/domain/models/post.ts` — add `'youtube_short'` to `SourcePlatform`
- `src/infrastructure/extractors/types.ts` — add `'youtube_short'` to `sourcePlatform` union
- `src/infrastructure/extractors/youtube.extractor.ts` — pass `contentType` through extraction
- `src/infrastructure/api/gemini.client.ts` — add/expose `geminiTranscribeShort()` using `file_uri`
- `src/components/scrape/url-discovery-list.tsx` — auto-filter logic for Shorts-heavy channels
- `src/domain/services/content-filter.ts` — new file for keyword pre-filter utility
- `docs/URL_FETCHER_OUTPUT_SPEC.md` — update `sourcePlatform` values

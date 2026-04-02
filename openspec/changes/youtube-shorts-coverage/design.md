## Context

The import pipeline (`import-pipeline.service.ts`) currently treats all YouTube videos identically: extract via `YouTubeExtractor` -> if no captions, download audio via yt-dlp -> transcribe via Deepgram Nova-3 -> AI analysis via Gemini. Credit cost is `video_transcription_per_min` (5 credits/min) for captionless videos, `youtube_caption_analysis` (2 credits) for captioned ones.

The `scrape-content-type-tags` change already classifies discovered URLs as `short | long_video | live_stream` using YouTube Data API `contentDetails.duration`. The `DiscoveredUrl` interface has `contentType` and `durationSeconds` fields. Content type filter toggles exist in the discovery UI. However, once a URL enters the import pipeline via `processUrl()`, the content type is not used — all URLs follow the same processing path regardless of type.

The `UrlFetchResult` from `YouTubeExtractor.extract()` returns `sourcePlatform: 'youtube'` for all videos, with `durationSeconds` available from the page HTML parse. The content type classification is only performed in the channel extractor (`youtube-channel.extractor.ts`), not in the single-video extractor.

## Goals / Non-Goals

**Goals:**
- Skip non-investment Shorts before transcription via keyword pre-filter (save credits)
- Route Shorts through Gemini `file_uri` transcription (avoid yt-dlp dependency for short content)
- Flat 3-credit pricing for captionless Shorts (vs 5 credits/min for longer videos)
- Auto-select Shorts filter for Shorts-heavy channels in discovery UI
- Track Shorts as `youtube_short` source platform for separate win rate analysis

**Non-Goals:**
- Changing how long videos or live streams are processed
- Modifying the Gemini sentiment/argument analysis pipeline (downstream AI stays the same)
- Adding new extractor classes (the existing `YouTubeExtractor` handles Shorts URLs fine)
- Persisting content type in a new DB column (we derive it from `source_platform` value)
- Handling non-YouTube Shorts (TikTok, IG Reels, etc.)

## Decisions

### D1: Keyword pre-filter — simple positive/negative word lists

**Decision:** Create a `isLikelyInvestmentContent(title: string, description: string): boolean` utility that checks against two static keyword arrays. The function normalizes input to lowercase and checks for substring matches. Pass if >= 1 positive keyword AND 0 negative keywords are found. Return `true` (pass) if both title and description are empty (cannot filter without metadata).

**Where:** New file `src/domain/services/content-filter.ts`. Called from `processUrl()` in `import-pipeline.service.ts`, gated on content type being `'short'`. The content type is determined from `durationSeconds` on the `UrlFetchResult` (<=60s = short).

**Keyword lists (initial):**

Positive (investment signals):
- Chinese: 股票, 投資, 台積電, 多頭, 空頭, ETF, 財報, 殖利率, 股市, 台股, 美股, 加密, 比特幣, 以太坊, 漲, 跌, 買進, 賣出, 目標價, 本益比
- English: stock, invest, bullish, bearish, earnings, dividend, ETF, crypto, bitcoin, portfolio, market, trading, buy, sell, ticker, PE ratio, target price

Negative (non-investment signals):
- Chinese: 開箱, 日常, 旅遊, 料理, 美食, 穿搭, 化妝
- English: unboxing, vlog, cooking, travel, recipe, makeup, haul, GRWM

**Rationale:** Simple substring matching is sufficient for Shorts titles which are typically short and keyword-rich. No AI needed — this runs at zero cost. The keyword lists can be expanded over time. False negatives (investment Short incorrectly filtered) are acceptable since users can manually import individual URLs. False positives (non-investment Short passes) are caught by the downstream zero-ticker rejection in the AI analysis step.

### D2: Shorts transcription via Gemini `file_uri` with Deepgram fallback

**Decision:** For captionless Shorts (<=60s), attempt Gemini transcription using `file_uri` (YouTube URL) first. If Gemini fails (timeout, quota, API error), fall back to the existing Deepgram path (yt-dlp download + Deepgram Nova-3).

**Implementation:**
```
processUrl() detects short (durationSeconds <= 60)
  ├─ Try youtube-transcript (captions) → if available, use caption text
  ├─ No captions → pre-filter check (isLikelyInvestmentContent)
  │   ├─ Fails filter → skip with 'filtered_not_investment'
  │   └─ Passes filter → transcribe
  │       ├─ Try Gemini file_uri transcription
  │       │   ├─ Success → use transcript
  │       │   └─ Failure → fall back to Deepgram (yt-dlp + Nova-3)
  │       └─ Use transcript for AI analysis
  └─ Continue with sentiment/argument extraction
```

**Gemini `file_uri` approach:** Create `geminiTranscribeShort(youtubeUrl: string): Promise<string>` in `gemini.client.ts`. This sends a `generateContent` request with the YouTube URL as a `fileData` part (using `file_uri` and `mimeType: 'video/*'`). The prompt asks for verbatim transcription only. This is the approach `geminiTranscribeVideo` used before the Deepgram unification — we are re-introducing it specifically for short videos where the file_uri approach works reliably (the socket bug that motivated the switch to Deepgram only manifested on videos >30 min).

**Rationale:** For <=60s videos, Gemini `file_uri` is reliable (no socket timeout issues), costs ~$0.006 (well within free preview quota), and avoids the yt-dlp binary dependency. The Deepgram fallback ensures reliability if Gemini is unavailable. For long videos (>60s), Deepgram remains the sole path — no change.

### D3: Flat 3-credit pricing for captionless Shorts

**Decision:** Add `short_transcription: 3` to `CREDIT_COSTS` in `src/domain/models/user.ts`. When `processUrl()` detects a captionless Short (<=60s, no captions), charge the flat 3 credits instead of `video_transcription_per_min * minutes`. No credit reconciliation needed for Shorts since the cost is flat, not duration-based.

**Credit cost comparison:**

| Scenario | Current | New |
|---|---|---|
| Captioned Short | 2 credits | 2 credits (unchanged) |
| Captionless Short (60s) | 5 credits (1 min * 5) | 3 credits (flat) |
| Captionless Short (30s) | 5 credits (1 min * 5, ceil) | 3 credits (flat) |
| Captionless long video (15 min) | 75 credits | 75 credits (unchanged) |

**Fee estimation update:** The `checkCaptionAvailability()` method and `DiscoveredUrl.estimatedCreditCost` already show per-URL costs in the discovery list. Update the credit calculation to use the flat rate for Shorts. The content type is already available on `DiscoveredUrl` from the channel extractor.

### D4: Auto-filter for Shorts-heavy channels

**Decision:** In `UrlDiscoveryList`, after computing `contentTypeCounts`, if `shorts_count / total_count > 0.6`, initialize `activeFilters` to `new Set(['short'])` instead of all types, and show a localized info banner. The user can still manually toggle filters.

**Implementation:** Move the `activeFilters` initial state computation into a `useMemo` that checks the Shorts ratio on first render. Add a `useState<boolean>` flag `autoFilterApplied` to control showing the hint text. The hint uses the `scrape.discover.shortsAutoFilter` translation key.

### D5: `youtube_short` source platform

**Decision:** Add `'youtube_short'` to the `SourcePlatform` union in `post.ts` and the `sourcePlatform` field in `types.ts` (`UrlFetchResult`). In `processUrl()`, when a Short is detected (<=60s), override `sourcePlatform` to `'youtube_short'` before creating the post. This enables filtering and analytics by content format.

**UI impact:**
- Posts list: show a distinct badge for `youtube_short` (purple, matching the Shorts tag color in discovery)
- Win rate calculations: no code change needed — `sourcePlatform` is already stored per post, filtering by it works automatically
- The `UrlFetchResult.sourcePlatform` type expands but remains backward compatible (TEXT column in DB)

### D6: Content type detection in single-video extractor

**Decision:** The `YouTubeExtractor.extract()` already fetches `durationSeconds` from page HTML. Use this to detect Shorts: if `durationSeconds <= 60`, set `sourcePlatform` to `'youtube_short'` in the returned `UrlFetchResult`. This ensures both discovery (channel extractor) and direct URL import (single-video extractor) produce correct platform types.

## Risks / Trade-offs

- **Keyword pre-filter false negatives**: A Short with an unusual title like "TSMC Q3" won't match if "TSMC" isn't in the keyword list. Mitigated by: making the keyword list comprehensive for major Taiwan/US stocks, and allowing users to import any URL manually (bypassing the filter).
- **Gemini `file_uri` availability**: Gemini's YouTube URL processing may have rate limits or geographic restrictions. Mitigated by the Deepgram fallback path.
- **`youtube_short` platform type**: Existing code that checks `sourcePlatform === 'youtube'` won't match Shorts. Need to audit all such checks and update to `sourcePlatform.startsWith('youtube')` or add `'youtube_short'` to conditions. Key locations: import pipeline credit logic, post repository queries, UI platform icons.
- **Keyword list maintenance**: Static keyword lists will need periodic updates. This is acceptable for MVP — a future change could make these configurable via admin settings or use AI-based classification.

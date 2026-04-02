## Why

Baburra currently supports Twitter/X and YouTube as KOL content sources. Many high-value investment KOLs in Taiwan and globally publish exclusively via podcasts (e.g., 股癌/Gooaye, 財報狗, 投資嗨什麼). These KOLs are unreachable through the existing extractors.

Podcasts are built on open RSS — no scraping complexity, no anti-bot measures, no proxy rotation. A single RSS feed parser simultaneously enables both "Spotify Podcasts" and "Apple Podcasts" as source platforms. A 45-minute investment podcast episode can yield 10-20 arguments with explicit ticker mentions at a lower cost-per-argument than any other platform.

Many investment podcasts already provide transcripts via the Podcasting 2.0 `<podcast:transcript>` RSS tag, making the cost $0 for transcript extraction. When transcripts are unavailable, the existing Deepgram Nova-3 pipeline handles audio transcription.

## What Changes

- **PodcastExtractor (profile-level)**: New `ProfileExtractor` subclass that resolves Spotify show URLs, Apple Podcast URLs, and direct RSS feed URLs to an RSS feed, then discovers episodes. Returns `ProfileExtractResult` with episode URLs as `DiscoveredUrl[]`.
- **PodcastEpisodeExtractor (post-level)**: New `SocialMediaExtractor` subclass that extracts transcript content from a single podcast episode. Implements a three-tier transcript fallback: RSS `<podcast:transcript>` tag → cached transcript from `transcripts` table → Deepgram audio transcription via `<enclosure>` URL.
- **RSS feed resolution**: Apple Podcasts URLs resolved via the free iTunes Lookup API. Spotify URLs resolved via PodcastIndex.org API (free, requires key+secret). Direct RSS feed URLs used as-is.
- **VTT/SRT parser**: Lightweight parser to strip timestamps and speaker labels from VTT/SRT transcript files into plain text. No npm dependency needed.
- **Credit pricing**: Episodes with RSS transcripts cost 2 credits (analysis only, same as captioned YouTube). Episodes needing Deepgram transcription cost 5 credits/minute (aligned with existing `video_transcription_per_min`).
- **Platform registration**: `'podcast'` added to `sourcePlatform` union type, `ExtractorFactory`, profile extractor registry, and `kol_sources` platform support.

## Capabilities

### New Capabilities
- `podcast-extraction`: RSS feed resolution from Spotify/Apple/direct URLs, episode discovery, transcript extraction (three-tier fallback), audio download for Deepgram
- `vtt-parser`: Lightweight VTT/SRT to plain text conversion for RSS transcripts

### Modified Capabilities
- `extractor-factory`: Register `PodcastEpisodeExtractor` alongside twitter and youtube extractors
- `profile-scrape`: Register `PodcastExtractor` in the profile extractor registry, add podcast-specific credit estimation logic
- `data-models`: Add `'podcast'` to `sourcePlatform` union type and `ContentType`; add `'rss_transcript'` to transcript source types
- `credit-system`: Add `podcast_transcript_analysis` (2 credits) cost constant for episodes with existing transcripts

## Impact

- **New files**: `src/infrastructure/extractors/podcast.extractor.ts` (episode-level), `src/infrastructure/extractors/podcast-profile.extractor.ts` (show-level discovery), `src/infrastructure/api/podcast-index.client.ts` (PodcastIndex API), `src/lib/utils/vtt-parser.ts` (VTT/SRT stripping)
- **Modified files**: `src/infrastructure/extractors/types.ts` (sourcePlatform union), `src/infrastructure/extractors/factory.ts` (register podcast), `src/infrastructure/extractors/index.ts` (exports), `src/infrastructure/extractors/profile-extractor.ts` (ContentType), `src/domain/services/profile-scrape.service.ts` (register profile extractor + credit estimation), `src/domain/models/user.ts` (CREDIT_COSTS), `src/infrastructure/repositories/transcript.repository.ts` (source type), `src/components/scrape/url-discovery-list.tsx` (podcast icon + transcript indicator)
- **Environment**: Add `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` to `.env.example`
- **Dependencies**: `fast-xml-parser` npm package for RSS feed parsing (lighter than `rss-parser`)
- **No database migration needed**: `kol_sources.platform` and `posts.source_platform` are TEXT columns — no schema change required.

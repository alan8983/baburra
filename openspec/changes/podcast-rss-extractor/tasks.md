## 1. Type Definitions and Constants

- [ ] 1.1 Add `'podcast'` to `sourcePlatform` union type in `src/infrastructure/extractors/types.ts`.
- [ ] 1.2 Add `'podcast'` to `ContentType` in `src/infrastructure/extractors/profile-extractor.ts` (or add a new `'podcast_episode'` content type if more descriptive).
- [ ] 1.3 Add `'rss_transcript'` to the `Transcript.source` union type in `src/infrastructure/repositories/transcript.repository.ts`.
- [ ] 1.4 Add `podcast_transcript_analysis: 2` to `CREDIT_COSTS` in `src/domain/models/user.ts`.
- [ ] 1.5 Add `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` to `.env.example` with descriptive comments.

## 2. VTT/SRT Parser Utility

- [ ] 2.1 Create `src/lib/utils/vtt-parser.ts` with functions: `parseVttToText()`, `parseSrtToText()`, `parseTranscriptToText()` (routes by MIME type to appropriate parser).
- [ ] 2.2 Add unit tests `src/lib/utils/__tests__/vtt-parser.test.ts` covering: VTT with timestamps and speaker labels, SRT with sequence numbers, plain text passthrough, empty input, malformed input.

## 3. PodcastIndex API Client

- [ ] 3.1 Create `src/infrastructure/api/podcast-index.client.ts` with `searchByTerm(query)` function. Implements PodcastIndex.org auth (SHA-1 HMAC of API key + secret + epoch). Returns `{ feedUrl, podcastGuid, title }[]`.
- [ ] 3.2 Add unit tests `src/infrastructure/api/__tests__/podcast-index.client.test.ts` covering: successful search, empty results, auth header generation, API error handling.

## 4. RSS Feed Resolver

- [ ] 4.1 Create RSS feed resolution functions in the podcast profile extractor (or a separate `src/infrastructure/api/rss-resolver.ts`):
  - `resolveSpotifyToRss(spotifyUrl)`: Fetch Spotify oEmbed for show name → PodcastIndex search → return `feedUrl`.
  - `resolveAppleToRss(appleUrl)`: Extract numeric ID from URL → iTunes Lookup API (`https://itunes.apple.com/lookup?id={id}&entity=podcast`) → return `results[0].feedUrl`.
  - `resolveToRssFeed(url)`: Route to Spotify/Apple/direct-RSS resolver based on URL pattern.
- [ ] 4.2 Add unit tests for each resolver: Spotify URL parsing + oEmbed + PodcastIndex chain, Apple URL parsing + iTunes lookup, direct RSS URL passthrough, invalid URL handling.

## 5. Podcast Profile Extractor (Show Discovery)

- [ ] 5.1 Create `src/infrastructure/extractors/podcast-profile.extractor.ts` extending `ProfileExtractor`:
  - `platform: 'podcast'`
  - `isValidProfileUrl(url)`: Match Spotify show URLs, Apple Podcast show URLs, and direct RSS feed URLs (`.xml`, `.rss`, or known feed hosts).
  - `extractProfile(url)`: Resolve to RSS feed → parse feed XML with `fast-xml-parser` → extract show metadata (`<itunes:author>`, `<itunes:image>`, `<title>`) → extract episodes → pre-filter by investment keywords → return `ProfileExtractResult`.
- [ ] 5.2 Implement episode discovery from RSS feed: parse `<item>` elements, extract `<title>`, `<enclosure>`, `<pubDate>`, `<itunes:duration>`, `<podcast:transcript>` tag presence. Limit to N most recent episodes (default 10). Build `DiscoveredUrl[]` with synthetic `podcast-rss://` URL encoding.
- [ ] 5.3 Implement investment relevance pre-filter: reuse existing keyword matching (stock tickers, investment terms in Chinese/English) against episode title and description. Skip obviously non-investment episodes.
- [ ] 5.4 Add credit estimation per episode: check for `<podcast:transcript>` tag presence → 2 credits if present, otherwise estimate from `<itunes:duration>` × `video_transcription_per_min` rate.
- [ ] 5.5 Add unit tests `src/infrastructure/extractors/__tests__/podcast-profile.extractor.test.ts`: URL validation patterns (Spotify, Apple, RSS), RSS feed parsing with mock XML, episode discovery with limit, keyword pre-filtering, credit estimation with/without transcript tag.

## 6. Podcast Episode Extractor (Content Extraction)

- [ ] 6.1 Create `src/infrastructure/extractors/podcast.extractor.ts` extending `SocialMediaExtractor`:
  - `platform: 'podcast'`
  - `isValidUrl(url)`: Match `podcast-rss://` scheme URLs.
  - `extract(url, config)`: Decode episode URL → three-tier transcript extraction → return `UrlFetchResult`.
- [ ] 6.2 Implement URL encoding/decoding: `encodeEpisodeUrl(feedUrl, episodeGuid)` → `podcast-rss://{base64(feedUrl)}#{episodeGuid}` and reverse `decodeEpisodeUrl(url)` → `{ feedUrl, episodeGuid }`.
- [ ] 6.3 Implement three-tier transcript fallback:
  - Tier 1: Fetch RSS feed → find `<item>` by GUID → check `<podcast:transcript url="..." type="...">` → fetch VTT/SRT → parse to plain text via vtt-parser.
  - Tier 2: Check `transcripts` table via `findTranscriptByUrl(sourceUrl)`.
  - Tier 3: Download audio from `<enclosure url>` into memory buffer → call `deepgramTranscribe(buffer, mimeType)`.
- [ ] 6.4 Implement duration guard: skip episodes longer than 90 minutes (configurable via constant). Return an error or empty content with appropriate message.
- [ ] 6.5 Cache transcripts after extraction: call `saveTranscript()` with `source: 'rss_transcript'` (Tier 1) or `source: 'deepgram'` (Tier 3).
- [ ] 6.6 Add unit tests `src/infrastructure/extractors/__tests__/podcast.extractor.test.ts`: URL encoding/decoding, Tier 1 transcript fetch + VTT parsing, Tier 2 cache hit, Tier 3 Deepgram fallback (mocked), duration guard, error handling.

## 7. Factory and Registry Integration

- [ ] 7.1 Register `PodcastEpisodeExtractor` in `ExtractorFactory` (`src/infrastructure/extractors/factory.ts`): import and register in constructor.
- [ ] 7.2 Register `PodcastProfileExtractor` in the profile extractor registry in `src/domain/services/profile-scrape.service.ts`: add to `profileExtractors` array.
- [ ] 7.3 Update `src/infrastructure/extractors/index.ts` to export new extractors and types.
- [ ] 7.4 Update `discoverProfileUrls()` in `profile-scrape.service.ts` to handle `platform === 'podcast'`: enrich `DiscoveredUrl[]` with credit estimates based on transcript availability (already computed in step 5.4).

## 8. Install Dependencies and Environment

- [ ] 8.1 Install `fast-xml-parser` npm package: `npm install fast-xml-parser`.
- [ ] 8.2 Verify `.env.local` has `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` set (or note that Spotify resolution will fail without them — Apple and direct RSS still work).

## 9. UI Updates

- [ ] 9.1 Update `src/components/scrape/url-discovery-list.tsx`: add podcast icon for `platform === 'podcast'`, show transcript availability indicator ("有逐字稿" vs "需轉錄") per episode, display estimated credits.
- [ ] 9.2 Update any platform icon/label mappings to include `'podcast'` with appropriate icon (e.g., Headphones or Mic icon from lucide-react).

## 10. Integration Testing

- [ ] 10.1 Run `npm run type-check` to verify all type changes compile cleanly.
- [ ] 10.2 Run `npm test` to verify all new and existing unit tests pass.
- [ ] 10.3 Manual smoke test: paste a known podcast RSS feed URL (e.g., a public investment podcast) into the scrape page, verify episode discovery, select an episode with a transcript, verify content extraction and AI analysis flow.

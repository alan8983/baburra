## Context

Baburra supports Twitter/X and YouTube KOL content extraction. The extractor architecture has two hierarchies: `SocialMediaExtractor` (single post content extraction) and `ProfileExtractor` (profile-level URL discovery). Both register in their respective registries and feed into the import pipeline via `profile-scrape.service.ts` and `import-pipeline.service.ts`.

Transcripts are cached in the `transcripts` table keyed by `source_url`, with `source` indicating how the transcript was obtained (`caption`, `gemini`, `deepgram`). The Deepgram Nova-3 client (`deepgram.client.ts`) accepts audio buffers and returns formatted text.

The `kol_sources` table uses a TEXT `platform` column, and `posts.source_platform` / `UrlFetchResult.sourcePlatform` use a TypeScript union type — both are extensible without migration.

## Goals / Non-Goals

**Goals:**
- Resolve Spotify show URLs, Apple Podcast URLs, and direct RSS feed URLs to RSS feeds
- Discover recent episodes from RSS feeds with investment relevance pre-filtering
- Extract transcripts with three-tier fallback: RSS transcript tag → cached → Deepgram audio
- Integrate into the existing profile scrape and import pipeline flows
- Show credit cost estimates with transcript availability indicators in discovery UI

**Non-Goals:**
- Video podcast support (treat all episodes as audio-only)
- Auto-discovery of investment podcasts (user provides the URL)
- Paid/subscriber-only podcast episodes (private RSS feeds)
- Apple Podcasts auto-generated transcript scraping
- Podcast analytics or play counts
- Building a custom RSS feed aggregator or refresh loop (use existing monitoring cron)

## Decisions

### D1: Use PodcastIndex.org API for Spotify-to-RSS resolution

**Decision**: Use the PodcastIndex.org API to resolve Spotify show URLs to RSS feed URLs, rather than requiring users to find and paste RSS URLs manually.

**Rationale**: Spotify's Web API does not expose RSS feed URLs. PodcastIndex is a free, open podcast directory that indexes most public podcasts. It provides a `search/byterm` endpoint that can find podcasts by name (extracted from Spotify's oEmbed). The API requires a free key+secret pair (registered at podcastindex.org/api). This provides a seamless UX: paste Spotify link, get episodes.

**Alternative considered**: Require users to manually find and paste RSS feed URLs. Rejected because it creates friction and most users don't know how to find podcast RSS URLs. However, direct RSS URL input IS supported as a fallback.

### D2: Use `fast-xml-parser` for RSS parsing (not `rss-parser`)

**Decision**: Use `fast-xml-parser` for RSS/XML feed parsing rather than the more popular `rss-parser` package.

**Rationale**: `fast-xml-parser` is a general-purpose XML parser with no dependencies (70KB), while `rss-parser` pulls in `xml2js` and its dependency tree. `fast-xml-parser` also handles the Podcasting 2.0 namespace (`podcast:transcript`) natively through attribute parsing, whereas `rss-parser` requires custom field configuration for non-standard RSS elements. The project already needs to parse custom RSS extensions, making a lower-level XML parser more appropriate.

### D3: Three-tier transcript fallback with cost differentiation

**Decision**: Implement transcript extraction as a three-tier fallback chain:
1. **RSS `<podcast:transcript>` tag** → Fetch VTT/SRT → Parse to plain text (cost: 2 credits)
2. **Cached transcript** in `transcripts` table → Return cached content (cost: 2 credits)
3. **Deepgram audio transcription** → Download audio via `<enclosure>` URL → Send buffer to `deepgramTranscribe()` (cost: 5 credits/minute)

**Rationale**: Many Podcasting 2.0 compliant feeds include `<podcast:transcript>` tags pointing to VTT/SRT files. Fetching and parsing these is essentially free. Deepgram transcription at $0.0077/min is the fallback when no transcript exists. The credit pricing mirrors YouTube: captioned content = 2 credits (analysis only), uncaptioned = 5 credits/min (transcription + analysis).

### D4: Episode-level extractor as SocialMediaExtractor subclass

**Decision**: Create `PodcastEpisodeExtractor` extending `SocialMediaExtractor` to handle individual episode URLs, separate from the `PodcastProfileExtractor` that handles show-level discovery.

**Rationale**: This follows the same pattern as YouTube: `YouTubeChannelExtractor` (ProfileExtractor) discovers video URLs, then `YouTubeExtractor` (SocialMediaExtractor) extracts content from each video. For podcasts, the profile extractor discovers episode RSS entries (represented as RSS feed URL + episode GUID), and the episode extractor fetches the transcript content. The episode extractor receives the RSS feed URL with an episode identifier fragment (e.g., `https://feeds.example.com/podcast.xml#episode-guid`) so it can locate the specific `<item>` element.

### D5: Buffer audio in memory for Vercel serverless compatibility

**Decision**: Download podcast audio files directly into memory buffers, never to disk.

**Rationale**: Vercel serverless functions have read-only filesystems (except `/tmp` which is limited and ephemeral). The existing Deepgram client already accepts `Buffer` inputs. Podcast audio files are typically 20-80MB for a 30-60 minute episode in MP3 format, which fits within Vercel's 1GB memory limit. For episodes exceeding 90 minutes (configurable), skip transcription entirely to avoid memory and cost issues.

### D6: Episode URL encoding scheme

**Decision**: Represent discovered podcast episodes as URLs in the format `podcast-rss://{base64(feedUrl)}#{episodeGuid}` for internal routing, while storing the actual episode audio URL and feed URL in the `DiscoveredUrl` metadata.

**Rationale**: The extractor factory routes by URL pattern. Podcast episodes don't have a single canonical URL — they have an RSS feed URL, an audio enclosure URL, and optionally platform-specific URLs. Using a synthetic `podcast-rss://` scheme lets the factory route to `PodcastEpisodeExtractor`, while the actual feed URL and episode GUID are encoded for lookup. The `DiscoveredUrl.url` field stores this synthetic URL, while metadata fields carry the human-readable title and publish date.

**Alternative considered**: Using the `<enclosure>` audio URL directly. Rejected because audio URLs are CDN links that don't identify the episode within the feed context, and the extractor needs both the feed URL and episode GUID to locate the transcript tag.

## Component Design

### PodcastProfileExtractor (`src/infrastructure/extractors/podcast-profile.extractor.ts`)

```
ProfileExtractor subclass
├── isValidProfileUrl(url) → matches Spotify show, Apple Podcast, direct RSS patterns
├── extractProfile(url) → resolveToRssFeed() → parseRssFeed() → ProfileExtractResult
│   ├── resolveToRssFeed(url):
│   │   ├── Spotify: fetch oEmbed for show name → PodcastIndex search → feedUrl
│   │   ├── Apple: iTunes Lookup API → feedUrl
│   │   └── Direct RSS: use URL as-is
│   ├── parseRssFeed(feedXml):
│   │   ├── Extract show metadata (title, author, artwork)
│   │   ├── Extract episodes (<item> elements), limit to N most recent
│   │   ├── Pre-filter by title/description keywords (investment relevance)
│   │   └── Return DiscoveredUrl[] with title, publishedAt, contentType, credit estimate
│   └── Returns: { kolName, kolAvatarUrl, platformId, platformUrl, postUrls, discoveredUrls }
```

### PodcastEpisodeExtractor (`src/infrastructure/extractors/podcast.extractor.ts`)

```
SocialMediaExtractor subclass
├── platform: 'podcast'
├── isValidUrl(url) → matches podcast-rss:// scheme
├── extract(url, config) → decodeEpisodeUrl() → fetchTranscript() → UrlFetchResult
│   ├── decodeEpisodeUrl(url) → { feedUrl, episodeGuid }
│   ├── fetchTranscript(feedUrl, episodeGuid):
│   │   ├── Tier 1: Parse feed XML → find <item> → check <podcast:transcript> → fetch VTT → parse
│   │   ├── Tier 2: Check transcripts table cache
│   │   └── Tier 3: Download <enclosure> audio → deepgramTranscribe(buffer, mimeType)
│   └── Returns: UrlFetchResult { content, sourceUrl, sourcePlatform: 'podcast', ... }
```

### PodcastIndex Client (`src/infrastructure/api/podcast-index.client.ts`)

```
Functions:
├── searchByTerm(query: string) → { feedUrl, podcastGuid, title }[]
│   GET https://api.podcastindex.org/api/1.0/search/byterm?q={query}
│   Auth: X-Auth-Key + X-Auth-Date + Authorization (SHA-1 HMAC)
```

### VTT Parser (`src/lib/utils/vtt-parser.ts`)

```
Functions:
├── parseVttToText(vttContent: string) → string
│   Strip WEBVTT header, timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm), speaker labels
│   Concatenate text segments with spaces, collapse whitespace
├── parseSrtToText(srtContent: string) → string
│   Strip sequence numbers, timestamps, concatenate text
├── parseTranscriptToText(content: string, type: 'text/vtt' | 'application/srt' | 'text/plain') → string
│   Route to appropriate parser based on MIME type
```

### Integration with profile-scrape.service.ts

```
profileExtractors array:
  [youtubeChannelExtractor, twitterProfileExtractor, podcastProfileExtractor]  // add podcast

discoverProfileUrls():
  if extractor.platform === 'podcast':
    // Credit estimation: check each episode for transcript availability
    // Episodes with <podcast:transcript> → 2 credits (podcast_transcript_analysis)
    // Episodes without transcript → estimate from <itunes:duration> × video_transcription_per_min
```

### Data Flow

```
User pastes Spotify/Apple/RSS URL
  → discoverProfileUrls() → PodcastProfileExtractor.extractProfile()
    → resolveToRssFeed() → parseRssFeed() → DiscoveredUrl[]
  → UI shows episodes in UrlDiscoveryList with transcript indicators
  → User selects episodes → initiateScrape()
    → For each episode URL: processUrl() → PodcastEpisodeExtractor.extract()
      → Three-tier transcript extraction → content string
      → AI analysis pipeline (existing) → Post creation
```

## Why

When scraping a YouTube channel, all discovered URLs are presented as an undifferentiated list. Users cannot tell which are long-form videos, Shorts, live streams, or community posts — and cannot filter by content type. This makes it hard to select the right content for analysis (e.g., skip Shorts that rarely contain investment opinions, or focus on long videos where detailed arguments live).

## What Changes

- **Classify discovered URLs by content type**: Detect and tag each URL as one of: `long_video`, `short`, `live_stream`, or `community_post`
- **Show content type tags in the URL discovery list** (Step 2): Display a colored tag/badge next to each URL indicating its type
- **Add filter toggles**: Allow users to filter the discovery list by content type tags (e.g., show only long videos, hide Shorts)
- **Expand YouTube channel discovery**: Currently only discovers long-form videos via `type: 'video'` search. Add discovery of Shorts and community posts from the channel page.

## Capabilities

### New Capabilities

_(none — this extends existing scrape discovery, not a new standalone capability)_

### Modified Capabilities

_(none — no spec-level behavior changes, only enriched metadata and UI filtering)_

## Impact

- `src/infrastructure/extractors/youtube.extractor.ts` — add content type detection logic; expand `fetchVideoIds` to also discover Shorts and community posts
- `src/domain/services/profile-scrape.service.ts` — pass content type through `DiscoveredUrl`
- `src/components/scrape/url-discovery-list.tsx` — render content type tags and filter toggles
- `src/hooks/use-scrape.ts` — extend `DiscoveredUrl` type with `contentType` field
- `POST /api/scrape/discover` response shape gains `contentType` per URL (additive, non-breaking)

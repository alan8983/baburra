## Context

The YouTube channel extractor (`youtube-channel.extractor.ts`) discovers videos via the YouTube Data API v3 Search endpoint (`type: 'video'`) and fetches metadata via the Videos endpoint (`part=snippet`). Currently, the Videos endpoint request does not include `part=contentDetails`, which contains `duration` (ISO 8601, e.g. `PT1M30S`) and `liveBroadcastContent` (`none` / `live` / `upcoming`). Without this data, all URLs appear identical in the discovery list.

Community posts are a separate content type on YouTube that don't have video IDs — they live under the channel's "Community" tab and use a different URL format (`/post/<id>`). These are out of scope for initial implementation (they require scraping the channel page HTML as there's no public API for community posts).

## Goals / Non-Goals

**Goals:**
- Classify each discovered URL as `long_video` | `short` | `live_stream` in the discovery response
- Show a colored content type tag on each URL in the discovery list UI
- Allow filtering the discovery list by content type via toggle buttons
- Determine content type from the YouTube Data API (no extra API calls)

**Non-Goals:**
- Discovering community posts (no public API, would require HTML scraping)
- Discovering Shorts separately from videos (the Search API `type: 'video'` already includes Shorts — they're just short-duration videos)
- Changing how content is processed after selection (the import pipeline handles all YouTube URLs the same)

## Decisions

### 1. Content type classification logic

**Decision:** Determine content type from `contentDetails.duration` and `snippet.liveBroadcastContent`:
- `short`: duration ≤ 60 seconds AND not a live broadcast
- `live_stream`: `liveBroadcastContent === 'live'` or `liveBroadcastContent === 'upcoming'`, OR the video was a past live stream (detected via `liveStreamingDetails` if available)
- `long_video`: everything else (default)

**Rationale:** YouTube Shorts are defined as vertical videos ≤ 60 seconds. The Search API already returns them alongside regular videos when using `type: 'video'`. We don't need a separate discovery step — just classify after fetching. For live streams, `liveBroadcastContent` in the snippet tells us if a video is currently live or was a live broadcast.

### 2. Fetch `contentDetails` alongside `snippet`

**Decision:** Change `fetchVideoSnippets` to request `part=snippet,contentDetails` instead of just `part=snippet`. Parse `contentDetails.duration` (ISO 8601 like `PT12M30S`) to get seconds, and read `snippet.liveBroadcastContent` for live detection.

**Rationale:** This is a single parameter change on an already-made API call — zero extra quota cost. The `contentDetails` part provides duration which we already need for credit estimation (currently fetched separately via page HTML in `checkCaptionAvailability`). This also means we can skip the expensive per-URL page HTML fetch for duration.

### 3. Add `contentType` to `DiscoveredUrl` interface

**Decision:** Extend `DiscoveredUrl` with `contentType?: 'long_video' | 'short' | 'live_stream'`. Default to `long_video` if not set (backward compatible). Twitter URLs don't need this field.

### 4. Filter UI: toggle buttons above the list

**Decision:** Add a row of toggle buttons (pill-shaped, similar to tag filters) above the URL list: `All` | `Long Video` | `Short` | `Live Stream`. Each button shows the count. Active filters are highlighted. Multiple filters can be active simultaneously. Default: all selected.

**Rationale:** Toggle buttons are more discoverable than a dropdown for 3-4 options. Showing counts helps users understand the content distribution before selecting. The `All` toggle is a convenience shortcut.

## Risks / Trade-offs

- **ISO 8601 duration parsing** — Need a parser for `PT1H2M30S` format. Can use a simple regex instead of a library: `/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/`.
- **Live stream detection accuracy** — Past live streams that are now VODs may have `liveBroadcastContent: 'none'`. We could miss these, but that's acceptable — they're effectively long videos at that point.
- **Community posts deferred** — Users may expect these, but there's no clean API for them. Can revisit if demand arises.

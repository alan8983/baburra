## 1. Extend data model and API

- [x] 1.1 Add `contentType?: 'long_video' | 'short' | 'live_stream'` to the `DiscoveredUrl` interface in `profile-extractor.ts`
- [x] 1.2 Add an ISO 8601 duration parser utility (regex-based: `PT1H2M30S` → seconds). Place in a shared util or inline in the extractor.

## 2. Classify content type in YouTube channel extractor

- [x] 2.1 Change `fetchVideoSnippets` in `youtube-channel.extractor.ts` to request `part=snippet,contentDetails` instead of `part=snippet`
- [x] 2.2 Parse `contentDetails.duration` to get `durationSeconds` and `snippet.liveBroadcastContent` to detect live streams
- [x] 2.3 Classify each video: `short` if ≤60s and not live, `live_stream` if `liveBroadcastContent` is `live`/`upcoming`, otherwise `long_video`
- [x] 2.4 Include `contentType` and `durationSeconds` in the returned `DiscoveredUrl[]`

## 3. Pass content type through discovery flow

- [x] 3.1 Update `DiscoverProfileResult` type in `use-scrape.ts` to include `contentType` in the discovered URL shape
- [x] 3.2 Verify the `/api/scrape/discover` response passes `contentType` through without changes (it should flow from extractor → service → API → frontend automatically)

## 4. Content type tags in URL discovery list

- [x] 4.1 Add a content type badge/tag to each URL row in `UrlDiscoveryList`: colored pill showing "Long Video", "Short", or "Live Stream"
- [x] 4.2 Add filter toggle buttons above the URL list: `All` | `Long Video (N)` | `Short (N)` | `Live Stream (N)` with counts
- [x] 4.3 Implement filter state: multiple toggles can be active, `All` is a convenience toggle. Filtered-out URLs are hidden but retain their selection state.
- [x] 4.4 Update the "Select All" / "Deselect All" toggle to only affect currently visible (filtered) URLs

## 5. Verify

- [ ] 5.1 Test discovery with a YouTube channel that has a mix of long videos and Shorts — verify tags appear correctly
- [ ] 5.2 Test filter toggles — verify selecting/deselecting filters updates the list and credit estimation

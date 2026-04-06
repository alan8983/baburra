## 1. Probe helper

- [ ] 1.1 Add `probeDurationFromEnclosure(enclosureUrl, mimeType)` to `src/infrastructure/extractors/podcast-profile.extractor.ts` (or a new sibling module). Returns `{ durationSeconds: number } | { durationSeconds: null }`.
- [ ] 1.2 Implement bitrate selection: `audio/mpeg` → 128 kbps, `audio/aac`/`audio/mp4` → 64 kbps, default → 96 kbps. Allow override via env (`PODCAST_BITRATE_MPEG`, etc.).
- [ ] 1.3 Use a 5s HTTP timeout. Treat any non-200 status, missing `Content-Length`, or timeout as "unknown".
- [ ] 1.4 Unit tests covering: success path (returns rounded seconds), missing header (returns null), HEAD rejected (returns null), per-type bitrate selection.

## 2. Extractor integration

- [ ] 2.1 Update `estimateCreditCost` (or its successor returning a recipe under `rework-credit-cost-lego`) to call the probe when `<itunes:duration>` is missing/unparseable.
- [ ] 2.2 Remove the `30 * CREDIT_COSTS.video_transcription_per_min` fallback. If both itunes-duration and the probe fail, return `durationKnown: false` with the partial recipe.
- [ ] 2.3 Add `durationKnown` and `capCredits` fields to the discovery result type.

## 3. UI

- [ ] 3.1 `src/components/scrape/url-discovery-list.tsx` — for `durationKnown: false` rows, render a "duration unknown — confirm to import up to N credits" affordance with a cap input that defaults to the 90-minute equivalent.
- [ ] 3.2 Block auto-import for unknown-duration rows; require explicit per-row confirmation.
- [ ] 3.3 i18n keys for the new affordance in `src/messages/{zh-TW,en}/scrape.json` (or `common.json`).

## 4. Telemetry

- [ ] 4.1 Add a structured log line every time the probe is invoked (with outcome: itunes-known / probe-success / probe-unknown). No PII.
- [ ] 4.2 Optional: surface counts on an internal dashboard. Out of scope if no dashboard exists yet — skip and just log.

## 5. Spec + tests

- [ ] 5.1 Write `specs/podcast-discovery/spec.md` with the requirements added in this change.
- [ ] 5.2 Integration test: discovery on a fixture RSS feed with one episode missing `<itunes:duration>` returns `durationKnown: false`; another with a valid header returns `durationKnown: true`.
- [ ] 5.3 `npm run lint && npm run type-check && npm test` clean.

## 6. Rollout

- [ ] 6.1 Wait for `rework-credit-cost-lego` to merge before starting.
- [ ] 6.2 Manually exercise on a known duration-less feed before merge.
- [ ] 6.3 Archive with `/opsx:archive podcast-duration-probe`.

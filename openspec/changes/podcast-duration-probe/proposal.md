## Why

`podcast-profile.extractor.estimateCreditCost` (`src/infrastructure/extractors/podcast-profile.extractor.ts:264`) falls back to "assume 30 minutes" whenever an RSS feed omits or mis-formats `<itunes:duration>`. Today this is mostly cosmetic — the flat `5/min` legacy rate makes the fallback wrong by a few credits at most. After `rework-credit-cost-lego` lands, the discovery quote becomes the **billing-relevant number** the user sees before confirming an import. A wrong fallback turns into a real billing surprise on the small set of feeds that lack the tag (hand-rolled feeds, very old shows, some Substack audio).

## What Changes

- **HEAD-probe the audio enclosure** during discovery when `<itunes:duration>` is missing or unparseable. Divide `Content-Length` by an assumed bitrate (~128 kbps for MP3, ~64 kbps for spoken-word AAC) to derive an estimated duration in seconds. Cache the probe result on the discovery row so it isn't repeated on confirm.
- **Surface "unknown duration" UX** when even the HEAD probe fails (no `Content-Length`, host doesn't allow HEAD, etc.). The episode is shown with an explicit "duration unknown — confirm to import up to N credits cap" affordance instead of a guessed number. Default cap = 90 minutes worth of `transcribe.audio` credits, configurable.
- **Remove the silent 30-minute fallback** in `estimateCreditCost`. If duration is unknown after the probe, the extractor SHALL return a recipe marked `durationKnown: false` and the UI SHALL render the capped-quote affordance.
- **Telemetry** — log how often the HEAD probe fires and how often it falls back to "unknown" so we know whether the cap-affordance edge case is rare or worth more investment.

## Capabilities

### Modified Capabilities
- `ai-pipeline` / podcast extraction: discovery duration estimation gets a HEAD-probe step and an explicit unknown-duration state.

## Impact

- **Extractors**: `src/infrastructure/extractors/podcast-profile.extractor.ts` — new `probeDurationFromEnclosure(url)` helper, modified `estimateCreditCost`, modified result type to include `durationKnown: boolean`.
- **UI**: `src/components/scrape/url-discovery-list.tsx` — render the capped-quote affordance for `durationKnown: false` rows; user confirmation is required, no auto-import.
- **Tests**: unit tests for `probeDurationFromEnclosure` (success, missing `Content-Length`, HEAD rejected) and an integration test for the discovery flow with a duration-less feed fixture.
- **No DB migration.** Probe result is in-memory only.
- **Depends on:** `rework-credit-cost-lego` (uses `transcribe.audio` block and the recipe contract). File this change but do not start `/opsx:apply` until the lego change is merged.

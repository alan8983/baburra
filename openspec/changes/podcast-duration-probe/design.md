## Context

Podcast RSS feeds usually carry `<itunes:duration>` (seconds, `MM:SS`, or `HH:MM:SS`). Today's parser handles all three. The fallback at `podcast-profile.extractor.ts:272` is `30 * CREDIT_COSTS.video_transcription_per_min` — a silent guess. Under the lego model, that guess is what the user sees as a quote, and we charge the actual minutes after the fact, so a wrong guess can become a complaint.

## Goals / Non-Goals

**Goals:**
- No silent duration guesses at quote time.
- Recover real duration cheaply (HEAD request, no audio download) when possible.
- When recovery fails, be explicit about the unknown and let the user opt in with a cap.

**Non-Goals:**
- Downloading the audio just to read its container metadata. Too expensive for discovery.
- A perfect bitrate model. ~128 kbps is good enough for MP3; we accept ±20% error on the estimate.
- Backfilling durations into a long-term cache or DB column.

## Decisions

### D1: HEAD-probe with bitrate division, not partial download
**Decision:** Send `HEAD` to the enclosure URL, read `Content-Length`, divide by `bitrateBytesPerSecond` (default `128_000 / 8 = 16000`). Round to nearest second.

**Rationale:** Free, fast, respects host bandwidth. Ranged GET to read MP3 frame headers would be more accurate but adds complexity for marginal gain.

### D2: Per-format bitrate defaults
**Decision:** Pick bitrate from the enclosure `type`: `audio/mpeg` → 128 kbps, `audio/aac`/`audio/mp4` → 64 kbps, otherwise 96 kbps. All overridable via env.

**Rationale:** Spoken-word AAC is typically encoded lower than music MP3. Using one constant over-estimates AAC duration significantly.

### D3: Explicit `durationKnown: false` state instead of fallback number
**Decision:** When the probe also fails, the extractor returns `{ durationSeconds: null, durationKnown: false, recipe: <recipe omitting transcribe.audio>, capCredits: <cap> }`. The UI must show the cap and require user confirmation before importing.

**Rationale:** No silent guesses. The lego model's contract is "the quote you see is what you'll be charged ±rounding"; a guess violates that.

### D4: Cap default = 90 minutes of `transcribe.audio`
**Decision:** Default cap = `composeCost([{ block: 'transcribe.audio', units: 90 }])` plus the rest of the recipe. Configurable per-tier later if needed.

**Rationale:** 90 minutes covers the long tail of investment podcasts. Users with longer episodes can raise the cap on confirm.

### D5: No persistence of probe results
**Decision:** Probe results live in the discovery response only. Confirm step re-uses them via the request payload, not via cache.

**Rationale:** Avoids cache invalidation. Discovery is cheap to re-run.

## Risks / Trade-offs

**[Risk] Hosts that block HEAD or omit `Content-Length`** — common for some streaming hosts. Handled by the unknown-duration affordance.

**[Risk] Bitrate assumption wrong** — over-estimates AAC by ~2x at 128 kbps default; D2 mitigates by per-type defaults.

**[Trade-off] User friction for unknown-duration episodes** — they have to click through a cap dialog. Acceptable because today they get a silent wrong number; explicit friction is better than implicit error.

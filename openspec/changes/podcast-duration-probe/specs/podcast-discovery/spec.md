## ADDED Requirements

### Requirement: Podcast discovery probes audio length when RSS duration is missing
When an RSS item omits `<itunes:duration>` or the value cannot be parsed, the system SHALL send an HTTP `HEAD` request to the episode's audio enclosure URL and derive an estimated duration from the `Content-Length` header divided by a per-mime-type bitrate constant. The probe SHALL time out after 5 seconds and treat any non-200 response, missing header, or timeout as "duration unknown".

#### Scenario: Missing itunes:duration with valid Content-Length
- **WHEN** an RSS item has no `<itunes:duration>` and `HEAD` on its enclosure URL returns `200 OK` with `Content-Length: 7680000` and `audio/mpeg`
- **THEN** the probe SHALL return ~480 seconds (7,680,000 bytes ÷ 16,000 bytes/sec ≈ 8 minutes)

#### Scenario: HEAD request times out
- **WHEN** the enclosure URL does not respond within 5 seconds
- **THEN** the probe SHALL return null and the discovery row SHALL be marked `durationKnown: false`

### Requirement: Discovery surfaces unknown-duration episodes with a cap
When duration cannot be determined from either the RSS tag or the HEAD probe, the discovery result SHALL set `durationKnown: false` and include a `capCredits` value equal to `composeCost(recipe with transcribe.audio = 90 minutes)`. The UI SHALL render a confirmation affordance for these rows and SHALL NOT auto-import them.

#### Scenario: Episode with no duration source surfaces a cap dialog
- **WHEN** an RSS item has no `<itunes:duration>` and the HEAD probe also fails
- **THEN** the discovery row SHALL include `durationKnown: false` and `capCredits` corresponding to the 90-minute cap; the UI SHALL render a "duration unknown — confirm to import up to N credits" affordance and require explicit confirmation before import

### Requirement: Silent 30-minute fallback removed
The `estimateCreditCost` (or successor) SHALL NOT fall back to a fixed-duration assumption when both the RSS tag and the HEAD probe fail. The user-facing quote SHALL always be either a measured duration or an explicit unknown.

#### Scenario: No silent guess
- **WHEN** duration is unknown after the probe
- **THEN** the discovery result SHALL NOT contain a `transcribe.audio` block sized to a guessed duration; it SHALL instead expose `durationKnown: false`

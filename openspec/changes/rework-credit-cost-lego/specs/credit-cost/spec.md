## ADDED Requirements

### Requirement: Credit block catalogue defines per-step prices
The system SHALL provide a `CREDIT_BLOCKS` constant in `src/domain/models/credit-blocks.ts` that maps every billable step in the import pipeline to a unit credit price and a unit kind (`fixed | per_minute | per_2k_tokens | per_item`). The catalogue SHALL include, at minimum: `scrape.html`, `scrape.youtube_meta`, `scrape.youtube_captions`, `scrape.rss`, `scrape.apify.profile`, `scrape.apify.post`, `download.audio.short`, `download.audio.long`, `transcribe.deepgram`, `transcribe.gemini_audio`, `transcribe.cached_transcript`, `ai.analyze.short`, `ai.analyze.long`, `ai.reroll`.

#### Scenario: Reading a fixed block
- **WHEN** a caller reads `CREDIT_BLOCKS['ai.analyze.short']`
- **THEN** it SHALL return a record with `credits: 1.0` and `unit: 'fixed'`

#### Scenario: Reading a per-minute block
- **WHEN** a caller reads `CREDIT_BLOCKS['transcribe.deepgram']`
- **THEN** it SHALL return a record with `credits: 1.5` and `unit: 'per_minute'`

#### Scenario: Reading the Apify profile discovery block
- **WHEN** a caller reads `CREDIT_BLOCKS['scrape.apify.profile']`
- **THEN** it SHALL return a record with `credits: 2.0` and `unit: 'fixed'`

### Requirement: composeCost sums a recipe into a total credit charge
The system SHALL provide a pure function `composeCost(recipe: Recipe): number` that returns the total credit cost of a recipe, where `Recipe = Array<{ block: BlockId, units: number }>`. The total SHALL be `sum(CREDIT_BLOCKS[item.block].credits * item.units)` computed in floating point, then rounded UP to the nearest integer only at the final return.

#### Scenario: Empty recipe returns zero
- **WHEN** `composeCost([])` is called
- **THEN** it SHALL return `0`

#### Scenario: Single fixed block
- **WHEN** `composeCost([{ block: 'ai.analyze.short', units: 1 }])` is called
- **THEN** it SHALL return `1`

#### Scenario: Per-minute transcription
- **WHEN** `composeCost([{ block: 'transcribe.deepgram', units: 12 }])` is called
- **THEN** it SHALL return `18` (12 × 1.5, ceiling applied at total)

#### Scenario: Composite recipe
- **WHEN** `composeCost([{ block: 'scrape.youtube_meta', units: 1 }, { block: 'download.audio.long', units: 10 }, { block: 'transcribe.deepgram', units: 10 }, { block: 'ai.analyze.long', units: 5 }])` is called
- **THEN** it SHALL return `22` (0.2 + 1.0 + 15.0 + 5.0 = 21.2, ceiling → 22)

### Requirement: Extractors return a recipe alongside the total cost
Every extractor in `src/infrastructure/extractors/` that produces a cost estimate SHALL return a `recipe: Recipe` field on its result type, and its `estimatedCreditCost` SHALL equal `composeCost(recipe)`.

#### Scenario: Facebook single post
- **WHEN** `facebook.extractor` processes a single post URL
- **THEN** it SHALL return a result whose `recipe` is `[{ block: 'scrape.apify.post', units: 1 }, { block: 'ai.analyze.short', units: 1 }]`

#### Scenario: YouTube video with captions
- **WHEN** `youtube.extractor.checkCaptionAvailability` finds captions on a 10-minute video
- **THEN** the returned result's `recipe` SHALL include `scrape.youtube_meta` and `scrape.youtube_captions` and an `ai.analyze.long` entry with `units >= 1`

#### Scenario: Podcast episode with cached transcript
- **WHEN** `podcast.extractor` processes an episode whose RSS item has `<podcast:transcript>`
- **THEN** the recipe SHALL include `scrape.rss`, `transcribe.cached_transcript`, and `ai.analyze.long`, and SHALL NOT include any `transcribe.deepgram` or `transcribe.gemini_audio` entry

### Requirement: Apify profile discovery is charged up-front
The system SHALL charge the `scrape.apify.profile` block to the user's credit balance before dispatching an Apify actor run for Facebook, Twitter/X, Threads, or TikTok profile discovery. The charge SHALL NOT be refunded if the user imports zero items from the discovery result.

#### Scenario: Facebook profile discovery deducts credits
- **WHEN** a user triggers a Facebook profile scrape via `profile-scrape.service`
- **THEN** the service SHALL deduct `composeCost([{ block: 'scrape.apify.profile', units: 1 }])` credits before the Apify actor is dispatched

#### Scenario: Zero imports does not refund discovery
- **WHEN** a user triggers a profile discovery that returns results but imports zero items
- **THEN** the `scrape.apify.profile` charge SHALL remain applied and SHALL NOT be refunded

### Requirement: Legacy CREDIT_COSTS is derived from block totals
The existing `CREDIT_COSTS` export in `src/domain/models/user.ts` SHALL remain available for one release as a deprecated alias, with each numeric value computed from `composeCost` on the equivalent canonical recipe so that callers that have not yet migrated continue to function.

#### Scenario: Deprecated text_analysis alias
- **WHEN** a legacy caller reads `CREDIT_COSTS.text_analysis`
- **THEN** it SHALL equal `composeCost([{ block: 'ai.analyze.short', units: 1 }])`

#### Scenario: Deprecated reroll_analysis alias
- **WHEN** a legacy caller reads `CREDIT_COSTS.reroll_analysis`
- **THEN** it SHALL equal `composeCost([{ block: 'ai.reroll', units: 1 }])`

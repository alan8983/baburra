## MODIFIED Requirements

The following QA requirements assert specific credit numbers that the lego model replaces. They are updated to assert the recipe shape and the `composeCost` total instead of hard-coded constants.

### Requirement: Content type tags in discovery (A4)
The scrape discovery step SHALL show per-URL caption availability and an estimated credit cost computed via `composeCost(recipe)` from the extractor's returned recipe.

#### Scenario: YouTube channel discovery shows cost info
- **WHEN** user enters a YouTube channel URL and reaches the URL discovery list
- **THEN** API response includes `captionAvailable` (boolean), `durationSeconds` (number), `recipe` (Recipe), and `estimatedCreditCost` = `composeCost(recipe)` per URL; UI shows caption icon + credit badge per URL; footer shows total cost vs remaining balance

### Requirement: Text post recipe (B1)
Scraping a text-based post (tweet, article, FB/Threads post) SHALL charge the user `composeCost([{ block: 'scrape.apify.post', units: 1 }, { block: 'ai.analyze.short', units: 1 }])` for Apify-sourced posts, or `composeCost([{ block: 'scrape.html', units: 1 }, { block: 'ai.analyze.short', units: 1 }])` for generic HTML articles.

#### Scenario: Scrape a tweet mentioning a stock ticker
- **WHEN** user scrapes a tweet URL that mentions a stock ticker, with initial `credit_balance = X`
- **THEN** `credit_balance` returns `X - composeCost([{ block: 'scrape.apify.post', units: 1 }, { block: 'ai.analyze.short', units: 1 }])`, and one row exists in `posts` for that `source_url`

### Requirement: YouTube with captions recipe (B2)
Scraping a YouTube video that HAS captions SHALL charge a recipe containing `scrape.youtube_meta`, `scrape.youtube_captions`, and an `ai.analyze.short` or `ai.analyze.long` block sized to the transcript token count, and SHALL cache the caption transcript.

#### Scenario: Scrape YouTube video with captions
- **WHEN** user scrapes a YouTube video with captions, with initial `credit_balance = X`
- **THEN** `credit_balance` decrements by `composeCost(recipe)` where `recipe` contains the three blocks above; `transcripts.source = 'caption'`; server logs show no transcription vendor activity

### Requirement: Captionless YouTube uses transcribe.audio block (B3)
Scraping a YouTube video WITHOUT captions SHALL invoke the transcription service (Deepgram primary, Gemini audio failover) and charge a recipe containing `scrape.youtube_meta`, `download.audio.short` or `download.audio.long`, `transcribe.audio × ⌈minutes⌉`, and an `ai.analyze.*` block. The user SHALL be charged `composeCost(recipe)` regardless of which vendor actually transcribed. The previously specified `ceil(duration/60) * 7` formula is removed.

#### Scenario: Scrape captionless YouTube video (~3 min)
- **WHEN** user scrapes a ~3 min YouTube video without captions, with initial `credit_balance = X`
- **THEN** `credit_balance` decrements by `composeCost([{ block: 'scrape.youtube_meta', units: 1 }, { block: 'download.audio.long', units: 3 }, { block: 'transcribe.audio', units: 3 }, { block: 'ai.analyze.short', units: 1 }])`; `transcripts` row exists with non-empty content and `duration_seconds` matching the video; one `posts` row exists

#### Scenario: Deepgram failover to Gemini audio
- **WHEN** the same scrape occurs but Deepgram returns an error and Gemini audio completes the transcription
- **THEN** the credit charge is identical to the success case (vendor routing is internal); `transcripts.source` MAY indicate the failover vendor for audit purposes

### Requirement: Transcript cache prevents duplicate transcription (B4)
When a transcript already exists in the `transcripts` table, the system SHALL use the cached version and SHALL NOT invoke any transcription vendor. The credit charge SHALL omit any `transcribe.audio` and `download.audio.*` blocks for cache hits.

#### Scenario: Re-scrape same captionless video after deleting post
- **WHEN** user deletes the post from B3 and re-scrapes the same URL
- **THEN** no new transcript row is created; the recipe charged on re-scrape contains only `scrape.youtube_meta`, `transcribe.cached_transcript`, and `ai.analyze.*` (no `transcribe.audio`); no transcription vendor is called

### Requirement: Re-roll analysis recipe (B5)
Re-analyzing a post via `POST /api/ai/analyze` SHALL charge `composeCost([{ block: 'ai.reroll', units: 1 }])`.

#### Scenario: Re-roll analysis on existing post
- **WHEN** user calls `POST /api/ai/analyze` with post content, with initial `credit_balance = X`
- **THEN** `credit_balance = X - composeCost([{ block: 'ai.reroll', units: 1 }])`; API response `usage.remaining` reflects the new balance

## REMOVED Requirements

### Requirement: Video >45 min rejected (C1)
**Reason:** The 45-minute cap was a workaround for unreliable Gemini-audio transcription on long videos. With Deepgram as the primary transcription vendor for all captionless audio regardless of length, the cap is no longer needed. Long videos are charged honestly via `transcribe.audio × ⌈minutes⌉`. A separate operational ceiling (e.g., refuse > 4 hours) MAY be added later as a safety guard, but it is not part of the credit-cost spec.

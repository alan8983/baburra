# qa-standards Specification

## Purpose
TBD - created by archiving change qa-scrape-credit-system. Update Purpose after archive.
## Requirements
### Requirement: Scrape completion detection (A1)
When a scrape job finishes processing all URLs, the system SHALL transition the job to `completed` status, fire a completion toast, and display a summary card.

#### Scenario: YouTube channel scrape completes
- **WHEN** user scrapes a YouTube channel with 1-2 selected URLs and all URLs finish processing
- **THEN** `scrape_jobs.status` = `'completed'`, `scrape_jobs.processed_urls` = `scrape_jobs.total_urls`, `scrape_jobs.completed_at IS NOT NULL`, `kol_sources.scrape_status` = `'completed'`, UI flow chart shows Step 4, toast fires with KOL name and import count

### Requirement: Posts page loads within timeout (A2)
The posts page SHALL render within 10 seconds even when external stock price APIs are slow or unavailable.

#### Scenario: Posts page with slow Tiingo API
- **WHEN** user navigates to `/posts` with 10+ posts that have stock associations
- **THEN** page renders within 10 seconds, posts display price changes where available and graceful "—" for timed-out stocks, server logs show `[enrichPriceChanges] Failed to fetch prices` for slow stocks (expected, not a failure)

### Requirement: Duplicate post rejection (A3)
The system SHALL prevent duplicate posts for the same `(source_url, kol_id)` pair, both via DB constraint and application-level handling.

#### Scenario: Same URL scraped twice for same KOL
- **WHEN** user scrapes the same URL twice for the same KOL
- **THEN** `SELECT count(*) FROM posts WHERE source_url = '<url>' AND kol_id = '<kolId>'` returns exactly 1, second scrape job shows `duplicate_count >= 1`, no unhandled error

### Requirement: Content type tags in discovery (A4)
The scrape discovery step SHALL show per-URL caption availability and an estimated credit cost computed via `composeCost(recipe)` from the extractor's returned recipe.

#### Scenario: YouTube channel discovery shows cost info
- **WHEN** user enters a YouTube channel URL and reaches the URL discovery list
- **THEN** API response includes `captionAvailable` (boolean), `durationSeconds` (number), `recipe` (Recipe), and `estimatedCreditCost` = `composeCost(recipe)` per URL; UI shows caption icon + credit badge per URL; footer shows total cost vs remaining balance

### Requirement: Text post recipe (B1)
Scraping a text-based post (tweet, article, FB/Threads post) SHALL charge `composeCost([{ block: 'scrape.apify.post', units: 1 }, { block: 'ai.analyze.short', units: 1 }])` for Apify-sourced posts, or `composeCost([{ block: 'scrape.html', units: 1 }, { block: 'ai.analyze.short', units: 1 }])` for generic HTML articles.

#### Scenario: Scrape a tweet mentioning a stock ticker
- **WHEN** user scrapes a tweet URL that mentions a stock ticker, with initial `credit_balance = X`
- **THEN** `credit_balance` returns `X - composeCost([{ block: 'scrape.apify.post', units: 1 }, { block: 'ai.analyze.short', units: 1 }])`, and one row exists in `posts` for that `source_url`

### Requirement: YouTube with captions recipe (B2)
Scraping a YouTube video that HAS captions SHALL charge a recipe containing `scrape.youtube_meta`, `scrape.youtube_captions`, and an `ai.analyze.short` or `ai.analyze.long` block sized to the transcript token count, and SHALL cache the caption transcript.

#### Scenario: Scrape YouTube video with captions
- **WHEN** user scrapes a YouTube video with captions, with initial `credit_balance = X`
- **THEN** `credit_balance` decrements by `composeCost(recipe)`; `transcripts.source = 'caption'`; server logs show no transcription vendor activity

### Requirement: Captionless YouTube uses transcribe.audio block (B3)
Scraping a YouTube video WITHOUT captions SHALL invoke the transcription service (Deepgram primary, Gemini audio failover) and charge a recipe containing `scrape.youtube_meta`, `download.audio.short` or `download.audio.long`, `transcribe.audio × ⌈minutes⌉`, and an `ai.analyze.*` block. The user SHALL be charged `composeCost(recipe)` regardless of which vendor actually transcribed.

#### Scenario: Scrape captionless YouTube video (~3 min)
- **WHEN** user scrapes a ~3 min YouTube video without captions, with initial `credit_balance = X`
- **THEN** `credit_balance` decrements by `composeCost([{ block: 'scrape.youtube_meta', units: 1 }, { block: 'download.audio.long', units: 3 }, { block: 'transcribe.audio', units: 3 }, { block: 'ai.analyze.short', units: 1 }])`; `transcripts` row exists with non-empty content; one `posts` row exists

#### Scenario: Deepgram failover to Gemini audio
- **WHEN** the same scrape occurs but Deepgram returns an error and Gemini audio completes the transcription
- **THEN** the credit charge is identical to the success case (vendor routing is internal); `transcripts.source` MAY indicate the failover vendor

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

### Requirement: Insufficient credits blocks operation (B6)
When credit balance is insufficient for an operation, the system SHALL return `INSUFFICIENT_CREDITS` error and NOT create any post or consume any credits.

#### Scenario: Scrape attempt with near-zero balance
- **WHEN** user attempts to scrape a URL that costs N credits, but `credit_balance < N`
- **THEN** API returns 429 with `code: 'INSUFFICIENT_CREDITS'`, `credit_balance` unchanged, `SELECT count(*) FROM posts WHERE source_url = '<url>'` returns 0

### Requirement: Zero-ticker refund (B7)
When AI analysis identifies no stock tickers, the system SHALL refund all consumed credits and NOT create a post.

#### Scenario: Scrape URL with no stock mentions
- **WHEN** user scrapes a URL whose content mentions no stock tickers, with initial `credit_balance = X`
- **THEN** `credit_balance` returns to `X` (full refund), `SELECT count(*) FROM posts WHERE source_url = '<url>'` returns 0, `scrape_jobs.filtered_count >= 1`


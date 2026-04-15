## ADDED Requirements

### Requirement: Per-stock sentiment is emitted for every attached ticker

The AI sentiment-analysis pipeline SHALL populate `post_stocks.sentiment` for every (post, stock) pair it creates. When the Gemini response does not explicitly override per-ticker sentiment, the pipeline MUST default the per-stock value to the post-level sentiment.

#### Scenario: Gemini response omits per-stock sentiments

- **WHEN** the AI analyzes a post that mentions two tickers and the Gemini response includes `sentiment: 2, stockSentiments: {}`
- **THEN** the pipeline writes `post_stocks.sentiment = 2` for both (post, ticker) rows

#### Scenario: Gemini response overrides one ticker

- **WHEN** the AI analyzes a post with `sentiment: 1, stockSentiments: { NVDA: -2 }` and the post mentions `NVDA` and `AMD`
- **THEN** the pipeline writes `post_stocks.sentiment = -2` for NVDA and `post_stocks.sentiment = 1` for AMD

#### Scenario: Single-stock post, silent per-stock payload

- **WHEN** the AI analyzes a single-stock post with `sentiment: -1, stockSentiments: undefined`
- **THEN** the pipeline writes `post_stocks.sentiment = -1` for the sole attached stock

### Requirement: Backfill script restores existing NULL per-stock sentiments

A one-shot maintenance script SHALL exist that updates all historic `post_stocks.sentiment IS NULL` rows to match `posts.sentiment`, using the live write path so that cache invalidation hooks run.

#### Scenario: Dry run reports proposed writes

- **WHEN** an operator runs `npx tsx scripts/backfill-per-stock-sentiment.ts --dry-run`
- **THEN** the script prints the count of rows per KOL and per stock that would be updated and exits without writing

#### Scenario: Commit run updates all NULL rows

- **WHEN** an operator runs `npx tsx scripts/backfill-per-stock-sentiment.ts --commit`
- **THEN** every row in `post_stocks` with `sentiment IS NULL` at the start of the run is updated to its post's `sentiment` value
- **AND** `SELECT COUNT(*) FROM post_stocks WHERE sentiment IS NULL` returns 0 at the end of the run (modulo posts deleted mid-run)

#### Scenario: Commit run invalidates downstream caches

- **WHEN** the backfill script updates the sentiment for any (post, stock) row whose post belongs to KOL `K`
- **THEN** the cached win-rate samples for post `P` are dropped
- **AND** the `kol_scorecard_cache` entry for KOL `K` is marked stale (or deleted) so the next read recomputes

### Requirement: Win-rate calculator treats NULL per-stock sentiment as excluded

The per-stock win-rate classifier SHALL continue to classify a sample as `excluded` when `post_stocks.sentiment IS NULL`. This behavior is documented so future operators understand that a NULL value represents a deliberate absence of per-stock stance, not a bug.

#### Scenario: NULL sentiment sample

- **WHEN** the classifier evaluates a sample with `priceChange = 0.05, sentiment = NULL, threshold = 0.02`
- **THEN** the classifier returns `excluded` (same as `sentiment = 0`)
- **AND** the sample does not count toward `winCount`, `loseCount`, `noiseCount`, or `returnSampleSize`

#### Scenario: All NULL samples for a (KOL, stock) pair

- **WHEN** every `post_stocks.sentiment` for a (KOL, stock) pair is NULL
- **THEN** `bucketsByStock[stockId].dayN.returnSampleSize = 0` for every period
- **AND** the KOL detail page 報酬率統計 card renders dashes (existing behavior; unchanged by this spec)

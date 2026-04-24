## ADDED Requirements

### Requirement: Podcast RSS → Deepgram → Gemini path is end-to-end verified

The podcast profile-scrape path (Spotify / Apple / direct RSS URL → episode discovery → three-tier transcript fallback → argument extraction → sentiment → post row) SHALL be verified end-to-end against a real production feed (股癌/Gooaye via SoundOn RSS) at both single-episode and batch (≥10 episodes) scales. Verification evidence MUST include: a successful S1 run that creates a `posts` row for one episode, an S3 run summary with `success_rate` ≥ 90 on a 10-episode sample, and an S4 run summary with `success_rate` ≥ 95 on a 100-episode sample. The verified evidence MUST be linked from the `ai-pipeline` spec at archive time.

#### Scenario: RSS path passes job-type CHECK constraint
- **WHEN** `initiateProfileScrape()` is called with a podcast platform URL and `quotaExempt: true`
- **THEN** the resulting `scrape_jobs` row is inserted without a `scrape_jobs_job_type_check` violation, regardless of whether `job_type` is `'initial_scrape'`, `'incremental_check'`, or `'validation_scrape'`

#### Scenario: Three-tier transcript fallback works for Gooaye episodes
- **WHEN** a Gooaye episode is scraped and has no `<podcast:transcript>` RSS tag and no cached transcript
- **THEN** Tier 3 (Deepgram audio transcription) is invoked, produces plain text, and the pipeline proceeds to argument extraction without manual intervention

### Requirement: Documented concurrency defaults for batch import

The seed-scrape script and `profile-scrape.service.ts` SHALL expose a configurable `--batch-size` (concurrency of `Promise.all` over URLs) and a retry-backoff policy (base delay + max attempts) for transient failures (429, timeout). The default values SHALL be derived from an autoresearch tuning run and documented in the `ai-pipeline` spec with the commit SHA that produced them. Changing a default MUST require a new autoresearch run that demonstrates non-regression of `success_rate`.

#### Scenario: Default batch-size is empirically justified
- **WHEN** the `ai-pipeline` spec is read at any point after archive of this change
- **THEN** it names the current `--batch-size` default, the git SHA where it was set, and a link to the autoresearch run summary proving the value produced the best `success_rate` on the S3 sample

#### Scenario: Retry policy distinguishes transient from terminal
- **WHEN** a Gemini call returns a 429 response
- **THEN** the client retries with exponential backoff up to the documented max attempts, rotating to the next key in the pool on each retry, before declaring a terminal failure
- **AND** a Gemini call that returns a 4xx other than 429 or a malformed JSON body with `finishReason: STOP` is declared terminal without retry

### Requirement: Gemini MAX_TOKENS and JSON-parse failures are retryable

The Gemini client SHALL treat `finishReason: MAX_TOKENS` and JSON parse failures as retryable conditions. On retry, the client MUST either increase `maxOutputTokens` (up to a documented cap) or fail over to a smaller model (Flash → Flash-Lite) before declaring terminal failure. Every retry MUST be recorded in the per-stage timing log.

#### Scenario: MAX_TOKENS truncation is retried, not silently accepted
- **WHEN** argument extraction receives a response with `finishReason: MAX_TOKENS`
- **THEN** the client retries at least once with `maxOutputTokens` raised to the documented cap, and the per-stage timing log records `retries >= 1` for `gemini_args`

#### Scenario: JSON parse failure triggers retry via different key or model
- **WHEN** the Gemini response body fails JSON parsing under the current key and model
- **THEN** the client retries with the next key in the pool, or falls back to the next model in the fallback chain, and the failure mode is recorded with the attempted (key_index, model) tuple in the log

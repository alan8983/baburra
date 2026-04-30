## MODIFIED Requirements

### Requirement: Import pipeline uses cleaned transcript for analysis
The import pipeline (`import-pipeline.service.ts`) SHALL pass `cleaned_text` (LLM-cleaned) to `analyzeDraftContent`, not the rule-cleaned-only intermediate text. When `cleaned_text` is unavailable for a transcript (cache miss), the pipeline MUST run the LLM cleanup pass before analysis and persist the result.

#### Scenario: Cache hit — skip LLM cleanup
- **WHEN** a transcript has a fresh `cleaned_text` matching `CURRENT_CLEANUP_VERSION`
- **THEN** the pipeline reads `cleaned_text` from the cache
- **AND** does NOT call Gemini for cleanup
- **AND** passes `cleaned_text` directly to `analyzeDraftContent`

#### Scenario: Cache miss — run cleanup and persist
- **WHEN** a transcript has `cleanup_version IS NULL`
- **THEN** the pipeline runs the rule-based cleanup, then the LLM cleanup
- **AND** persists `cleaned_text`, `cleanup_version`, `cleanup_at`, `cleanup_chunk_meta` to the `transcripts` row
- **AND** passes the resulting `cleaned_text` to `analyzeDraftContent`

#### Scenario: Stale cache — re-run cleanup
- **WHEN** a transcript has `cleanup_version` not equal to `CURRENT_CLEANUP_VERSION`
- **THEN** the pipeline treats it as a cache miss and re-runs LLM cleanup

## ADDED Requirements

### Requirement: Cleanup timing recorded in pipeline timing log
The pipeline timing log MUST include a `cleanupMs` measurement separately tracking the LLM cleanup phase (chunking + parallel Gemini calls + splice). The existing rule-based cleanup time SHALL remain reported as part of the same `cleanupMs` field for compatibility, with the LLM portion being additive when triggered.

#### Scenario: Pipeline log emits cleanup timing
- **WHEN** an import completes
- **THEN** the timing log includes `cleanupMs=Xs` where X reflects total cleanup wall-clock (rules + LLM if it ran)

#### Scenario: Cache hit shows minimal cleanup time
- **WHEN** the LLM cleanup is skipped due to cache hit
- **THEN** `cleanupMs` reflects only the rule-based cleanup duration (typically <10ms)

### Requirement: Backfill script re-runs analysis after cleanup
The backfill script `scripts/backfill-cleanup-and-analyze.ts` SHALL run LLM cleanup on each stale transcript AND re-run draft analysis on the cleaned text, overwriting existing `posts` rows derived from that transcript. The backfill MUST be idempotent — re-running on already-current rows is a no-op.

#### Scenario: Stale row gets cleaned and re-analyzed
- **WHEN** the backfill processes a row with `cleanup_version IS NULL`
- **THEN** the row's `cleaned_text` is populated
- **AND** existing draft `posts` derived from this transcript are overwritten with new analysis output

#### Scenario: Idempotent re-run skips current rows
- **WHEN** the backfill script is run twice
- **THEN** the second run skips rows where `cleanup_version === CURRENT_CLEANUP_VERSION` without making API calls

#### Scenario: Concurrency limit respected
- **WHEN** the backfill processes 600 rows
- **THEN** at most 10 cleanup operations run in parallel at any time

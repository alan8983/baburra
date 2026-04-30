## ADDED Requirements

### Requirement: Cleaned transcript columns on `transcripts` table
The `transcripts` table SHALL have four additional columns to persist LLM-cleaned output and its provenance: `cleaned_text TEXT NULL`, `cleanup_version TEXT NULL`, `cleanup_at TIMESTAMPTZ NULL`, and `cleanup_chunk_meta JSONB NULL`. All columns MUST be nullable so existing rows remain valid before backfill.

#### Scenario: Migration adds nullable columns
- **WHEN** the migration is applied
- **THEN** existing `transcripts` rows have NULL values for all 4 new columns
- **AND** existing application code reading `text` continues to work unchanged

#### Scenario: Cleaned transcript persisted on first cleanup
- **WHEN** the cleanup pipeline runs successfully on a row
- **THEN** `cleaned_text`, `cleanup_version`, `cleanup_at`, and `cleanup_chunk_meta` are all populated

#### Scenario: Stale cleanup detected by version mismatch
- **WHEN** a row has `cleanup_version: 'flash-v1'`
- **AND** the current version is `flash-v2`
- **THEN** the cache lookup returns null, triggering re-cleanup

### Requirement: `cleanup_chunk_meta` JSONB structure
The `cleanup_chunk_meta` column MUST store an array of chunk metadata objects, one per chunk produced by the chunker. Each object MUST contain at minimum: `index` (number), `startSeconds` (number), `endSeconds` (number), `cleanupSource` (`'gemini' | 'rules-fallback'`).

#### Scenario: Six-chunk transcript metadata
- **WHEN** an episode is cleaned in 6 chunks
- **THEN** `cleanup_chunk_meta` contains an array of 6 objects with sequential `index` values 0..5

#### Scenario: One chunk falls back, others succeed
- **WHEN** chunk 3 fails Gemini and others succeed
- **THEN** `cleanup_chunk_meta[3].cleanupSource` is `'rules-fallback'`
- **AND** all other chunks have `cleanupSource: 'gemini'`

### Requirement: Backwards-compatible read path for raw `text`
Code that reads only the raw `transcripts.text` column MUST continue to function after the migration. The migration MUST NOT modify, rename, or remove the existing `text`, `source`, or any other existing columns.

#### Scenario: Legacy reader still works
- **WHEN** a caller queries `transcripts` for `text` only
- **THEN** the response contains the unchanged Deepgram raw output as before

#### Scenario: New columns have NULL for unprocessed rows
- **WHEN** a transcript row has not yet been cleaned via LLM
- **THEN** `cleaned_text` is NULL and the application falls back to runtime rule-based cleanup of `text`

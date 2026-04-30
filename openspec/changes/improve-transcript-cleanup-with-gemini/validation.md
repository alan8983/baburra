## Pre-flight

- [ ] All tasks in tasks.md marked `[x]`
- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes
- [ ] `npm run build` succeeds

## Change-Specific Tests

### V-001: Schema migration — columns added with correct types and nullability
- **method**: db
- **severity**: critical
- **expected**: After migration, `transcripts` table has `cleaned_text TEXT NULL`, `cleanup_version TEXT NULL`, `cleanup_at TIMESTAMPTZ NULL`, `cleanup_chunk_meta JSONB NULL`
- **steps**:
  1. Run `supabase db push --dry-run` and confirm only the additive change appears
  2. Apply migration; query `information_schema.columns` for `transcripts`
  3. Verify all 4 columns present, all nullable, correct types

### V-002: Prompt registry — current version resolves to model + prompt + config
- **method**: unit
- **severity**: critical
- **expected**: `CLEANUP_VERSIONS[CURRENT_CLEANUP_VERSION]` returns an object with `model: 'gemini-2.5-flash'`, non-empty prompt string, and config including `thinkingBudget: 0`
- **steps**:
  1. Run `npx vitest run src/domain/services/__tests__/cleanup-prompts.test.ts`
  2. Verify registry lookup test passes

### V-003: Vocabulary merge — kol_vocabulary.replacement values appear in rendered prompt
- **method**: unit
- **severity**: high
- **expected**: `buildPromptVocabulary('gooaye')` returns a deduplicated string containing both static JSON terms AND `kol_vocabulary` rows tagged for gooaye
- **steps**:
  1. Run `npx vitest run src/domain/services/__tests__/cleanup-prompts.test.ts`
  2. Verify the merge + dedup test passes

### V-004: Chunker — speaker-boundary alignment, ~10 min chunks
- **method**: unit
- **severity**: critical
- **expected**: `chunkUtterancesByDuration` produces chunks of ≤10 minutes audio, never splits a `[Speaker N, HH:MM:SS] ...` line mid-utterance
- **steps**:
  1. Run `npx vitest run src/domain/services/__tests__/transcript-llm-cleanup.test.ts`
  2. Verify chunker tests pass for: 50-min input → 5-6 chunks; utterance-spanning-boundary kept whole

### V-005: Single chunk Gemini cleanup — happy path
- **method**: unit (mocked Gemini client)
- **severity**: critical
- **expected**: `cleanChunkWithGemini` returns `{text: <cleaned>, source: 'gemini'}` when mock returns valid response
- **steps**:
  1. Mock `gemini.client.ts` to return a fixed valid response
  2. Run the unit test
  3. Verify return shape and `source` field

### V-006: Single chunk Gemini cleanup — falls back on retry exhaustion
- **method**: unit (mocked Gemini client)
- **severity**: critical
- **expected**: When mock throws on every retry, `cleanChunkWithGemini` returns `{text: <rule-cleaned input>, source: 'rules-fallback'}` without throwing
- **steps**:
  1. Mock client to throw retryable error on all attempts
  2. Run unit test
  3. Verify rule-cleaned text returned and source is `'rules-fallback'`

### V-007: Output validation — short output triggers fallback
- **method**: unit
- **severity**: critical
- **expected**: When Gemini returns 100 chars for a 5000-char input, validation fails and rules-fallback is used
- **steps**:
  1. Mock Gemini to return short text
  2. Run unit test
  3. Verify rules-fallback path taken

### V-008: Output validation — speaker line count mismatch triggers fallback
- **method**: unit
- **severity**: critical
- **expected**: When Gemini returns 5 `[Speaker N, ...]` lines for input with 7, fallback is used
- **steps**:
  1. Mock Gemini to return text with fewer speaker lines
  2. Run unit test
  3. Verify rules-fallback path taken

### V-009: Repository — cache lookup by version
- **method**: integration (real Supabase test schema)
- **severity**: critical
- **expected**: `findCleanedByUrl(url, 'flash-v2')` returns null for a row with `cleanup_version: 'flash-v1'`; returns the cached object for matching version
- **steps**:
  1. Seed a transcript row with `cleanup_version: 'flash-v1'`
  2. Call `findCleanedByUrl` with `'flash-v1'` → expect cached object
  3. Call with `'flash-v2'` → expect null

### V-010: Pipeline integration — cache hit skips Gemini call
- **method**: integration (mocked Gemini, real DB)
- **severity**: critical
- **expected**: When transcript has fresh `cleaned_text`, the import pipeline does NOT call the Gemini cleanup function
- **steps**:
  1. Seed a transcript with `cleaned_text` matching `CURRENT_CLEANUP_VERSION`
  2. Run import for the same source URL
  3. Assert Gemini cleanup mock was called 0 times

### V-011: Pipeline integration — cache miss triggers cleanup and persists
- **method**: integration (mocked Gemini, real DB)
- **severity**: critical
- **expected**: When transcript lacks cleaned data, import runs cleanup and writes `cleaned_text` + version
- **steps**:
  1. Seed a transcript with NULL `cleanup_version`
  2. Run import
  3. Query DB; verify `cleaned_text`, `cleanup_version`, `cleanup_at`, `cleanup_chunk_meta` are populated

### V-012: End-to-end — fresh import with real Gemini key (smoke)
- **method**: integration (real Gemini, dev DB)
- **severity**: high
- **expected**: A new YouTube URL is imported, transcript downloaded, cleaned, persisted, and analyzed; cleaned text is visibly free of inter-char Mandarin spaces and contains punctuation
- **steps**:
  1. Run a manual import via the dev UI for a fresh 股癌 episode
  2. Verify the post detail page shows cleaned transcript with disclaimer banner + raw toggle
  3. Verify no inter-char spaces in Mandarin spans

### V-013: UI — disclaimer banner is persistent and non-dismissible
- **method**: visual / e2e
- **severity**: high
- **expected**: Banner appears above transcript on every visit; no dismiss button
- **steps**:
  1. Visit `/posts/{id}` for a cleaned post
  2. Confirm banner is visible
  3. Reload page; confirm banner remains visible

### V-014: UI — raw toggle swaps display between cleaned and raw
- **method**: e2e
- **severity**: high
- **expected**: Clicking the raw toggle replaces the cleaned text with raw `text` and back
- **steps**:
  1. Visit `/posts/{id}` for a cleaned post
  2. Click "顯示原始逐字稿" toggle
  3. Confirm displayed text matches raw `transcripts.text` (with inter-char spaces still present)
  4. Click again → returns to cleaned

### V-015: UI — fallback chunk markers visible
- **method**: visual
- **severity**: medium
- **expected**: Chunks where `cleanupSource === 'rules-fallback'` show a `⚠` marker at line start
- **steps**:
  1. Seed a transcript with chunk_meta marking 1 chunk as `'rules-fallback'`
  2. Visit `/posts/{id}`
  3. Confirm marker appears at the correct chunk

### V-016: Backfill script — idempotent on re-run
- **method**: integration (mocked Gemini)
- **severity**: critical
- **expected**: Running the backfill twice causes 0 Gemini calls on the second run
- **steps**:
  1. Run `npm run backfill:cleanup-and-analyze` (first time, all rows get cleaned)
  2. Re-run the same command
  3. Assert Gemini mock is called 0 times in the second run

### V-017: Backfill script — concurrency limit ≤10
- **method**: integration
- **severity**: medium
- **expected**: At any moment during backfill, no more than 10 cleanup operations are in flight
- **steps**:
  1. Instrument the cleanup function with an in-flight counter
  2. Run backfill on 30+ rows
  3. Assert max observed concurrency ≤10

### V-018: Validation samples — number fidelity
- **method**: manual
- **severity**: critical
- **expected**: Across 5 sample episodes, no number value is mutated (only formatting normalized). Diff cleaned vs raw on number-bearing spans
- **steps**:
  1. Pick 5 sample chunks containing prices, percentages, ratios
  2. Run cleanup, manually compare each numeric token before/after
  3. Confirm zero value changes (only formatting like `"1 。 3"` → `"1.3"`)

### V-019: Validation samples — name fidelity
- **method**: manual
- **severity**: high
- **expected**: No "Bob" → "Bob Odenkirk" style helpful expansions across 5 sample episodes
- **steps**:
  1. Diff cleaned vs raw on proper noun spans
  2. Confirm names are not expanded with information not present in source

### V-020: Validation samples — ad-read content
- **method**: manual
- **severity**: high
- **expected**: An ad-read segment with brand names (e.g. Travel Blue, NordVPN, $15.99 prices) cleans without fabricating brand alternatives
- **steps**:
  1. Pick a 股癌 ad-read chunk
  2. Run cleanup
  3. Confirm brand names handled correctly (preserved or correctly reconstructed)

## Rollout Tests

### V-021: Feature flag off — pipeline still works (rule-based fallback)
- **method**: integration
- **severity**: critical
- **expected**: With `ENABLE_LLM_CLEANUP=false`, imports complete using rule-cleaned output for analysis
- **steps**:
  1. Set flag to false
  2. Trigger an import
  3. Verify analysis runs on rule-cleaned text and pipeline succeeds

### V-022: Feature flag on — fresh import triggers cleanup
- **method**: integration
- **severity**: critical
- **expected**: With `ENABLE_LLM_CLEANUP=true`, a fresh import triggers LLM cleanup and persists output
- **steps**:
  1. Set flag to true
  2. Trigger a fresh import
  3. Verify `cleaned_text` is written and disclaimer appears in UI

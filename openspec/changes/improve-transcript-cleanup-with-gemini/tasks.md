## 1. Schema migration

- [ ] 1.1 Create migration `supabase/migrations/<ts>_transcripts_cleanup_columns.sql` adding `cleaned_text TEXT NULL`, `cleanup_version TEXT NULL`, `cleanup_at TIMESTAMPTZ NULL`, and `cleanup_chunk_meta JSONB NULL` to `transcripts` table
- [ ] 1.2 Preview migration: `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"`
- [ ] 1.3 Apply migration: `supabase db push -p "$SUPABASE_DB_PASSWORD"` (with user confirmation)
- [ ] 1.4 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`
- [ ] 1.5 Verify `npm run type-check` passes

## 2. Prompt registry & vocabulary

- [ ] 2.1 Create `src/data/cleanup-prompt-vocabulary.json` with categorized vocabulary (tickers_us, tickers_tw, companies_zh, companies_en, concepts, kol_specific)
- [ ] 2.2 Create `src/domain/services/cleanup-prompts.ts` exporting `CURRENT_CLEANUP_VERSION = 'flash-v1'` and a `CLEANUP_VERSIONS` registry containing `{ model, prompt, config }` for `flash-v1` (use the prompt content from design.md §7)
- [ ] 2.3 Implement `buildPromptVocabulary(kolId?: string): Promise<string>` — flattens JSON file categories, merges with `kol_vocabulary.replacement` values from DB, dedupes, returns comma-joined string
- [ ] 2.4 Implement `renderPromptForChunk(version, kolId): Promise<string>` — looks up version from registry, interpolates vocabulary into template
- [ ] 2.5 Unit tests for `buildPromptVocabulary` (with kolId, without kolId, empty kol vocab, duplicate term dedup)

## 3. Chunking & Gemini cleanup service

- [ ] 3.1 Create `src/domain/services/transcript-llm-cleanup.ts`
- [ ] 3.2 Implement `chunkUtterancesByDuration(formattedTranscript: string, maxDurationSec=600): Chunk[]` — parses `[Speaker N, HH:MM:SS]` lines, groups into chunks of ~10 min audio
- [ ] 3.3 Implement `cleanChunkWithGemini(chunkText: string, version: string, kolId?: string): Promise<{text: string, source: 'gemini' | 'rules-fallback'}>` — calls Gemini via existing `gemini.client.ts`, retries via key pool, validates output, returns rule-cleaned fallback on failure
- [ ] 3.4 Implement output validator: `output.length >= input.length × 0.8` AND same `[Speaker N, HH:MM:SS]` line count
- [ ] 3.5 Implement `runLlmCleanup(rawTranscript: string, version: string, kolId?: string): Promise<{cleanedText: string, chunks: ChunkMeta[]}>` — orchestrates chunking, parallel Gemini calls (Promise.all), splice, returns concatenated cleaned text + per-chunk metadata
- [ ] 3.6 Unit tests with mocked Gemini client: success path, single-chunk failure (verify fallback), full failure, validation failure (short output), version cache hit logic

## 4. Repository & pipeline integration

- [ ] 4.1 Extend `src/infrastructure/repositories/transcript.repository.ts` with: `findCleanedByUrl(url, version): Promise<{cleanedText, chunkMeta} | null>` (cache lookup by version), `saveCleanedTranscript(id, cleanedText, version, chunkMeta): Promise<void>`
- [ ] 4.2 Modify `src/domain/services/import-pipeline.service.ts`: after existing rule-based `cleanTranscript`, check cache via `findCleanedByUrl`; on miss, run `runLlmCleanup` and persist via `saveCleanedTranscript`; pass `cleaned_text` (not raw) to `analyzeDraftContent`
- [ ] 4.3 Preserve existing rule-based `cleanTranscript` call as Stage 1 — input to LLM cleanup, NOT removed
- [ ] 4.4 Add `cleanupMs` timing to existing pipeline timing log
- [ ] 4.5 Integration test: end-to-end import with mocked Deepgram + mocked Gemini, verify (a) cleanup persists to DB, (b) analysis sees cleaned text, (c) cache hit on second run skips Gemini call

## 5. Backfill script

- [ ] 5.1 Create `scripts/backfill-cleanup-and-analyze.ts` — iterates over `transcripts` where `cleanup_version IS NULL` or `cleanup_version != CURRENT_CLEANUP_VERSION`
- [ ] 5.2 For each row: run `runLlmCleanup`, persist result, then re-run draft analysis (overwrites existing drafts)
- [ ] 5.3 Concurrency = 10 via `p-limit` (already a project dep, or use Promise.all batching)
- [ ] 5.4 Idempotent: re-running on already-cleaned data hits cache → no-op
- [ ] 5.5 Logs progress per episode + total Gemini cost estimate at end
- [ ] 5.6 Add `npm run backfill:cleanup-and-analyze` script entry in `package.json`
- [ ] 5.7 Dry-run mode: `--dry-run` flag prints what would be processed without making API calls or writes

## 6. UI changes on /posts/{id}

- [ ] 6.1 Update post detail page to fetch `cleaned_text` (default) with raw `text` accessible via toggle
- [ ] 6.2 Add `<TranscriptDisclaimerBanner />` component above transcript display — persistent, non-dismissible, amber/info color
- [ ] 6.3 Add "顯示原始逐字稿 / Show raw transcript" toggle button + state
- [ ] 6.4 Render per-chunk fallback markers (small ⚠ icon at line start) for chunks where `cleanupSource === 'rules-fallback'`
- [ ] 6.5 Add i18n strings (zh-TW + en) for disclaimer copy and toggle labels in `src/messages/{locale}/`
- [ ] 6.6 Visual QA: banner color + readability, toggle interaction, marker placement

## 7. Validation

- [ ] 7.1 Run cleanup on a 股癌 ad-read segment (high English brand density) — verify Travel Blue, NordVPN-style brands handled without hallucination
- [ ] 7.2 Run cleanup on a pure-financial chunk (heavy ticker/number density) — verify zero number-value mutations (use diff against raw)
- [ ] 7.3 Run cleanup on a multi-speaker interview chunk — verify speaker labels and timestamps preserved verbatim
- [ ] 7.4 Diff cleaned output across 5 sample episodes — eyeball quality, no fabricated content
- [ ] 7.5 Trigger manual rules-fallback (force Gemini to fail e.g. via invalid API key for one chunk) — verify graceful degradation in UI with marker
- [ ] 7.6 `npm run type-check` passes
- [ ] 7.7 `npm test` passes (existing 886 + new tests for cleanup service)
- [ ] 7.8 `npx playwright test` (e2e) passes — at minimum the post-detail-page rendering test if one exists

## 8. Rollout

- [ ] 8.1 Deploy behind feature flag `ENABLE_LLM_CLEANUP` — default `false`
- [ ] 8.2 Run backfill script in staging environment with full backlog
- [ ] 8.3 Smoke test: import a fresh episode end-to-end, verify cleaned transcript appears in UI with disclaimer + toggle
- [ ] 8.4 Run backfill script in production
- [ ] 8.5 Flip feature flag `ENABLE_LLM_CLEANUP=true` in production
- [ ] 8.6 Monitor 1 week: rules-fallback rate (target <5%), Gemini error rate, cleanup latency p99
- [ ] 8.7 Remove feature flag after 2 weeks of clean operation (defer-flag-removal task can be scheduled)

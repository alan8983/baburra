## Why

The existing rule-based transcript cleanup (`transcript-cleanup.ts`: regex letter-merge + OpenCC + dictionary) successfully fixes uppercase ticker fragments and Simplified→Traditional conversion, but leaves four structural problems that degrade analysis quality and user trust:

1. **Inter-character spaces** in Mandarin (`"應該 不多 買 下去"`) — the rule-based pass doesn't strip them
2. **No punctuation** — Deepgram outputs run-on text; rules can't add punctuation
3. **Mangled lowercase code-switching** (`"h ch"` should be `"hedge"`, `"B er K0S ho"` should be `"Better Call Saul"`) — the existing letter-merge only collapses uppercase sequences
4. **Broken numbers** (`"1 。 3 1。5 億"` should be `"1.3、1.5億"`)

Production transcripts shown to users on `/posts/{id}` reflect all four problems, hurting product credibility for an investment-research tool.

A vendor migration to Groq Whisper Large v3 was evaluated and rejected: Groq blocks Taiwan datacenter egress (HTTP 403 from PacketHub Taipei in testing), has no streaming endpoint, no diarization, and would require new chunking + ffmpeg infrastructure. Adding LLM post-processing on top of the existing Deepgram pipeline carries less migration risk and reuses the existing `gemini.client.ts` infrastructure.

## What Changes

- **New Gemini Flash cleanup pass** added after the existing rule-based cleanup, chunked by Deepgram utterance boundaries (~10 min per chunk), run in parallel
- **Persisted cleaned output** in new `cleaned_text` column on the `transcripts` table, keyed by `cleanup_version` for cache invalidation
- **Eager backfill** existing transcripts via a one-shot script that re-cleans + re-analyzes the entire backlog at deploy time (~$34 one-time cost for ~600 episodes)
- **UI: surface cleaned transcript** on `/posts/{id}` with persistent disclaimer banner, "view raw" toggle, and per-chunk fallback markers
- **Fail-safe**: when Gemini fails for a chunk, fall back to rule-cleaned text for that segment only — never hard-fail
- **Vendor decision**: explicitly stay on Deepgram. Groq Whisper rejected due to TW egress region risk + lack of streaming + chunking complexity

## Capabilities

### Modified Capabilities

- `transcript-cleanup`: new Gemini cleanup pass after the existing rule pipeline, with prompt versioning, chunking, and failure handling
- `data-models`: new `cleaned_text`, `cleanup_version`, `cleanup_at` columns on `transcripts` table
- `ai-pipeline`: import pipeline now reads cleaned text from cache (instead of recomputing rules each time) and writes cleanup metadata back

## Impact

- **Code**: new `src/domain/services/transcript-llm-cleanup.ts`, new `src/domain/services/cleanup-prompts.ts` (prompt registry), new `src/data/cleanup-prompt-vocabulary.json`, modifications to `import-pipeline.service.ts` and `transcript.repository.ts`, new `scripts/backfill-cleanup-and-analyze.ts`
- **Data**: schema migration adds 3 nullable columns to `transcripts`; backfill writes `cleaned_text` for all existing rows (~600 episodes × ~$0.06 ≈ ~$34 one-time)
- **Dependencies**: no new packages — uses existing `gemini.client.ts` key pool + retry infrastructure
- **Backwards-compatible**: rule-based cleanup output remains the fallback path; old code reading `transcripts.text` still works; new columns are nullable

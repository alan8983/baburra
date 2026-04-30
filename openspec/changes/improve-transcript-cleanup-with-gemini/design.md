## Context

The existing transcript pipeline uses pure-rule cleanup (`mergeIsolatedLetters` + `OpenCC` + `dictionary`) which is fast and free but cannot fix four structural problems in Deepgram Nova-3 output: inter-character spaces in Mandarin, missing punctuation, mangled lowercase English code-switching, and broken number formatting.

Two paths were evaluated:

**Path A — Switch transcription vendor to Groq Whisper Large v3.** Whisper handles Mandarin + code-switching better at the acoustic level. **Rejected** because Groq blocks Taiwan datacenter egress (verified HTTP 403 from PacketHub Taipei IP), has no streaming endpoint (loses our duplex stream optimization), no native diarization, and would require a new chunking + ffmpeg layer for >25 MB files.

**Path B — Add LLM post-processing on top of Deepgram.** Zero network/region risk, preserves streaming, preserves diarization, leverages existing `gemini.client.ts` infrastructure. Trade: hallucination risk from LLM cleanup of ambiguous fragments.

**Path B was chosen** with a user-facing disclaimer to mitigate hallucination risk. Investment content where misread numbers/tickers carry real consequences is exactly where users need to know the transcript was AI-processed and have access to the raw fallback.

## Goals / Non-Goals

**Goals:**
- Eliminate inter-character spaces, add proper Mandarin punctuation, and reconstruct mangled code-switched English in Deepgram transcripts before user display and AI analysis
- Preserve numerical fidelity — never modify a number's value, only normalize its formatting (e.g. `"1 。 3"` → `"1.3"` is allowed; `"13"` → `"1.3"` is forbidden)
- Cache cleaned output to avoid repeated cleanup cost on re-analysis
- Provide audit trail (raw transcript still accessible via UI toggle)
- Backfill existing transcripts so analysis quality is uniform across the entire backlog

**Non-Goals:**
- Switching transcription vendors (Path A explicitly rejected)
- Replacing the existing rule-based pipeline (it runs first; Gemini runs after)
- Adding diarization (existing Deepgram diarization output is preserved verbatim)
- Speaker re-attribution or speaker name resolution
- General-purpose translation between English and Chinese (we explicitly forbid translation in the prompt)
- A/B testing infrastructure for prompts (deferred — manual sample comparison sufficient for v1)

## Decisions

### 1. Two-stage cleanup: rules first, then Gemini

```
raw transcript (from Deepgram)
  → existing rule layer (mergeIsolatedLetters + OpenCC + dictionary + kol_vocabulary)
  → new Gemini Flash cleanup (chunked, parallel)
  → cleaned transcript (persisted to DB, displayed in UI, fed to analysis)
```

**Rationale:**
- Rules are deterministic and free — they handle known patterns (TSMC, NordVPN, dictionary terms) with 100% reliability and no hallucination surface
- Gemini handles the hard textual problems rules cannot (punctuation, lowercase code-switching reconstruction, sentence-level smoothing)
- Failure isolation: if Gemini fails entirely, rule-cleaned output is still usable as fallback
- Determinism for known terms: `kol_vocabulary` substitutions happen at the rule layer, guaranteeing 100% replacement reliability

### 2. Model: Gemini 2.5 Flash (not Lite, not Pro)

Empirical comparison on 10-min sample of 股癌 EP590 (validated live during proposal phase):

| Model | "B er K0S ho 的主角 B ar b" output | Hallucination |
|---|---|---|
| Flash Lite | "Bob Odenkirk 的那個主角 Bob" | ❌ Confused show name with actor — fabricated content |
| Flash | "Better Call Saul 的那個主角 Bob" | ✅ Correct |
| Pro | (not tested — diminishing returns over Flash for cleanup) | (deferred) |

Cost: ~$0.0094/chunk × 6 chunks = ~$0.057/episode at Flash pricing. Across the 600-episode backlog: ~$34 one-time backfill cost.

**`generationConfig`**: `temperature: 0.1`, `maxOutputTokens: 8192`, `thinkingConfig: { thinkingBudget: 0 }`.

Thinking is **explicitly disabled** because empirically Flash with thinking enabled truncated output at ~326 tokens vs ~3300 tokens with thinking off (likely due to thinking tokens consuming the generation budget).

### 3. Chunking: by Deepgram utterance boundaries, ~10 min per chunk, parallel

Deepgram already segments output as `[Speaker N, HH:MM:SS] text`. Group ~10 minutes of utterances per chunk (~3-5K input tokens each), call Gemini in parallel per chunk, splice via string concatenation at speaker boundaries.

**Rationale:**
- Natural speaker boundaries — no mid-thought splits at chunk seams
- Output size fits comfortably under `maxOutputTokens: 8192` (measured ~3300 typical)
- Parallel = wall-clock ~16s for whole episode (single chunk latency dominates)
- Splice trivial (concat at speaker boundaries; no overlap dedup logic needed)
- Failure isolation: 1 bad chunk = lose 10 min of cleanup, not whole episode

### 4. Failure handling: retry + rule-cleaned fallback + length validation

For each chunk:

1. Try Gemini Flash via existing `gemini.client.ts` (key pool + cooldown + 3 retries built into the existing client)
2. Validate output: `output.length >= input.length × 0.8` AND same `[Speaker N, HH:MM:SS]` line count
3. On retry exhaustion OR validation failure → use rule-cleaned text for this chunk
4. Persist per-chunk metadata: `cleanupSource: 'gemini' | 'rules-fallback'`

UI surfaces fallback chunks with a small visual marker (`⚠`).

### 5. Caching: extend `transcripts` table

Three new columns on the existing `transcripts` table:
- `cleaned_text` (TEXT) — the Gemini-cleaned output (concatenation of all chunks, with fallback chunks substituted by rule-cleaned text)
- `cleanup_version` (TEXT) — e.g. `"flash-v1"`; matches `CURRENT_CLEANUP_VERSION` constant when fresh
- `cleanup_at` (TIMESTAMPTZ) — timestamp of when cleanup ran

Cache hit when `cleanup_version === CURRENT_CLEANUP_VERSION`. On hit, skip cleanup and use stored `cleaned_text`. On version bump, lazy invalidation by default (re-clean on next access) or eager invalidation via explicit backfill script.

Per-chunk `cleanupSource` metadata is stored as a JSON array in a separate column or embedded in `cleaned_text` (TBD in implementation; either works).

### 6. Prompt versioning: monotonic labels in code registry

```typescript
// src/domain/services/cleanup-prompts.ts
export const CURRENT_CLEANUP_VERSION = 'flash-v1' as const;

export const CLEANUP_VERSIONS: Record<string, CleanupVersion> = {
  'flash-v1': {
    model: 'gemini-2.5-flash',
    config: { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    prompt: `# Role\n你是中文 podcast 逐字稿的後處理工具...`, // full prompt
  },
  // 'flash-v2': { ... }, // future
} as const;
```

- Monotonic labels (never reused even after rollback)
- Old versions stay in registry as long as data references them
- Bump on any change to `(prompt, model, generationConfig)`
- Rollback path: ship a new version (`flash-v3`) with the previous prompt content; never destructively edit `flash-v1`

### 7. Prompt content

The system prompt:
- Defines role and "保真優先於通順" core principle
- Lists 4 correction rules in priority order: strip CJK spaces, add punctuation, reconstruct fragmented English (conservatively), normalize numbers without changing values
- Lists strict prohibitions including: no content additions, no semantic rewrites, no English-to-Chinese translation, no preservation-of-cuss-words filtering, no time-stamp modification
- Includes 「保留原文使用的稱呼形式」 clause to prevent helpful-but-fabricated name expansions (e.g. `"Bob"` → `"Bob Odenkirk"`)
- Interpolates a domain vocabulary list at runtime

Full prompt content lives in `cleanup-prompts.ts` and is reviewed via PR.

### 8. Vocabulary: separate JSON file + dynamic merge with `kol_vocabulary`

New `src/data/cleanup-prompt-vocabulary.json` — categorized JSON of biasing terms:

```json
{
  "version": 1,
  "categories": {
    "tickers_us": ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA", "AMD", "TSM"],
    "tickers_tw": ["2330", "2317", "2454"],
    "companies_zh": ["台積電", "鴻海", "聯發科", "輝達", "特斯拉"],
    "companies_en": ["TSMC", "Foxconn", "MediaTek"],
    "concepts": ["EBITDA", "P/E", "ROE", "ROIC", "margin call", "hedge", "stop loss", "ETF", "S&P 500"],
    "kol_specific": ["股癌", "謝孟恭", "林口富霸", "Gooaye"]
  }
}
```

At runtime, `buildPromptVocabulary(kolId)` flattens this list and merges with `kol_vocabulary.replacement` values from the DB for KOL-specific content. The merged list is interpolated into the prompt's "投資領域參考詞彙" section.

This is **distinct from** the existing rule-based `transcript-dictionary.json` which does regex substitution. Two layers, different mechanisms, single source of truth per layer.

### 9. UI: cleaned default, raw toggle, persistent disclaimer

On `/posts/{id}` (existing transcript display):
- Display `cleaned_text` by default (instead of current rule-cleaned-only output)
- Toggle button: "顯示原始逐字稿" → swaps view to raw `text`
- Persistent banner above transcript explaining what AI changed and recommending raw fallback for verification of numbers/names
- Per-chunk fallback markers (`⚠ raw`) at the start of any chunk where `cleanupSource === 'rules-fallback'`

Disclaimer copy (zh-TW):

> 此逐字稿經 AI 自動處理:已修正標點、簡轉繁、英文片段重組。數字、人名、公司名可能誤判,重要資訊請以原始錄音或原始逐字稿為準。

### 10. Eager backfill at deploy

One-shot script: `npm run backfill:cleanup-and-analyze`

- Iterates over all `transcripts` rows where `cleanup_version IS NULL` or `!= CURRENT_CLEANUP_VERSION`
- For each: runs LLM cleanup, writes back `cleaned_text` + `cleanup_version` + `cleanup_at`
- Then re-runs draft analysis on the cleaned text, overwriting existing drafts in `posts`
- Concurrency = 10, idempotent (cache-hit on re-run skips the row)
- Estimated cost: ~$34 for 600 episodes; runtime ~30-60 min

Existing drafts are **overwritten** with re-analysis output. This is safe because drafts have no user edits (confirmed during proposal phase).

### 11. Credit cost: absorbed into existing `transcribe.audio` block

No new credit lego concept. The ~$0.06/episode cleanup cost is absorbed into the existing per-tier import cost; existing per-tier import quotas + content-fingerprint dedup cache already protect against free-tier abuse.

## Risks / Trade-offs

- **[LLM hallucination on tickers/numbers]** Gemini may produce plausible-but-wrong substitutions where source audio is ambiguous. **Mitigation**: explicit prompt rules forbidding semantic changes, name expansions, and English-to-Chinese translation. Persistent UI disclaimer. Raw-transcript toggle for user verification.
- **[Cleanup cost grows with backlog]** ~$0.06/ep × 600 = ~$34 one-time + ~$0.06 per new import. **Mitigation**: cache-by-version skips re-cleanup unless version is bumped. Free-tier abuse mitigated by existing tier quotas.
- **[Soft hallucinations like "Bob → Bob Odenkirk"]** Flash sometimes "helpfully" expands names even with explicit rules against it. **Mitigation**: added 「保留原文使用的稱呼形式」 clause; iterate on prompt as observed in production via prompt versioning.
- **[Schema migration on `transcripts`]** Adding 3 columns to a populated table. **Mitigation**: all columns nullable, no data backfill required at migration time, no downtime.
- **[Backfill blast radius]** Re-running analysis on 600 episodes overwrites existing drafts. **Mitigation**: confirmed no user edits exist on drafts. Backfill is idempotent (cache-hit on re-run). Run in staging first.
- **[Validation coverage]** Flash validated on one "talk about life" segment; ad-read content (heavy brand density) and pure-financial content not yet validated. **Mitigation**: validation tasks 7.1–7.3 cover these cases before flag-flip rollout.
- **[Deepgram-specific output format coupling]** The chunker assumes `[Speaker N, HH:MM:SS]` format produced by Deepgram diarize output. **Mitigation**: this is the only transcription path today; if other paths are added, update chunker accordingly.

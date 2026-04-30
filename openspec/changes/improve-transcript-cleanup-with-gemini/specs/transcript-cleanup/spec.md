## ADDED Requirements

### Requirement: LLM cleanup pass after rule-based cleanup
The system SHALL run a Gemini-based cleanup pass after the existing rule-based cleanup (`mergeIsolatedLetters` + `OpenCC` + `dictionary`). The LLM pass MUST receive rule-cleaned text as input, never the raw Deepgram output. The LLM pass output is the final cleaned transcript used for display and analysis.

#### Scenario: Two-stage pipeline ordering
- **WHEN** a fresh transcript is processed
- **THEN** rule-based cleanup runs first, producing intermediate text
- **AND** Gemini cleanup runs second on the intermediate text, producing the final cleaned text

#### Scenario: Rule-only fallback when Gemini disabled
- **WHEN** the LLM cleanup feature flag is off
- **THEN** the rule-cleaned text is used as the final cleaned text (no Gemini call)

### Requirement: Chunked parallel cleanup by Deepgram utterance boundaries
The system SHALL split the rule-cleaned transcript into chunks of approximately 10 minutes of audio each, aligned to Deepgram `[Speaker N, HH:MM:SS]` utterance boundaries (no mid-utterance splits). Chunks MUST be sent to Gemini in parallel and the responses concatenated to produce the final cleaned text.

#### Scenario: Chunk size approximation
- **WHEN** input transcript covers 50 minutes of audio
- **THEN** the chunker produces 5–6 chunks each covering ~10 minutes

#### Scenario: Speaker-boundary alignment
- **WHEN** an utterance starts at 00:09:50 and ends at 00:10:30
- **AND** the 10-minute chunk boundary would fall at 00:10:00
- **THEN** the chunker keeps that utterance whole in one chunk (does not split mid-utterance)

#### Scenario: Parallel execution
- **WHEN** N chunks are generated for an episode
- **THEN** all N Gemini calls execute in parallel via `Promise.all`

### Requirement: Gemini Flash with thinking disabled
The cleanup pass MUST use `gemini-2.5-flash` (not Flash Lite, not Pro) with `temperature: 0.1`, `maxOutputTokens: 8192`, and `thinkingConfig: { thinkingBudget: 0 }`. Thinking MUST be explicitly disabled because empirical testing showed thinking-enabled Flash truncated cleanup output.

#### Scenario: Model and config selection
- **WHEN** a chunk is sent to Gemini for cleanup
- **THEN** the request body uses model `gemini-2.5-flash` with `thinkingBudget: 0`

#### Scenario: Output token cap
- **WHEN** a typical 10-min chunk is processed
- **THEN** output token usage is well under 8192 (typical ~3300)

### Requirement: Failure handling with rule-cleaned fallback per chunk
When a chunk's Gemini call fails after retries, OR when the output fails validation, the system SHALL fall back to the rule-cleaned text for that chunk only, marking it with `cleanupSource: 'rules-fallback'` in the chunk metadata. The system MUST NOT hard-fail the entire transcript when only some chunks fail.

#### Scenario: Single chunk fails, others succeed
- **WHEN** 5 of 6 chunks succeed and 1 fails after retries
- **THEN** the cleaned transcript contains 5 Gemini-cleaned chunks + 1 rule-cleaned chunk
- **AND** the metadata records `cleanupSource: 'rules-fallback'` for the failed chunk
- **AND** no error is surfaced to the user

#### Scenario: All chunks fail
- **WHEN** every chunk fails (e.g. Gemini API unavailable)
- **THEN** the cleaned transcript equals the rule-cleaned text in full
- **AND** all chunk metadata is marked `'rules-fallback'`

### Requirement: Output validation
After each Gemini call, the system SHALL validate the response: output character length MUST be ≥80% of input character length, AND the count of `[Speaker N, HH:MM:SS]` line prefixes MUST equal the count in the input. If validation fails, the chunk falls back to rule-cleaned text per the failure-handling requirement.

#### Scenario: Output too short
- **WHEN** Gemini returns 100 chars for an input of 5000 chars
- **THEN** validation fails and rules-fallback is used

#### Scenario: Speaker line count mismatch
- **WHEN** Gemini returns 5 `[Speaker N, ...]` lines for an input with 7
- **THEN** validation fails and rules-fallback is used

#### Scenario: Valid output passes
- **WHEN** Gemini returns 4500 chars for an input of 5000 chars with matching line counts
- **THEN** validation passes and the Gemini output is used

### Requirement: Prompt versioning via code registry
Cleanup prompts SHALL be versioned via monotonic string labels (e.g. `flash-v1`, `flash-v2`) stored in a `CLEANUP_VERSIONS` registry in `src/domain/services/cleanup-prompts.ts`. Each version captures the tuple `(model, prompt, generationConfig)`. Old versions MUST NOT be removed from the registry while data still references them. Version labels MUST NOT be reused.

#### Scenario: Current version constant exists
- **WHEN** the cleanup module is loaded
- **THEN** `CURRENT_CLEANUP_VERSION` is exported and matches a key in `CLEANUP_VERSIONS`

#### Scenario: Old version retrievable
- **WHEN** a cached transcript has `cleanup_version: 'flash-v1'`
- **AND** the current version is `flash-v2`
- **THEN** `CLEANUP_VERSIONS['flash-v1']` still resolves to the original prompt+model+config

#### Scenario: Rollback via new version, not destructive edit
- **WHEN** a regression is found in `flash-v2`
- **THEN** the team ships `flash-v3` containing the prior `flash-v1` prompt content
- **AND** the existing `flash-v1` and `flash-v2` registry entries remain unchanged

### Requirement: Vocabulary file with categorized terms + dynamic kol_vocabulary merge
The system SHALL maintain a categorized JSON vocabulary file at `src/data/cleanup-prompt-vocabulary.json` containing biasing terms grouped by category (tickers_us, tickers_tw, companies_zh, companies_en, concepts, kol_specific). At cleanup time, the runtime MUST merge this static list with the `kol_vocabulary.replacement` values for the relevant KOL (when known), deduplicate, and interpolate the result into the prompt template's "投資領域參考詞彙" section.

#### Scenario: Static vocabulary loaded
- **WHEN** the cleanup service starts
- **THEN** the JSON file's flattened categories are available for prompt rendering

#### Scenario: KOL-specific merge
- **WHEN** a transcript is cleaned with `kolId: 'gooaye'`
- **AND** `kol_vocabulary` rows for `gooaye` include `replacement: '謝孟恭'`
- **THEN** the rendered prompt vocabulary includes `'謝孟恭'`

#### Scenario: Deduplication on merge
- **WHEN** the static JSON contains `'TSMC'` AND `kol_vocabulary` contains `replacement: 'TSMC'`
- **THEN** the rendered vocabulary list contains `'TSMC'` exactly once

### Requirement: Prompt content rules and prohibitions
The cleanup prompt MUST include explicit rules: (1) strip CJK inter-character spaces while preserving spaces at CJK-English boundaries, (2) add full-width Mandarin punctuation based on speech pauses, (3) reconstruct fragmented English only when context is clear (preserve raw fragment otherwise), (4) normalize number formatting without changing values. The prompt MUST also include explicit prohibitions: no content additions, no semantic rewrites, no English-to-Chinese translation, no preservation-of-cuss-words filtering, no timestamp modification, no name expansion (e.g. `"Bob"` → `"Bob Odenkirk"` is forbidden).

#### Scenario: Prompt forbids name expansion
- **WHEN** the prompt registry is inspected
- **THEN** the active prompt contains a clause requiring 「保留原文使用的稱呼形式」 with explicit examples

#### Scenario: Prompt forbids translation
- **WHEN** the prompt is applied to text containing "EBITDA"
- **THEN** the prompt instructs the model NOT to translate "EBITDA" to "息稅折舊攤銷前利潤"

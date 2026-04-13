## Why

Deepgram Nova-3 transcripts of Taiwanese Mandarin content (e.g. Gooaye) suffer from two compounding issues that prevent the AI ticker identification prompt from extracting investment ideas: (1) aggressive word splitting fragments English ticker symbols and proper nouns ("T S M" instead of "TSM", "N V D A" instead of "NVDA", "S & P" instead of "S&P"), and (2) Simplified Chinese output when the source is Traditional Chinese ("台 积 电" instead of "台積電"). In a Gooaye batch scrape of 43 videos, all Gemini analysis calls succeeded but **0 posts were imported** because the garbled transcripts yielded zero identifiable tickers.

## What Changes

- **New transcript post-processing step** between Deepgram transcription and AI analysis. A pure-function cleanup pass that:
  - Merges isolated single-letter English tokens back into words ("T S M" → "TSM", "N V D A" → "NVDA")
  - Normalises known financial terms from a **maintainable dictionary file** (e.g. "台 积 电" → "台積電", "Co W as" → "CoWoS", "N or d VPN" → "NordVPN")
  - Optionally converts Simplified Chinese to Traditional Chinese for zh-TW content
- **Maintainable terminology dictionary** — a structured data file (JSON/YAML) that maps garbled Deepgram fragments to corrected forms. Editable by non-developers, extendable as new KOLs/terms are encountered.
- **Integration point** in the import pipeline — post-processing runs after transcription (or cache hit) and before `analyzeDraftContent()`, so all AI analysis benefits from cleaned text.

## Capabilities

### New Capabilities

- `transcript-cleanup`: Post-processing rules, dictionary structure, single-letter merge logic, and integration into the import pipeline

### Modified Capabilities

- `ai-pipeline`: Transcript text is now cleaned before AI analysis; ticker identification receives higher-quality input

## Impact

- **Code**: New `src/domain/services/transcript-cleanup.ts` (or similar), new dictionary file, modification to `import-pipeline.service.ts` to insert the cleanup step
- **Data**: Dictionary file in `src/domain/services/` or `src/data/` — JSON or YAML
- **Dependencies**: May need `opencc-js` for Simplified→Traditional Chinese conversion (or a lightweight alternative)
- **Backwards-compatible**: Existing transcripts in DB are not modified; cleanup runs at analysis time

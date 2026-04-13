## Context

Deepgram Nova-3 with `detect_language: 'true'` produces transcripts where:
1. English tokens are split by spaces between each letter ("T S M", "N V D A")
2. Chinese text is output in Simplified rather than Traditional ("台 积 电" vs "台積電")
3. Brand names and financial terms are fragmented ("Co W as", "N or d VPN")

The AI ticker identification prompt (`buildDraftAnalysisPrompt`) expects clean text like "台積電" or "TSLA" and can't recover from these fragments. The cleanup must happen **before** the AI call but **after** transcription/cache retrieval, as a pure transformation on the text string.

## Goals / Non-Goals

**Goals:**
- Clean transcript text so AI can identify tickers reliably
- Make the correction dictionary easy to maintain (add new terms without code changes)
- Support multi-language transcripts (zh-TW primary, English secondary, mixed content)
- Pure function with no side effects — takes string in, returns cleaned string out

**Non-Goals:**
- Modifying Deepgram configuration (language pinning could break other languages)
- Re-transcribing existing audio (cleanup operates on stored transcript text)
- Persisting cleaned transcripts back to DB (cleanup is a runtime transform)
- General-purpose NLP or grammar correction

## Decisions

### 1. Three-pass cleanup pipeline

The cleanup function applies three sequential passes:

```
Input text
  → Pass 1: Single-letter English merge ("T S M" → "TSM")
  → Pass 2: Dictionary term replacement (garbled → correct)
  → Pass 3: Simplified → Traditional Chinese conversion
Output text
```

**Pass 1: Single-letter merge** — Regex-based. Detects sequences of isolated uppercase letters separated by spaces (e.g. `T S M`, `N V D A`) and collapses them. Minimum 2 letters to avoid false positives on legitimate single letters.

**Pass 2: Dictionary replacement** — Loads terms from a JSON dictionary file. Each entry maps a Deepgram fragment pattern to the corrected form. Supports both exact string matching and regex patterns for flexible matching.

**Pass 3: zh-CN → zh-TW conversion** — Uses `opencc-js` (lightweight, no native deps, ~200KB) to convert Simplified to Traditional Chinese. Only runs if the text contains CJK characters. This is a safety net — if Deepgram's `detect_language` picks zh-CN for Taiwanese content, the output still gets normalised.

### 2. Dictionary file format: JSON with categories

```json
{
  "version": 1,
  "categories": {
    "tickers": {
      "description": "Stock ticker symbols and company names",
      "terms": [
        { "pattern": "T S M C?", "replacement": "TSMC", "regex": true },
        { "pattern": "台 积 电", "replacement": "台積電" },
        { "pattern": "辉 达", "replacement": "輝達" }
      ]
    },
    "financial": {
      "description": "Financial terms and indices",
      "terms": [
        { "pattern": "S & P", "replacement": "S&P" },
        { "pattern": "E T F", "replacement": "ETF" }
      ]
    },
    "brands": {
      "description": "Sponsor and brand names (cleaned for readability)",
      "terms": [
        { "pattern": "N or d VPN", "replacement": "NordVPN" },
        { "pattern": "Co W as", "replacement": "CoWoS" }
      ]
    }
  }
}
```

Categories are for human organisation only — all terms are applied in a single pass. JSON chosen over YAML because it doesn't require a parser dependency and is natively supported.

### 3. Dictionary location: `src/data/transcript-dictionary.json`

Separate from code so it can be edited independently. Loaded once at module init (lazy, like the Gemini key pool).

### 4. Integration point: after cache retrieval, before `analyzeDraftContent`

In `import-pipeline.service.ts`, the cleanup runs on `contentForAnalysis` right before the AI call at line ~447. This means both fresh transcripts and cached transcripts get cleaned. The cleanup is idempotent — running it twice produces the same result.

### 5. `opencc-js` for zh-CN → zh-TW (not a custom mapping)

Alternatives considered:
- **Custom character map**: Would require maintaining thousands of mappings. Rejected.
- **`chinese-conv`**: Simpler but less accurate for compound words. Rejected.
- **`opencc-js`**: Industry-standard OpenCC, JavaScript port, ~200KB, handles compound word conversion (e.g. "信息" → "資訊" not just char-by-char). Selected.

## Risks / Trade-offs

- **[False positives in letter merge]** "U S A" → "USA" is correct, but "I S A" → "ISA" might not be intended → Mitigation: Only merge sequences of 2+ uppercase letters. The dictionary can override specific cases.
- **[Dictionary maintenance burden]** New garbled terms will appear as new KOLs are scraped → Mitigation: Categories and clear format make it easy to add entries. Could add a CLI helper later.
- **[opencc-js bundle size]** ~200KB added to server bundle → Acceptable for server-side only code. Not imported in browser bundles.
- **[Performance on 30K-char transcripts]** Dictionary with 100+ terms applied via string replacement → Mitigation: Pre-compile regex patterns at load time. Benchmark with real transcripts; expect <10ms per transcript.

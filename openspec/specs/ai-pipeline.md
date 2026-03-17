# AI Pipeline Spec

> Living spec for Baburra.io AI integration (Gemini API).

## Overview

All AI features use Google Gemini API via `src/infrastructure/api/gemini.client.ts`.

| Feature | Trigger | Output |
| --- | --- | --- |
| Sentiment analysis | Post creation / import | sentiment (-3 to +3), confidence, reasoning |
| Ticker identification | Post creation / import | stock ticker + name |
| Argument extraction | Post creation / import | Up to 5 arguments per stock |
| Draft analysis | Quick input | Combined: sentiment + ticker + arguments (one-shot) |

## Gemini Client

Two generation modes:

1. **`generateJson<T>()`** — Free-form JSON output with markdown stripping. Used by sentiment analysis, ticker ID, draft analysis.
2. **`generateStructuredJson<T>()`** — Uses `responseMimeType: "application/json"` + `responseSchema` for guaranteed valid JSON. Used by argument extraction.

**Model**: Configurable via `AI_SENTIMENT_MODEL` env var. Default: `gemini-2.5-flash-lite`.

## Argument Extraction Pipeline

```
1. Build prompt (category boundaries + fact/opinion instructions)
   ↓
2. generateStructuredJson() with ARGUMENT_RESPONSE_SCHEMA
   ↓
3. Validate & clamp (sentiment -3~+3, confidence 0~1, statementType)
   ↓
4. If count > 5: revision loop (keep top 5 by confidence)
   ↓
5. Apply hard caps (max 5 arguments)
   ↓
6. If count >= 2: verifyArguments() — cross-check categories, duplicates
   ↓
7. Return final ExtractedArgument[]
```

### Argument Categories (7 categories)

| Code | Name | Description |
| --- | --- | --- |
| FINANCIALS | 財務數據 | Internal company metrics (revenue, margins, EPS) |
| VALUATION | 估值 | Market-assigned multiples (PE, EV/EBITDA, PEG) |
| MOMENTUM | 動能 | Price action and volume patterns |
| MARKET_SIZE | 市場規模 | TAM, market share, growth opportunity |
| MOAT | 護城河 | Competitive advantages, barriers to entry |
| OPERATIONAL_QUALITY | 經營品質 | Management quality, operational efficiency |
| CATALYST | 催化劑 | Upcoming events, catalysts, risks |

### Statement Type Classification

Each argument is classified as:
- **`fact`**: Verifiable data (financial metrics, prices, dates)
- **`opinion`**: Subjective assessment or prediction
- **`mixed`**: Contains both factual data and subjective interpretation

## Quota Management

- Weekly AI usage tracked in `profiles.ai_usage_count`
- Reset via `profiles.ai_usage_reset_at`
- First import is quota-exempt via `profiles.first_import_free` flag
- Profile scrape jobs are quota-exempt (`quotaExempt: true`)
- Atomic operations: `consume_ai_quota()` and `refund_ai_quota()` DB functions

## Key Files

- `src/infrastructure/api/gemini.client.ts` — Gemini API client
- `src/domain/services/ai.service.ts` — Extraction logic + prompts
- `src/infrastructure/repositories/ai-usage.repository.ts` — Quota tracking
- `src/domain/services/import-pipeline.service.ts` — Batch import orchestrator
- `src/domain/services/profile-scrape.service.ts` — Profile scrape orchestrator

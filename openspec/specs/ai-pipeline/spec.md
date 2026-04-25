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

## Invariants

### Ticker resolution must be registry-grounded

AI-extracted tickers are not trusted as-is. Before any `stocks` row is created
or any post is linked to a stock, every Gemini-emitted `{ticker, market}` pair
MUST be passed through `resolveStock`/`resolveStocksBatch`
(`src/domain/services/ticker-resolver.service.ts`) and validated against
`stocks_master`.

- **Source of truth**: `stocks_master(ticker, name, market)`. Seeded from TWSE
  ISIN listings (TW), NASDAQ Trader symbol directories (US), a hand-curated
  manual override file (US ADRs/edge cases missed by NASDAQ Trader), and a
  curated crypto list. Refreshed via `scripts/build-tw-master.ts`,
  `scripts/build-us-master.ts`, and `scripts/seed-stocks-master.ts`.
- **Resolution**:
  - Tickers IN the master: persisted with the **master's name**, not the
    AI-supplied name. The AI's ticker form is normalized first (e.g.
    `'2357'` + `TW` → `'2357.TW'`).
  - Tickers NOT in the master: silently dropped from the post. Logged at
    info level via `[ticker-resolver]`. The pipeline does NOT retry analysis
    or attempt fuzzy fallback.
  - If every Gemini-emitted ticker is dropped, the post is short-circuited
    via the `no_resolvable_tickers` error path (mirrors the existing
    `no_tickers_identified` zero-tickers handler) and credits are refunded.
- **Why**: Gemini hallucinates company names ("宏捷" for `2353.TW`/Acer,
  "馮君" bound to 9 unrelated TW codes), invents tickers (`CHROME`, `SPACEX`,
  `MARVELL`), and emits non-canonical forms (`2357` without `.TW`). The
  master is the authority; the AI is advisory.

### `HK` market is unsupported

`IdentifiedTicker.market` includes `'HK'` for legacy enum compatibility, but
the platform only supports `US` / `TW` / `CRYPTO`. HK tickers are dropped at
the resolver boundary (skipped before `resolveStocksBatch`).

## Key Files

- `src/infrastructure/api/gemini.client.ts` — Gemini API client
- `src/domain/services/ai.service.ts` — Extraction logic + prompts
- `src/domain/services/ticker-resolver.service.ts` — Master-validation seam
- `src/infrastructure/data/{tw,us,manual_us,crypto}_master.json` — Registry sources
- `src/infrastructure/repositories/ai-usage.repository.ts` — Quota tracking
- `src/domain/services/import-pipeline.service.ts` — Batch import orchestrator
- `src/domain/services/profile-scrape.service.ts` — Profile scrape orchestrator

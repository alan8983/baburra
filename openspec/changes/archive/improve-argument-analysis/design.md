# Design: Improve Argument Analysis Quality

## Overview

Four coordinated improvements to the argument extraction pipeline in `ai.service.ts` and `gemini.client.ts`, with corresponding model/DB/UI changes.

---

## 1. Structured Output (Gemini JSON Schema)

### Gemini Client Changes (`gemini.client.ts`)

Add a new `generateStructuredJson<T>()` function that uses Gemini's native JSON mode:

```ts
export async function generateStructuredJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options?: GeminiGenerateOptions,
  model?: string
): Promise<T>
```

- Sets `generationConfig.responseMimeType = "application/json"` and `generationConfig.responseSchema = schema` in the request body.
- No markdown stripping needed — Gemini guarantees valid JSON when using this mode.
- The existing `generateJson()` remains for backward compatibility (used by sentiment analysis, ticker ID, draft analysis).
- The argument extraction prompt switches to use `generateStructuredJson()`.

### Schema Definition

Define the response schema as a constant in `ai.service.ts`:

```ts
const ARGUMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    arguments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoryCode: { type: "string", enum: ["FINANCIALS", "MOMENTUM", "VALUATION", "MARKET_SIZE", "MOAT", "OPERATIONAL_QUALITY", "CATALYST"] },
          originalText: { type: "string" },
          summary: { type: "string" },
          sentiment: { type: "integer", minimum: -3, maximum: 3 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          statementType: { type: "string", enum: ["fact", "opinion", "mixed"] }
        },
        required: ["categoryCode", "originalText", "summary", "sentiment", "confidence", "statementType"]
      }
    }
  },
  required: ["arguments"]
};
```

---

## 2. Fact vs. Opinion Classification

### New Field: `statementType`

Add `statementType: 'fact' | 'opinion' | 'mixed'` to:

| Layer | Type/Table | Field |
|-------|-----------|-------|
| AI service | `ExtractedArgument` | `statementType` |
| Domain model | `DraftAiArgument` | `statementType` |
| Repository | `PostArgument`, `CreatePostArgumentInput` | `statementType` |
| DB | `post_arguments` | `statement_type TEXT DEFAULT 'mixed'` |
| UI | `ArgumentItem` | `statementType` |

### Classification Rules (in prompt)

The prompt instructs Gemini to classify each argument:
- **`fact`**: Based on verifiable data — financial metrics, prices, dates, percentages, reported numbers. Example: "Revenue grew 40% YoY to $5.2B"
- **`opinion`**: Subjective assessment, prediction, or recommendation without specific data. Example: "I think this stock will outperform the market"
- **`mixed`**: Contains both factual data and subjective interpretation. Example: "Revenue grew 40% YoY, which I think is unsustainable"

### DB Migration

New migration `027_argument_statement_type.sql`:

```sql
ALTER TABLE post_arguments
  ADD COLUMN IF NOT EXISTS statement_type TEXT DEFAULT 'mixed';
```

No CHECK constraint — the app layer validates. Default `'mixed'` for backward compatibility with existing rows.

---

## 3. Prompt Engineering

### Rewritten `ARGUMENT_EXTRACTION_PROMPT`

Key improvements over current prompt:

1. **Category boundary examples** — Each category now includes a disambiguation note:
   - FINANCIALS: "Internal company metrics from financial statements (revenue growth, margins, EPS). NOT valuation multiples."
   - VALUATION: "Market-assigned multiples (PE, EV/EBITDA, PEG). NOT internal growth rates."
   - MOMENTUM: "Price action and volume patterns. NOT fundamental growth."
   - OPERATIONAL_QUALITY: "Comparative operational efficiency vs peers. NOT absolute financial metrics."

2. **Fact/opinion classification instructions** — Integrated into the extraction prompt so it's done in a single pass (no extra API call).

3. **Deduplication guidance** — "If two arguments express the same core thesis (e.g., 'revenue is growing fast' and 'top-line acceleration'), keep only the stronger one."

4. **Quality scoring calibration** — Concrete confidence thresholds:
   - 0.9+: Specific numbers + clear comparison or unique insight
   - 0.7–0.89: Clear claim with some supporting data
   - 0.5–0.69: General statement without specific backing
   - <0.5: Vague or tangential point

---

## 4. Multi-Pass Verification

### New `verifyArguments()` function

After the initial extraction (and optional revision loop for count > 5), add a verification pass:

```ts
async function verifyArguments(
  args: ExtractedArgument[],
  content: string,
  ticker: string,
  stockName: string
): Promise<ExtractedArgument[]>
```

This sends the extracted arguments back to Gemini with a verification prompt that asks it to:

1. **Check category assignments** — "For each argument, verify the category is correct. If an argument about PE ratio is under FINANCIALS, move it to VALUATION."
2. **Flag duplicates** — "If two arguments express the same thesis, remove the weaker one."
3. **Validate fact/opinion** — "Verify each statementType. If an argument labeled 'fact' contains no verifiable data, relabel it."

The verification prompt returns the same JSON schema, so we can reuse `generateStructuredJson()`.

### When to verify

- Only triggered when the initial extraction returns 2+ arguments (single arguments don't benefit from cross-checking).
- Uses the same temperature (0.3) and model.
- The verification call uses a lower `maxOutputTokens` (1024) since it's refining, not generating.

### Cost consideration

This adds one extra Gemini call per stock. For `gemini-2.5-flash-lite`, this is negligible in cost but adds ~1-2s latency. The quality improvement justifies this — particularly for reducing category misclassification which currently degrades the per-category view.

---

## 5. UI Changes

### ArgumentCard Enhancement

In `post-arguments.tsx`, add a small badge to each argument card showing the statement type:

```tsx
// Inside ArgumentCard, after the category line
{argument.statementType && argument.statementType !== 'mixed' && (
  <Badge variant="outline" className="text-[10px]">
    {argument.statementType === 'fact' ? t('ai.fact') : t('ai.opinion')}
  </Badge>
)}
```

- `fact` shows a subtle badge (e.g., "事實" / "Fact")
- `opinion` shows a subtle badge (e.g., "觀點" / "Opinion")
- `mixed` shows no badge (default, most common — avoids visual noise)

### Translation Keys

Add to `src/messages/zh-TW/common.json` and `src/messages/en/common.json`:
- `ai.fact`: "事實" / "Fact"
- `ai.opinion`: "觀點" / "Opinion"

---

## 6. Data Flow Changes

### Updated `extractArguments()` flow

```
1. Build prompt (with improved category examples + fact/opinion instructions)
   ↓
2. Call generateStructuredJson() with ARGUMENT_RESPONSE_SCHEMA
   ↓
3. Validate & clamp (same as before, plus statementType validation)
   ↓
4. If count > 5: revision loop (same as before, also uses structured output)
   ↓
5. Apply hard caps (same logic)
   ↓
6. If count >= 2: verifyArguments() — cross-check categories, duplicates, types
   ↓
7. Return final arguments
```

### Repository changes

- `CreatePostArgumentInput` gains optional `statementType?: string`
- `createPostArgument()` and `createPostArguments()` include `statement_type` in insert
- `replacePostArguments()` includes `statement_type` in insert
- `mapPostArgument()` maps `statement_type` → `statementType`

### Draft model changes

- `DraftAiArgument.statementType` added (same type)
- Draft storage/retrieval passes through the new field in the JSON column

---

## 7. Backward Compatibility

- Existing `post_arguments` rows get `statement_type = 'mixed'` (the default).
- Existing `generateJson()` function unchanged — only argument extraction moves to `generateStructuredJson()`.
- The `applyHardCaps()` function unchanged — it already works on the `ExtractedArgument` array regardless of new fields.
- Reanalysis endpoint (`/api/posts/[id]/reanalyze`) will produce the new fields when re-run, naturally backfilling.

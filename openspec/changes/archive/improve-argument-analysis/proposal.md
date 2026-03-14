# Proposal: Improve Argument Analysis Quality

## What

Upgrade the AI argument extraction pipeline with four improvements:

1. **Fact vs. Opinion classification** — Add a thinking layer that classifies each sentence as a factual statement or an opinion before extracting arguments, so the final output distinguishes data-backed claims from subjective views.
2. **Prompt engineering** — Rewrite the `ARGUMENT_EXTRACTION_PROMPT` with clearer category boundaries, better deduplication guidance, and explicit examples to reduce category misclassification (e.g. VALUATION vs FINANCIALS confusion).
3. **Structured output (JSON schema)** — Use Gemini's `responseMimeType: "application/json"` with a `responseSchema` to enforce output shape at the API level, eliminating markdown-stripping hacks and parse failures.
4. **Multi-pass analysis** — Add a verification pass after initial extraction that cross-checks arguments for duplicates, validates category assignments, and scores argument quality.

## Why

1. **Fact/opinion distinction matters for credibility scoring** — A KOL who makes claims backed by earnings data ("revenue grew 40% YoY") is more credible than one offering vague opinions ("I think this stock will moon"). Classifying this gives users a new quality signal.

2. **Category misclassification degrades the framework** — When VALUATION arguments (PE ratio discussion) get bucketed under FINANCIALS, the per-category analysis view becomes unreliable. Users lose trust in the breakdown.

3. **Parse failures waste AI quota** — When Gemini wraps JSON in markdown or returns malformed output, the call fails and the user's weekly quota is consumed with no result. Structured output eliminates this class of errors.

4. **Single-pass extraction misses quality issues** — The current revision loop only triggers when count > 5. It doesn't catch duplicates, miscategorized arguments, or low-quality summaries that slip through under the count threshold.

## Scope

### In scope
- New `statementType` field on `ExtractedArgument` and `DraftAiArgument` (`"fact"` | `"opinion"` | `"mixed"`)
- Rewritten argument extraction prompt with category boundary examples and fact/opinion classification instructions
- Gemini client support for `responseSchema` (structured JSON output)
- New verification pass in `extractArguments()` that deduplicates and validates categories
- Updated argument display to show fact/opinion badge
- DB migration to add `statement_type` column to `post_arguments`
- Updated tests

### Out of scope
- Model upgrade (gemini-2.5-flash-lite → pro) — separate change
- Changes to sentiment analysis or ticker identification prompts
- Changes to the draft analysis one-shot prompt (only argument extraction is affected)
- A/B testing infrastructure
- UI redesign of the argument tabs

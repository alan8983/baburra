## Why

The import pipeline is broken for real-world usage: post creation fails due to a missing `statement_type` column in the remote DB (#69), and AI analysis of long transcripts produces truncated JSON that fails to parse (#70). Both bugs were discovered during Gooaye EP 601-650 batch scrape validation and block any multi-ticker video processing.

## What Changes

- **Apply pending migration** for `post_arguments.statement_type` column and regenerate TypeScript types so the `create_post_atomic` RPC succeeds.
- **Increase `maxOutputTokens`** in `analyzeDraftContent()` and switch from `generateJson` to `generateStructuredJson` with a response schema, eliminating truncation and guaranteeing valid JSON output for long transcripts.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `ai-pipeline`: `analyzeDraftContent()` changes from free-form `generateJson` (1536 tokens) to schema-enforced `generateStructuredJson` (4096 tokens) to handle long transcripts without truncation.

## Impact

- **Database**: Migration 028 (`028_argument_statement_type.sql`) must be applied to remote DB; `database.types.ts` regenerated.
- **AI service**: `src/domain/services/ai.service.ts` — `analyzeDraftContent()` method signature changes internally (same return type).
- **Gemini client**: No structural changes; existing `generateStructuredJson` is reused.
- **Risk**: Low — migration adds a column with a DEFAULT value (non-breaking), and structured JSON is already proven in `extractArguments()` and `verifyArguments()`.

## Context

Two bugs discovered during Gooaye EP 601-650 batch scrape block the import pipeline:

1. **#69 — Missing `statement_type` column**: Migration 028 is recorded as applied in `supabase_migrations`, but `post_arguments.statement_type` does NOT physically exist in the remote DB. The `create_post_atomic` RPC references it → INSERT fails. TypeScript types also lack the column.
2. **#70 — Truncated JSON**: `analyzeDraftContent()` uses `generateJson()` with `maxOutputTokens: 1536`. For long transcripts (~30K chars, 5-10 tickers), the JSON response exceeds 1536 tokens and gets truncated mid-way, causing `JSON.parse()` to fail.

## Goals / Non-Goals

**Goals:**
- Fix the remote DB so `statement_type` column exists and `create_post_atomic` succeeds
- Regenerate `database.types.ts` to include the column
- Eliminate JSON truncation for draft analysis by switching to structured output with higher token limit
- Both fixes must be backward-compatible (no breaking changes)

**Non-Goals:**
- Refactoring the entire AI pipeline
- Changing the draft analysis prompt structure or adding new fields
- Investigating why migration 028 didn't physically apply (likely a transient Supabase issue)

## Decisions

### D1: Apply column via new migration (not repair)

**Decision**: Create a new migration `20260414000000_add_statement_type_column.sql` using `ADD COLUMN IF NOT EXISTS` rather than attempting `supabase migration repair`.

**Rationale**: `migration repair` is destructive and risky. A new `IF NOT EXISTS` migration is idempotent and safe — if the column somehow exists later, it's a no-op.

**Alternatives considered**:
- `supabase migration repair` — too risky, modifies migration history
- Manual SQL via Supabase dashboard — not tracked in version control

### D2: Switch `analyzeDraftContent()` to `generateStructuredJson()`

**Decision**: Replace `generateJson<RawDraftAnalysis>()` with `generateStructuredJson<RawDraftAnalysis>()` and provide a response schema. Increase `maxOutputTokens` to 4096.

**Rationale**:
- `generateStructuredJson()` uses Gemini's `responseMimeType: "application/json"` + `responseSchema`, which **guarantees** valid JSON — no truncation/parse failures
- Already proven in `extractArguments()` (2048 tokens) and `verifyArguments()` (1024 tokens)
- 4096 tokens provides comfortable headroom for 5-10 tickers with full metadata + reasoning
- Flash Lite handles 4096 output tokens efficiently (minimal cost increase)

**Alternatives considered**:
- Just increase `maxOutputTokens` to 4096 with `generateJson()` — fixes most cases but still vulnerable to edge-case truncation without schema enforcement
- Dynamic token scaling based on input length — over-engineered for this fix

### D3: Define `RawDraftAnalysis` response schema

**Decision**: Create a JSON Schema object matching the existing `RawDraftAnalysis` interface and pass it to `generateStructuredJson()`.

**Rationale**: The schema already exists implicitly in the TypeScript interface (lines 813-832 of ai.service.ts). We just need to express it as a JSON Schema for Gemini's `responseSchema` parameter.

## Risks / Trade-offs

- **[Risk] Migration 028 re-execution** → `IF NOT EXISTS` makes it idempotent; no data loss possible.
- **[Risk] Schema enforcement changes Gemini output quality** → Low risk — the same model and prompt are used, just with tighter output constraints. `generateStructuredJson()` is already battle-tested in the same codebase.
- **[Trade-off] 4096 tokens vs cost** → Flash Lite output tokens are cheap (~$0.15/M). Even at 4096 per call, cost is negligible. Reliability is worth the extra tokens.

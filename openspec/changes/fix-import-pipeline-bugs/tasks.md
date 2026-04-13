## 1. Fix missing `statement_type` column (#69)

- [x] 1.1 Create migration `20260414000000_add_statement_type_column.sql` with `ALTER TABLE post_arguments ADD COLUMN IF NOT EXISTS statement_type TEXT DEFAULT 'mixed'`
- [x] 1.2 Apply migration to remote DB via `supabase db push` (with user confirmation)
- [x] 1.3 Regenerate `src/infrastructure/supabase/database.types.ts` and verify `statement_type` appears in `post_arguments` types

## 2. Fix truncated JSON in `analyzeDraftContent()` (#70)

- [x] 2.1 Define `DRAFT_ANALYSIS_RESPONSE_SCHEMA` JSON Schema object matching the `RawDraftAnalysis` interface in `ai.service.ts`
- [x] 2.2 Replace `generateJson<RawDraftAnalysis>()` call with `generateStructuredJson<RawDraftAnalysis>()` using the schema, set `maxOutputTokens: 4096`
- [x] 2.3 Remove markdown cleanup logic that is no longer needed (structured JSON doesn't wrap in code blocks)

## 3. Verification

- [x] 3.1 Run `npm run type-check` to confirm types compile cleanly
- [x] 3.2 Run existing AI service tests (`npx vitest run src/domain/services`) to confirm no regressions

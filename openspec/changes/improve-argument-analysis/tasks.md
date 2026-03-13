# Tasks: Improve Argument Analysis Quality

## Task Checklist

### Phase 1: Infrastructure

- [x] **1.1** Add `generateStructuredJson()` to `src/infrastructure/api/gemini.client.ts`
  - New function that sets `responseMimeType: "application/json"` and `responseSchema` in the Gemini request
  - Keep existing `generateJson()` unchanged for other callers
  - Add unit tests for the new function

- [x] **1.2** Create DB migration `supabase/migrations/027_argument_statement_type.sql`
  - Add `statement_type TEXT DEFAULT 'mixed'` column to `post_arguments`

### Phase 2: Domain Models & Types

- [x] **2.1** Add `statementType` field to domain types
  - `ExtractedArgument` in `src/domain/services/ai.service.ts` — add `statementType: 'fact' | 'opinion' | 'mixed'`
  - `DraftAiArgument` in `src/domain/models/draft.ts` — add `statementType: 'fact' | 'opinion' | 'mixed'`
  - `PostArgument` in `src/infrastructure/repositories/argument.repository.ts` — add `statementType: string | null`
  - `ArgumentItem` in `src/components/ai/post-arguments.tsx` — add `statementType: string | null`

- [x] **2.2** Update repository layer
  - `CreatePostArgumentInput` — add optional `statementType`
  - `createPostArgument()` and `createPostArguments()` — include `statement_type` in insert
  - `replacePostArguments()` — accept and insert `statementType`
  - `mapPostArgument()` — map `statement_type` → `statementType`

### Phase 3: Prompt Engineering & Multi-Pass

- [x] **3.1** Define `ARGUMENT_RESPONSE_SCHEMA` constant in `ai.service.ts`
  - JSON Schema for the structured output, including `statementType` enum

- [x] **3.2** Rewrite `ARGUMENT_EXTRACTION_PROMPT`
  - Add category boundary disambiguation examples (FINANCIALS vs VALUATION, MOMENTUM vs FINANCIALS, etc.)
  - Add fact/opinion classification instructions with examples
  - Add deduplication guidance
  - Add confidence calibration thresholds (0.9+, 0.7–0.89, 0.5–0.69, <0.5)

- [x] **3.3** Update `buildRevisionPrompt()` to include `statementType` in the expected output format

- [x] **3.4** Implement `verifyArguments()` function in `ai.service.ts`
  - Takes extracted arguments + context, returns refined arguments
  - Verification prompt checks: category correctness, duplicates, statementType accuracy
  - Only triggered when initial extraction returns 2+ arguments
  - Uses `generateStructuredJson()` with the same schema

- [x] **3.5** Update `extractArguments()` flow
  - Switch from `generateJson()` to `generateStructuredJson()` with schema
  - Add `statementType` to `validateAndClamp()`
  - Wire in `verifyArguments()` after hard caps
  - Update the return type

### Phase 4: API & Storage Integration

- [x] **4.1** Update `/api/ai/extract-arguments/route.ts`
  - Pass `statementType` through to `createPostArguments()`

- [x] **4.2** Update `/api/ai/extract-draft-arguments/route.ts`
  - Include `statementType` in draft AI arguments response

- [x] **4.3** Update `/api/posts/[id]/reanalyze/route.ts`
  - Pass `statementType` through `replacePostArguments()`

- [x] **4.4** Update quick-input and import pipeline
  - `src/app/api/quick-input/route.ts` — pass `statementType` in draft AI arguments
  - `src/domain/services/import-pipeline.service.ts` — pass `statementType` to argument storage

### Phase 5: UI

- [x] **5.1** Add translation keys
  - `src/messages/zh-TW/common.json`: `ai.fact` = "事實", `ai.opinion` = "觀點"
  - `src/messages/en/common.json`: `ai.fact` = "Fact", `ai.opinion` = "Opinion"

- [x] **5.2** Update `ArgumentCard` in `src/components/ai/post-arguments.tsx`
  - Show fact/opinion badge for non-mixed arguments
  - Thread `statementType` through `ArgumentItem` type

- [x] **5.3** Update argument display in `src/components/ai/stock-arguments-tab.tsx`
  - Thread `statementType` through to the argument timeline/cards

### Phase 6: Tests & Docs

- [x] **6.1** Update/add unit tests in `src/domain/services/__tests__/ai.service.test.ts`
  - Test `statementType` validation in `validateAndClamp`
  - Test `verifyArguments()` function
  - Test `applyHardCaps()` still works with new field
  - Test new prompt produces valid structured output (mock)

- [x] **6.2** Update `docs/WEB_DEV_PLAN.md` and `docs/BACKLOG.md`
  - Document the argument analysis improvement

- [x] **6.3** Run `npm run type-check && npm run lint && npm test` — fix any issues

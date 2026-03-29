## 1. Database Migrations

- [x] 1.1 Create migration: add `validation_status`, `validation_score`, `validated_at`, `validated_by` columns to `kols` table with index. Set existing rows to `validation_status = 'active'`.
- [x] 1.2 Create migration: add `source`, `inference_reason` columns to `post_stocks` table. Set existing rows to `source = 'explicit'`.
- [x] 1.3 Update `create_post_atomic` RPC function to accept and store `source` and `inference_reason` for post_stocks.
- [x] 1.4 Push migrations to Supabase and regenerate TypeScript types (`database.types.ts`).

## 2. Domain Models

- [x] 2.1 Update `KOL` interface in `src/domain/models/kol.ts` with `validationStatus`, `validationScore`, `validatedAt`, `validatedBy` fields. Add `ValidationScore` type.
- [x] 2.2 Update `PostStockLink` in `src/domain/models/post.ts` with `source` and `inferenceReason` fields.
- [x] 2.3 Update `IdentifiedTicker` in `src/domain/services/ai.service.ts` with `source` and `inferenceReason` fields.
- [x] 2.4 Update `ScrapeJob` model in `src/domain/models/kol-source.ts` to include `'validation_scrape'` in job type union.

## 3. AI Pipeline — Macro Inference

- [x] 3.1 Enhance `buildDraftAnalysisPrompt` in `ai.service.ts` with macro-to-instrument inference rules and examples (the mapping table from the proposal).
- [x] 3.2 Update prompt JSON output schema to include `source` and `inferenceReason` per ticker.
- [x] 3.3 Update `analyzeDraftContent` return parsing to populate `source` and `inferenceReason` on `IdentifiedTicker` objects.
- [x] 3.4 Add unit tests for macro inference scenarios: explicit ticker, inferred ticker, mixed post, no-ticker post.

## 4. Repositories

- [x] 4.1 Update `kol.repository.ts`: add mapping for new validation fields in `mapKol()`, add `updateValidationStatus()` and `findKolsByValidationStatus()` methods.
- [x] 4.2 Update `post.repository.ts`: propagate `source` and `inference_reason` through post creation and include in post-stock queries.
- [x] 4.3 Update `scrape-job.repository.ts`: support `'validation_scrape'` job type, add `findValidationJobByKolId()` method.

## 5. Validation Service

- [x] 5.1 Create `src/domain/services/kol-validation.service.ts` with qualification scoring function: accepts KOL ID + post data, calculates coverage/directionality/depth, returns pass/fail with `ValidationScore`.
- [x] 5.2 Implement validation lifecycle handler: on validation scrape completion, run scoring, update KOL status (`active` or `rejected`), delete posts if rejected.
- [x] 5.3 Add unit tests for scoring logic: passing KOL, failing each criterion independently, edge cases (zero posts, all neutral sentiment).

## 6. Import Pipeline Integration

- [x] 6.1 Update `import-pipeline.service.ts` to pass `source` and `inferenceReason` from AI analysis through to `createPost` / post_stocks creation.
- [x] 6.2 Add validation scrape mode: limit to 10 posts, skip quota consumption, trigger scoring on completion.

## 7. API Routes

- [x] 7.1 Update `GET /api/kols` to accept `validationStatus` query param, default to `active` filter.
- [x] 7.2 Update `GET /api/kols/[id]` response to include validation fields.
- [x] 7.3 Update `PATCH /api/kols/[id]` to support admin validation status override (only `rejected` → `active`).
- [x] 7.4 Update `POST /api/scrape/profile` to detect new KOL and create `validation_scrape` job instead of `initial_scrape`.
- [x] 7.5 Update `GET /api/posts/[id]` and `GET /api/posts` to include `source` and `inferenceReason` in stock link data.

## 8. UI — KOL List & Scrape Page

- [x] 8.1 Update KOL list page to filter by `validation_status = 'active'` by default. Add status filter tabs/dropdown for `pending`/`rejected`.
- [x] 8.2 Update scrape/input page to show validation status indicator: "驗證中..." → "已通過" or "未通過：[reason]".
- [x] 8.3 Update React Query hook `useKols` to accept and pass `validationStatus` parameter.

## 9. UI — Inferred Ticker Indicators

- [x] 9.1 Add "推論" badge component for inferred tickers on post detail and argument cards, with tooltip: "此標的為系統根據宏觀分析推論，非 KOL 直接提及".
- [x] 9.2 Add win rate footnote: "此勝率包含系統推論的關聯標的" when any post in the calculation has inferred tickers.

## 10. Cron Job Update

- [x] 10.1 Update `process-jobs` cron handler to process `validation_scrape` jobs with the validation-specific behavior (post limit, quota exemption, scoring trigger).

## 11. Integration Testing

- [x] 11.1 Test full validation flow: nominate KOL URL → validation scrape → scoring → status transition (both pass and reject paths).
- [x] 11.2 Test that existing KOLs and post_stocks are unaffected by migrations (backward compatibility).
- [x] 11.3 Test admin override: rejected KOL → manually set active.

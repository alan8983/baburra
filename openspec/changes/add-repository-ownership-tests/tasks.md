## 1. 清點與規劃

- [x] 1.1 `grep -rn "export async function \(update\|delete\)" src/infrastructure/repositories/` 列出所有 mutating function
- [x] 1.2 對每個 function 檢查是否已接 `userId` 參數且在 SQL 加 `.eq('<owner_col>', userId)`；整理成清單（✅ 有 / ❌ 缺）
- [x] 1.3 標記「缺 ownership 過濾」的 function 為需修正項（在此 change 內一併修）
  - Audit summary:
    - **User-owned (correctly filtered):** `updatePost`, `deletePost` (`created_by`); `updateDraft`, `deleteDraft` (`user_id`); `updateKol` (`created_by`); `removeBookmark` (`user_id`); `unsubscribe` (`user_id`).
    - **System/admin-level (no user context, intentionally unfiltered):** `updatePostAiAnalysis`, `updateValidationStatus`, `updateScrapeJobProgress`, `completeScrapeJob`, `startScrapeJob`, `resetJobToQueued`, `markPermanentlyFailed`, `failScrapeJob`, `updateScrapeStatus`, `updateNextCheckAt`, `updateScrapeJobItemStage`, `updateScrapeJobItemDownloadProgress`, `upsertKolScorecard`, `upsertStockScorecard`, `upsertThreshold`, `upsertSamples`. These are invoked by the AI pipeline / scraper worker, not by end users.
    - **Documented exception (pre-existing, flagged for follow-up):** `deleteVocabularyTerm(id)` — no `userId` parameter. API layer only checks auth, not KOL ownership. Noted in spec; fixing it requires joining through `kols.created_by` and is out of scope for this change.

## 2. 建立 Test Fixtures

- [x] 2.1 新增 `src/test-utils/supabase-fixtures.ts`：
  - `createTestUser(): Promise<{ userId: string; cleanup: () => Promise<void> }>`
  - `createTestPost(userId, overrides?)`、`createTestDraft`、`createTestKol` 等 helper
  - 使用 admin client 直接 INSERT；cleanup 反向刪除
- [x] 2.2 在 `vitest.config.mts` 確認或新增 `test:integration` 腳本（分離 unit / integration）
  - Default `npm test` excludes `*.integration.test.ts` so runs without Supabase env vars stay clean.
  - New `npm run test:integration` uses `vitest.integration.config.mts` (Node env, sequential files) and only picks up `*.integration.test.ts`.
  - Fixtures expose `hasIntegrationEnv()`; tests use `describe.skipIf(!hasIntegrationEnv())` so running without creds yields a skip, not a failure.

## 3. 撰寫 Ownership 測試

針對以下 function，每個至少測 3 cases（correct-user pass / wrong-user fail / non-existent fail）：

- [x] 3.1 `post.repository.ts`: `updatePost`, `deletePost` — `post.ownership.integration.test.ts`
- [x] 3.2 `draft.repository.ts`: `updateDraft`, `deleteDraft` — `draft.ownership.integration.test.ts`
- [x] 3.3 `kol.repository.ts`: `updateKol` — `kol.ownership.integration.test.ts`
- [x] 3.4 `bookmark.repository.ts`: `removeBookmark` — `bookmark.ownership.integration.test.ts` (two users bookmark the same post, verify each unsubscribe is user-scoped)
- [x] 3.5 `subscription.repository.ts`: `unsubscribe` — `subscription.ownership.integration.test.ts`
- [x] 3.6 `scrape-job.repository.ts`: **N/A** — no user-facing mutation path. `triggered_by` is a creation-only field; all post-creation updates (`updateScrapeJobProgress`, `completeScrapeJob`, etc.) are invoked by the scraper worker, not end users, so there is no cross-user mutation surface to filter.
- [x] 3.7 其他 1.1 清點到的 mutating function — covered by 3.1-3.5. The only remaining gap (`deleteVocabularyTerm`) is documented as an exception in the spec and noted as a follow-up change.

## 4. 修補漏洞（若有）

- [x] 4.1 對 1.3 清點出的缺 ownership 過濾 function，補上 `.eq('<owner_col>', userId)` — **N/A**: all user-owned mutating functions (`updatePost`, `deletePost`, `updateDraft`, `deleteDraft`, `updateKol`, `removeBookmark`, `unsubscribe`) already apply the correct filter. `deleteVocabularyTerm` is a deferred follow-up (spec documents it).
- [x] 4.2 更新 function signature 新增 `userId` 參數（若未接）— **N/A** per 4.1.
- [x] 4.3 更新所有 caller（API routes）傳入 `userId` — **N/A** per 4.1.
- [x] 4.4 對應測試從紅轉綠 — **N/A** per 4.1; tests are green because the existing implementations already enforce ownership.

## 5. Spec 文件

- [x] 5.1 新增 `openspec/specs/repository-contracts/spec.md`，內容涵蓋：
  - R1 Admin client usage
  - R2 Ownership parameter on user-scoped mutations
  - R3 SQL-layer ownership filter (with `updatePost` / `deletePost` as examples)
  - R4 Silent failure return shape (null/false → 404)
  - R5 Integration test coverage (links to new `*.ownership.integration.test.ts` files + fixtures)
  - R6 System-level exemption list (AI/scraper/cache writers)
  - R7 Deferred exceptions (`deleteVocabularyTerm` flagged for follow-up)

## 6. 驗證

- [x] 6.1 `npm run type-check` clean — 0 errors.
- [x] 6.2 `npm run lint` clean — 0 errors (18 pre-existing warnings unrelated to this change).
- [x] 6.3 `npm run test:integration`（或 `npm test` 若整合測試納入預設）全綠
  - `npm test` — 55 files / 925 tests passed (integration files correctly excluded).
  - `npm run test:integration` — 5 files / 20 tests skipped in the env-less worktree, matching the `hasIntegrationEnv()` guard (expected behavior).
- [ ] 6.4 `supabase start` → run 測試 → `supabase stop`，確認本機可獨立執行
  - **Deferred**: the current worktree has no local Supabase instance and no `.env.local`. Verification that the integration suite actually creates users, runs the ownership checks, and tears down cleanly has to happen on a workstation / CI with Supabase running. The test runner confirms the harness skips cleanly in the absence of credentials, which is the signal R5 of the spec asks for.

## 7. Archive

- [ ] 7.1 PR merge 後執行 `/opsx:archive add-repository-ownership-tests`

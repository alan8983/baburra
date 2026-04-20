## 1. 清點與規劃

- [ ] 1.1 `grep -rn "export async function \(update\|delete\)" src/infrastructure/repositories/` 列出所有 mutating function
- [ ] 1.2 對每個 function 檢查是否已接 `userId` 參數且在 SQL 加 `.eq('<owner_col>', userId)`；整理成清單（✅ 有 / ❌ 缺）
- [ ] 1.3 標記「缺 ownership 過濾」的 function 為需修正項（在此 change 內一併修）

## 2. 建立 Test Fixtures

- [ ] 2.1 新增 `src/test-utils/supabase-fixtures.ts`：
  - `createTestUser(): Promise<{ userId: string; cleanup: () => Promise<void> }>`
  - `createTestPost(userId, overrides?)`、`createTestDraft`、`createTestKol` 等 helper
  - 使用 admin client 直接 INSERT；cleanup 反向刪除
- [ ] 2.2 在 `vitest.config.mts` 確認或新增 `test:integration` 腳本（分離 unit / integration）

## 3. 撰寫 Ownership 測試

針對以下 function，每個至少測 3 cases（correct-user pass / wrong-user fail / non-existent fail）：

- [ ] 3.1 `post.repository.ts`: `updatePost`, `deletePost`
- [ ] 3.2 `draft.repository.ts`: `updateDraft`, `deleteDraft`
- [ ] 3.3 `kol.repository.ts`: `updateKol`（若此 function 按 creator 過濾）
- [ ] 3.4 `bookmark.repository.ts`: `removeBookmark`（已用 user_id filter，仍加測確認）
- [ ] 3.5 `subscription.repository.ts`: mutating functions
- [ ] 3.6 `scrape-job.repository.ts`: mutating functions（若 job 有 owner 概念）
- [ ] 3.7 其他 1.1 清點到的 mutating function

## 4. 修補漏洞（若有）

- [ ] 4.1 對 1.3 清點出的缺 ownership 過濾 function，補上 `.eq('<owner_col>', userId)`
- [ ] 4.2 更新 function signature 新增 `userId` 參數（若未接）
- [ ] 4.3 更新所有 caller（API routes）傳入 `userId`
- [ ] 4.4 對應測試從紅轉綠

## 5. Spec 文件

- [ ] 5.1 新增 `openspec/specs/repository-contracts/spec.md`，內容涵蓋：
  - Repository 層使用 `createAdminClient()` 的原因
  - Mutating function 必須接 `userId` 參數
  - 必須在 SQL 層加 `.eq('<owner_col>', userId)` 做最終防線
  - 失敗時回傳 null/false，不 throw（讓 API layer 轉 404）
  - 範例程式碼（引用 `updatePost` / `deletePost`）

## 6. 驗證

- [ ] 6.1 `npm run type-check` clean
- [ ] 6.2 `npm run lint` clean
- [ ] 6.3 `npm run test:integration`（或 `npm test` 若整合測試納入預設）全綠
- [ ] 6.4 `supabase start` → run 測試 → `supabase stop`，確認本機可獨立執行

## 7. Archive

- [ ] 7.1 PR merge 後執行 `/opsx:archive add-repository-ownership-tests`

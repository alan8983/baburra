## Context

Baburra 的授權模型：
- `createAdminClient()` 用 Service Role Key，bypass RLS
- 所有 repository 都用 admin client
- 單一授權邊界 = application layer（API route + repository function）

這個模型的**脆弱點**是「新人/未來的自己忘了加 ownership 檢查」。抽樣看到 `updatePost` / `deletePost` 有加 `.eq('created_by', userId)`，但這是慣例不是強制——沒有 lint rule，沒有 type signature 強制，沒有測試監督。

目的：把「慣例」升級成「測試覆蓋的契約」。

Stakeholder：安全、未來維護者。

## Goals / Non-Goals

**Goals:**
- 建立 repository ownership 測試範本
- 覆蓋所有現存「需驗 owner」的 mutating function
- 文件化 convention，供未來新增 function 時參考

**Non-Goals:**
- 不重寫成 RLS-based 授權（工時過大）
- 不引入 TypeScript brand type 或 runtime ownership helper（scope 過大）
- 不做 end-to-end 測試（由 Playwright 另外負責）

## Decisions

### D1. 測試執行方式：真正連測試 DB（整合測試）

**Chosen**：使用 Supabase 本機 instance（或 CI 提供的 test project），真正 INSERT/UPDATE/DELETE，驗證授權行為。

**Alternative considered**：用 vitest mock `createAdminClient()`。拒絕理由：mock 可能讓測試假陽性——mock 不會自己拒絕 cross-user 存取，除非你 mock 出正確的 SQL 行為，而那等於重寫 SQL 引擎。

**Cost**：測試需要本機 Supabase 或 CI 設定。專案已有 Supabase migration workflow，成本可接受。

### D2. 測試檔組織

兩種選擇：
- **A**：集中於 `src/infrastructure/repositories/__tests__/ownership.integration.test.ts`
- **B**：分散到各 repo 的測試檔，每個檔案底部加 `describe('ownership')`

**Chosen**：B（分散）。理由：
- 跟著 repo 走，新增 function 時容易記得加測試
- 單檔可以 focus 執行（`vitest run src/infrastructure/repositories/__tests__/post.repository.test.ts`）
- 但建一個共用 `test-fixtures.ts` 放兩個測試使用者 + helper

### D3. Ownership 失敗的標準回傳

**Chosen**：統一為「靜默失敗」（回 null / false），不 throw。
- `updateX(id, wrongUserId, ...)` → null
- `deleteX(id, wrongUserId)` → false

**理由**：
- 這是現行 `updatePost` / `deletePost` 的行為
- API layer 把 null/false 轉成 404（不洩漏「該資源存在但你不能動」的資訊）

**若發現某 function 用不同行為（例：throw）**：在此 change 統一成 null/false，並更新呼叫端。

### D4. Test fixture：直接用 Supabase admin client 插入

為避免真正走 Supabase Auth（需 email / password），在 fixture 裡直接 INSERT profiles 列 + 用假的 UUID 當 userId。測試 teardown 刪除。

### D5. Spec 文件位置

現有 `openspec/specs/` 有 `data-models/spec.md` 與 `api-contracts/spec.md`。新增 `repository-contracts/spec.md` 專放 repo 層約定（ownership、命名、admin client 使用時機）。

## Risks / Trade-offs

- **[R1]** 若本機沒跑 Supabase，測試需在 CI 跑 → Mitigation：在測試檔頂加 `beforeAll` 檢測連線，skip with clear message；CI 上必跑
- **[R2]** 整合測試速度慢 → Mitigation：可標 `@integration`，預設 `npm test` 只跑 unit；`npm run test:integration` 跑全部
- **[R3]** 若發現某 function 真的沒做 ownership 過濾（production bug） → 在本 change 內補修；寫進 tasks.md，PR 會明顯看到

## Migration Plan

1. 清點所有 mutating repository function（grep `export.*function (update|delete)`）
2. 為每個建立 fixture + 測試
3. 若測試發現 function 缺 ownership filter，修 code
4. 新增 `openspec/specs/repository-contracts/spec.md` 說明 convention
5. 本地跑 `npm run test:integration`
6. CI 綠燈 → merge

**Rollback**：revert 測試與 spec；若有修 repository bug，該修復照樣保留（bug fix 應留著）

## Open Questions

- 測試 DB 要用 `supabase start` 的本機 instance 還是 dedicated Supabase test project？→ **決定**：優先用本機 instance（已有 Supabase CLI workflow），CI 上也跑本機 instance
- 測試 fixture 是否需要共用給其他未來測試？→ 是，放 `src/test-utils/supabase-fixtures.ts`

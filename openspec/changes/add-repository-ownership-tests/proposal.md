## Why

架構審查（`/root/.claude/plans/ancient-imagining-papert.md` H3 條目）指出：所有 repository 都用 `createAdminClient()` 繞過 RLS，**授權邊界完全押在 application layer**。這是專案刻意的設計選擇，但也意味著 DB 層沒有後備防線。

抽樣檢查顯示 `updatePost` / `deletePost` 確實在 SQL 層加了 `.eq('created_by', userId)`（`src/infrastructure/repositories/post.repository.ts:334, 423`），提供第二道防線。但**其他變更類 repository function 是否一致加了類似檢查，目前沒人知道**——而且沒有自動化測試會在有人忘記時發出警告。

這個 change 的目的是：
1. 為所有「變更 + 需驗擁有者」的 repository function 加整合測試
2. 測試樣式統一：「用錯誤 userId 呼叫，應回 null/false/throw Forbidden」
3. 未來新增變更類 function 時，有明確範本可抄

## What Changes

- 新增 `src/infrastructure/repositories/__tests__/ownership.integration.test.ts`（或分散到各 repo 測試檔）
- 覆蓋所有「需驗 owner」的 mutating function：
  - `updatePost(id, userId, input)` — 錯誤 userId 應回 null
  - `deletePost(id, userId)` — 錯誤 userId 應回 false
  - `updateDraft(id, userId, input)`、`deleteDraft(id, userId)`
  - `updateKol(id, userId, input)`、`deleteKol(id, userId)`（若存在）
  - `removeBookmark(userId, postId)`（雖然 filter by user_id，但仍測）
  - `updateSubscription`、`deleteSubscription`（若存在）
- 建立共用的 test fixture helper：插入兩個假使用者 + 各自的資料 → 驗證 cross-user access 失敗
- **若發現某個 mutating function 沒加 ownership 過濾**，在此 change 內**補上**（屬於修 bug 而非 scope creep）
- 文件：在 `openspec/specs/data-models/spec.md` 或 new `openspec/specs/repository-contracts/spec.md` 補上「mutating repo function 必須接 userId 參數且做 ownership 過濾」的 convention

**非目標**：
- 不重構成 RLS-enforced 模型（那是更大的 H3 完整解法，另開 change）
- 不改 API layer 授權（本 change 只管 repo 層）
- 不加 E2E 測試（只做 repository 單元/整合測試）

## Capabilities

### New Capabilities
- `repository-ownership-contract`: 明文定義「變更類 repository function 必須在 SQL 層用 owner 欄位過濾」的設計規約，並提供測試範本驗證之

## Impact

- **Code**: 新增測試檔；若發現漏洞可能動到 1-2 個 repository 檔
- **Tests**: 新增 ~15-20 個 ownership test cases
- **DB**: 無變更（測試用 Supabase test instance 或 mock）
- **Docs/specs**: 可能新增 `openspec/specs/repository-contracts/spec.md`（視現有 specs 結構而定）
- **User-visible**: 無
- **Dependencies**: 無
- **Independence**: **完全獨立**，新增測試檔為主，可與其他 architecture-review change 並行。若發現 production bug 需修 repository code，該修改也只影響該 repo 檔，不干擾其他 change

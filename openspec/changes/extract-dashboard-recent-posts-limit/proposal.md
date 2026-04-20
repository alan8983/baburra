## Why

`src/app/api/dashboard/route.ts:92` 硬編碼 `limit: 5` 取最近 5 篇 post。這個 magic number：
1. 沒有命名語意（為什麼是 5？）
2. 可能在前端 UI 也假設 5 筆做 layout（未驗證），兩邊不同步改會出 bug
3. 若 PM 想試「改成 10 看轉換率」需要改 code + 部署
4. 是典型的「小痛點堆積成 tech debt」的案例

架構審查（`/root/.claude/plans/ancient-imagining-papert.md` M4 條目）標記此為中風險、非即時但應處理的項目。

## What Changes

- 在 `src/lib/constants/` 新增或既有常數檔中定義 `DASHBOARD_RECENT_POSTS_LIMIT = 5`
- `dashboard/route.ts` 引用此常數取代硬編碼 `5`
- 審閱前端 dashboard 頁面（`src/app/(app)/dashboard/**` 或類似）是否也硬編碼 5，若有則同步引用
- 在常數旁加 JSDoc 註解說明語意（例：「Dashboard 首頁「最近動態」卡片顯示的 post 數」）

**非目標**：
- 不把常數改成環境變數（過度工程，等真正需要 A/B test 再改）
- 不把其他 magic numbers（例如 win-rate route 的 1000）一併處理（那是 M1，scope 另開）
- 不改 dashboard 的資料結構或查詢邏輯

## Capabilities

### Modified Capabilities
- `api-contracts`（微幅）: Dashboard endpoint 的「最近 post」數量從 implicit（5）變成明確來自常數；對外部契約無差別

## Impact

- **Code**: 
  - `src/lib/constants/<file>.ts`（新增或擴充）
  - `src/app/api/dashboard/route.ts`（引用常數）
  - 可能：`src/app/(app)/dashboard/**`（若前端也硬編碼）
- **Tests**: 若 dashboard route 有測試，確認測試不依賴 hardcoded 5（若有，一併用常數）
- **DB**: 無
- **Docs/specs**: 無
- **User-visible**: 無
- **Dependencies**: 無
- **Independence**: **完全獨立**，只改 1-3 個檔，可與其他 architecture-review change 並行

## Context

專案採用「API layer 是唯一授權邊界 + admin client 繞過 RLS」的授權模型（見審查報告 H3）。在此模型下，**每個 API route 必須明確檢查身份**，DB 層沒有後備防線。`GET /api/posts/[id]` 目前違反這條規則，僅靠 middleware 的「未登入擋下」提供保護。

Stakeholder：安全（授權邊界完整性）、產品（確認 post 可見性是否為「全平台共享」）。

## Goals / Non-Goals

**Goals:**
- 在 handler 內明確執行身份檢查，不依賴 middleware
- 將「authenticated-public」的設計意圖明文化，降低未來 regression 風險
- 保持現有行為對登入使用者零影響

**Non-Goals:**
- 不重構成 RLS-enforced 授權模型（H3 的 scope，另開 change）
- 不加「只有 owner 可見」邏輯
- 不動 PATCH / DELETE（這兩個已經有 auth + ownership 檢查）

## Decisions

### D1. 可見性政策：authenticated-public

**Chosen**：任何登入使用者可讀任何 post，未登入回 401。

**理由**：
- 符合產品設計：post 是「KOL 對外公開發表的投資觀點」，本意就是共享資料池
- 符合 middleware 現行行為，沒有 breaking change
- 若未來要加 private post，需在 posts table 加 `visibility` 欄位並更新此 handler，屬另一個 change

**Alternative considered**：做 ownership 檢查（只有 creator 可讀）。拒絕理由：違反產品設計，會破壞現有 KOL 探索功能。

### D2. 錯誤訊息策略

未登入回標準的 `unauthorizedError()`（401），訊息「需要登入才能查看」。不透露 post 是否存在（避免 enumeration oracle）。

### D3. 註解格式

在 GET handler 頂端加類似下列註解：
```ts
// 可見性：authenticated-public
// 任何登入使用者可讀任何 post（post 是 KOL 公開發表的投資觀點）
// 未來若加 private post 需在此處加 visibility 檢查
```

## Risks / Trade-offs

- **[R1]** 未登入使用者本來被 middleware 擋下，現在也被 handler 擋下，理論上零差異。但若 middleware 未來放寬，handler 的檢查就成了最後防線 → 這正是這個 change 要保護的場景。
- **[R2]** 整合測試若用 `createClient()` 需要 mock auth cookie，成本較高 → 用 unit test 直接 mock `getCurrentUserId()` 即可，成本低。

## Migration Plan

1. 修改 `src/app/api/posts/[id]/route.ts`：在 GET 加 auth 檢查 + 註解
2. 加 unit test 覆蓋 401 情境
3. 本地驗證：`npm run type-check && npm test src/app/api/posts`
4. 手動驗證：登出狀態打 `curl /api/posts/<id>` 應得 401
5. 開 PR，deploy 後監控錯誤率無異常

**Rollback**：revert commit 即可，無 DB 異動

## Open Questions

- 是否同時對 `GET /api/kols/[id]` / `GET /api/stocks/[ticker]` 補同樣註解？**決定**：審閱但不改動，若有不一致另開 follow-up（避免 scope creep）

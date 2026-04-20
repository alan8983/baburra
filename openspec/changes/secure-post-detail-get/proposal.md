## Why

`GET /api/posts/[id]` 目前不做任何身份驗證或擁有者過濾。Route handler 直接呼叫 `getPostById(id)`，repository 用 admin client 繞過 RLS，middleware 也只擋未登入。任何登入使用者都能用 UUID 枚舉任何人的 post，且未來若 post 需要「草稿可見性」「付費解鎖」「私訊用 post」等功能時，這條路徑會變成繞過 gating 的後門。

架構審查（見 `/root/.claude/plans/ancient-imagining-papert.md` 的 H1 條目）將此標記為高風險，主因是：
1. 授權邊界不明確，實際意圖（公開 vs 私有）沒有明文記錄
2. 同樣模式若複製到 `GET /api/kols/[id]`、`GET /api/stocks/[ticker]` 會形成系統性漏洞
3. 使用者誤貼敏感資訊到 post 後無防線

## What Changes

- 決定 post 的可見性政策（預設 **authenticated-only**：任何登入使用者可讀，但未登入被擋；這符合目前中介軟體行為且不破壞現有功能）
- 在 `GET /api/posts/[id]` 明確加入 `getCurrentUserId()` 檢查，未登入回 `unauthorizedError()`
- 在 route handler 頂端加註解說明「為何此端點是 authenticated-public，不做 ownership 過濾」，讓未來讀 code 的人知道這是刻意設計
- 同步審閱其他 GET 端點（kols/[id]、stocks/[ticker]）的可見性註解是否一致（僅審閱，不變更；若發現不一致開 follow-up issue）

**非目標**：
- 不改 post 的資料結構或 RLS 政策（scope 外）
- 不做「只有 owner 可見」的 private post 功能（未來需求時另開 change）
- 不動其他 GET 端點的實際授權邏輯（只審閱註解）

## Capabilities

### Modified Capabilities
- `api-contracts`: `GET /api/posts/[id]` 行為從「middleware-gated only」提升為「explicit auth check in handler」，錯誤回應多一個 401 case

## Impact

- **Code**: `src/app/api/posts/[id]/route.ts`（新增 auth 檢查 + 政策註解）
- **Tests**: 新增整合測試覆蓋 401 情境（未登入呼叫應回 401）
- **DB**: 無異動
- **Docs/specs**: 若 `openspec/specs/api-contracts/spec.md` 有列出 posts endpoint，補上 auth note
- **User-visible**: 無變更（middleware 本來就會擋未登入）
- **Dependencies**: 無
- **Independence**: 此變更**完全獨立**，只碰一個 route 檔與一個測試檔，可與其他 architecture-review 相關 change 並行推進

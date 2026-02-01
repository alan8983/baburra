# Agent 指令：API 工作

> **請將以下整段複製到「API 工作」那個 Agent Session 的對話中。**

---

## 你的任務

請依 `docs/WEB_DEV_PLAN.md` 與 `docs/HANDOVER_SESSION_002.md`，建立 **KOL、Stock、Draft、Post 的 CRUD API**，並將現有 hooks 改為呼叫這些 API（取代模擬資料）。

## 必須遵守的邊界（避免與 Phase 6 Agent 衝突）

**請先閱讀 `docs/PARALLEL_AGENTS_COORDINATION.md`，並嚴格遵守以下規定：**

1. **你負責的範圍**
   - 建立並實作：`/api/kols/*`、`/api/stocks/*`（**不含** `/api/stocks/[ticker]/prices`）、`/api/drafts/*`、`/api/posts/*`
   - 建立並實作：`infrastructure/repositories/` 下的 `kol.repository`、`stock.repository`、`draft.repository`、`post.repository`（**不要**建立 `stock-price.repository`）
   - 修改：`src/hooks/use-kols.ts`、`use-stocks.ts`、`use-posts.ts`，改為呼叫上述 API；若有 `use-drafts.ts` 也一併改為呼叫 Draft API

2. **你禁止做的事**
   - **不要**建立或修改 `src/app/api/stocks/[ticker]/prices/` 底下的任何檔案（屬於 Phase 6）
   - **不要**建立或修改 `src/infrastructure/repositories/stock-price.*`
   - **不要**建立或修改 `src/infrastructure/api/tiingo.*`
   - **不要**建立或修改 `src/components/charts/*`
   - **不要**修改頁面元件（`src/app/(app)/*`）的 UI 或 Tab 結構；只透過 hooks 讓資料改為從 API 來

3. **API 路徑與常數**
   - 使用現有 `src/lib/constants/routes.ts` 中的 `API_ROUTES`（例如 `API_ROUTES.KOLS`、`API_ROUTES.STOCKS`、`API_ROUTES.STOCK_DETAIL(ticker)` 等），不要改常數檔，只實作對應的 route。

## 參考規格

- API 端點與欄位定義：`docs/WEB_DEV_PLAN.md` 各 Phase 的「API 端點」與「資料表結構」
- 領域模型：`src/domain/models/`（kol, stock, post, draft）
- 現有 hooks 與 API 呼叫方式：`src/hooks/use-kols.ts`、`use-stocks.ts`、`use-posts.ts`

## 開發環境

- 資料庫與後端：Supabase（若 `.env.local` 已設定連線，請使用；若無則可先寫好 API 與 repository 邏輯，用註解標註需 Supabase 連線後才能實際查詢）

## 產出預期

- `src/app/api/kols/`、`src/app/api/stocks/`（不含 prices）、`src/app/api/drafts/`、`src/app/api/posts/` 底下的 route 實作
- `src/infrastructure/repositories/` 下 kol、stock、draft、post 的 repository（若專案尚未有該目錄，請建立）
- 更新後的 hooks 改為呼叫上述 API，並保持既有介面（回傳型別、query key 等）與現有頁面相容

請依上述邊界與規格開始實作，若有與 Phase 6 重疊的疑慮，一律以 `docs/PARALLEL_AGENTS_COORDINATION.md` 為準。

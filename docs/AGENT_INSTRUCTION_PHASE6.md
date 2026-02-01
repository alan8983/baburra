# Agent 指令：Phase 6（股價與 K 線圖）

> **請將以下整段複製到「Phase 6」那個 Agent Session 的對話中。**

---

## 你的任務

請依 `docs/WEB_DEV_PLAN.md` 的 **Phase 6：股價與 K 線圖模組**，完成以下項目：

1. 建立 Tiingo API 客戶端與股價快取
2. 建立股價 API：`GET /api/stocks/[ticker]/prices`
3. 建立 K 線圖與情緒標記元件
4. 在標的詳情頁、文章詳情頁新增 Chart Tab 並整合圖表

## 必須遵守的邊界（避免與 API Agent 衝突）

**請先閱讀 `docs/PARALLEL_AGENTS_COORDINATION.md`，並嚴格遵守以下規定：**

1. **你負責的範圍**
   - **唯一**建立並實作：`src/app/api/stocks/[ticker]/prices/route.ts`（股價 API）
   - 建立：`src/infrastructure/api/tiingo.client.ts`（Tiingo 客戶端）
   - 建立：`src/infrastructure/repositories/stock-price.repository.ts`（股價快取，例如 7 天）
   - 建立：`src/components/charts/` 下 K 線圖、情緒標記等元件（例如 `candlestick-chart.tsx`、`sentiment-marker.tsx`）
   - 修改：`src/app/(app)/stocks/[ticker]/page.tsx`、`src/app/(app)/posts/[id]/page.tsx` — **僅**新增「Chart」Tab 與圖表區塊，**不要**改動既有資料來源（例如 list/detail 的 fetch 邏輯）；可新增 `useStockPrices(ticker)` 或類似 hook 供 Chart Tab 使用

2. **你禁止做的事**
   - **不要**建立或修改 KOL / Stock（CRUD）/ Draft / Post 的 API route（即 `/api/kols/*`、`/api/stocks/route.ts`、`/api/stocks/[ticker]/route.ts`（標的詳情）、`/api/drafts/*`、`/api/posts/*`）
   - **不要**修改 `use-kols`、`use-stocks`（list/detail 部分）、`use-drafts`、`use-posts` 的既有 API 呼叫邏輯；若要加股價查詢，請**新增**函數（如 `useStockPrices`），不要改動既有 `useStock`、`useStocks` 等實作
   - **不要**改動 `src/components/forms/*` 或表單相關邏輯

3. **可使用的常數與型別**
   - `src/lib/constants/routes.ts` 已有 `API_ROUTES.STOCK_PRICES(ticker)`，請直接使用
   - `src/domain/models/stock.ts` 已有 `CandlestickData`、`VolumeData` 等型別，請沿用
   - 股價快取天數等可參考 `src/lib/constants/config.ts` 的 `STOCK_PRICE_CACHE_DAYS`

## 參考規格

- Phase 6 任務清單與 UI 設計：`docs/WEB_DEV_PLAN.md` 的「Phase 6: 股價與 K 線圖模組」
- K 線圖：專案已安裝 lightweight-charts，可參考官方文件 https://tradingview.github.io/lightweight-charts/

## 開發環境

- 股價資料：Tiingo API（需 API Key，可放在 `.env.local`，並在 `.env.example` 註明變數名稱）
- 股價快取：可存於 Supabase（若已連線）或先以記憶體/檔案快取實作，再註明之後可改為 DB

## 產出預期

- `src/app/api/stocks/[ticker]/prices/route.ts` 實作
- `src/infrastructure/api/tiingo.client.ts`、`src/infrastructure/repositories/stock-price.repository.ts`
- `src/components/charts/` 下 K 線圖與情緒標記元件
- 標的詳情頁、文章詳情頁新增 Chart Tab，並在該 Tab 內顯示 K 線圖（可選：情緒標記、日/週/月線切換）

請依上述邊界與規格開始實作，若有與 API Agent 重疊的疑慮，一律以 `docs/PARALLEL_AGENTS_COORDINATION.md` 為準。

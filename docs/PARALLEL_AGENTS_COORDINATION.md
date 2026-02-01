# 並行 Agent 協調說明

> **用途**: 當同時開兩個 Agent Session 分別進行「API 工作」與「Phase 6 K 線圖」時，依此文件劃分邊界，避免衝突與重工。

---

## 一、任務邊界總覽

| 項目 | Agent A：API 工作 | Agent B：Phase 6 |
|------|-------------------|------------------|
| **負責範圍** | CRUD API、Repositories、Hooks | 股價 API、Tiingo、K 線圖元件與整合 |
| **可建立/修改的目錄** | `src/app/api/`（**不含** prices 路徑）、`src/infrastructure/repositories/`（**不含** stock-price）、`src/hooks/` | `src/app/api/stocks/[ticker]/prices/`、`src/infrastructure/api/`、`src/infrastructure/repositories/stock-price.*`、`src/components/charts/`、部分頁面 |
| **禁止修改** | 不建立 `/api/stocks/[ticker]/prices`，不碰 `components/charts/`、Tiingo 相關 | 不建立 KOL/Stock/Draft/Post 的 CRUD API，不修改 `hooks/` 的 API 呼叫邏輯（可加 prices 相關 hook） |

---

## 二、檔案／路徑所有權（避免同一檔案被兩邊改）

### Agent A（API）**專屬**建立或修改

| 路徑 | 說明 |
|------|------|
| `src/app/api/kols/**` | KOL 所有 API |
| `src/app/api/stocks/route.ts` | GET 列表、POST 新增 |
| `src/app/api/stocks/[ticker]/route.ts` | GET 單一標的詳情（**不要**在這裡做股價） |
| `src/app/api/drafts/**` | Draft 所有 API |
| `src/app/api/posts/**` | Post 所有 API |
| `src/infrastructure/repositories/kol.repository.ts` | 若有此目錄則建立 |
| `src/infrastructure/repositories/stock.repository.ts` | 同上，**僅**標的 CRUD，不含股價 |
| `src/infrastructure/repositories/draft.repository.ts` | 同上 |
| `src/infrastructure/repositories/post.repository.ts` | 同上 |
| `src/hooks/use-kols.ts` | 改為呼叫上述 KOL API |
| `src/hooks/use-stocks.ts` | 改為呼叫上述 Stock API（**不含**股價，股價由 Phase 6 的 hook 處理） |
| `src/hooks/use-drafts.ts` | 若有則改為呼叫 Draft API |
| `src/hooks/use-posts.ts` | 改為呼叫 Post API |

**Agent A 禁止：**
- 不要建立 `src/app/api/stocks/[ticker]/prices/` 底下的任何檔案。
- 不要建立或修改 `src/infrastructure/repositories/stock-price.*`。
- 不要建立或修改 `src/infrastructure/api/tiingo.*`。
- 不要建立或修改 `src/components/charts/*`。

---

### Agent B（Phase 6）**專屬**建立或修改

| 路徑 | 說明 |
|------|------|
| `src/app/api/stocks/[ticker]/prices/route.ts` | **唯一**由 Phase 6 建立的股價 API |
| `src/infrastructure/api/tiingo.client.ts` | Tiingo API 客戶端 |
| `src/infrastructure/repositories/stock-price.repository.ts` | 股價快取 Repository |
| `src/components/charts/candlestick-chart.tsx` | K 線圖元件 |
| `src/components/charts/sentiment-marker.tsx` | 情緒標記元件（若規劃在此） |
| `src/components/charts/index.ts` | 若有則可加 |
| `src/app/(app)/stocks/[ticker]/page.tsx` | **僅**新增或擴充「Chart」Tab 與圖表區塊，不改既有資料來源邏輯 |
| `src/app/(app)/posts/[id]/page.tsx` | **僅**新增或擴充「Chart」Tab 與圖表區塊，不改既有資料來源邏輯 |

**Agent B 禁止：**
- 不要建立或修改 KOL / Stock（CRUD）/ Draft / Post 的 API route（即 Agent A 負責的 `api/kols`、`api/stocks` 除 prices 外、`api/drafts`、`api/posts`）。
- 不要修改 `use-kols`、`use-stocks`（主體 CRUD 部分）、`use-drafts`、`use-posts` 的既有 API 呼叫；若要加「股價」查詢，可**新增**例如 `useStockPrices(ticker)` 或類似 hook，放在同一檔案或新檔案皆可，但不要改動既有 list/detail 的 fetch 邏輯。

---

## 三、可能重疊的檔案與約定

| 檔案 | 約定 |
|------|------|
| `src/lib/constants/routes.ts` 或 `config.ts` | 已有 `STOCK_PRICES` 等常數，兩邊都**不要改**，直接使用。若 Phase 6 需要 Tiingo API URL 等，可加在 `config` 或 `.env.example`，盡量只加不刪。 |
| `src/app/(app)/stocks/[ticker]/page.tsx` | 僅 **Agent B** 修改，且只做：新增 Chart Tab、引入 K 線圖元件、在該 Tab 內呼叫股價 API 或 `useStockPrices`。 |
| `src/app/(app)/posts/[id]/page.tsx` | 同上，僅 Agent B 修改，只加 Chart 相關。 |
| `src/hooks/use-stocks.ts` | **Agent A** 負責 list/detail 的 API 替換；**Agent B** 若加股價，只**新增**函數（如 `useStockPrices`），不刪改既有 `useStock`、`useStocks` 的實作。 |

若之後要合併（例如 Git merge），建議：
- 先合併 Agent A 的變更（API + hooks），再合併 Agent B 的變更（prices API + charts + 頁面 Chart Tab）。

---

## 四、依賴與順序（建議）

- **Agent A** 可先做：沒有依賴 Phase 6；完成後頁面透過既有 hooks 就會改用 API。
- **Agent B** 可與 Agent A 並行：
  - 股價 API、Tiingo、stock-price repository、K 線圖元件都**不依賴** Agent A 的 CRUD API。
  - 僅在「標的詳情頁 / 文章詳情頁」要假設：頁面已有 `ticker` 或 `post.stockIds` 等，Phase 6 只負責在 Chart Tab 裡用這些 id/ticker 去要股價並畫圖。

因此兩邊可以**同時進行**，只要遵守「誰建立／誰修改哪個路徑」即可。

---

## 五、給你的操作建議

1. **複製指令**：使用底下兩份「給 Agent 的指令」。
2. **Session 1**：貼上「Agent A：API 工作」整段指令。
3. **Session 2**：貼上「Agent B：Phase 6」整段指令。
4. 兩邊都提醒 Agent：「請嚴格遵守 `docs/PARALLEL_AGENTS_COORDINATION.md` 的邊界，不要修改屬於另一個 Agent 的檔案或路徑。」
5. 合併時：先合併 API 分支，再合併 Phase 6 分支；若有衝突，以「誰擁有該檔案」為準（見上表）。

---

**此文件與兩份指令可一併納入版控，供後續並行開發使用。**

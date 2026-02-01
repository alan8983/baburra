# Session 交接文件 - Session 002（含後續完成狀態）

> **建立時間**: 2026-02-01  
> **Session 002 目的**: 建立表單元件 (不需 Supabase 的任務)  
> **本文件更新**: 已納入 API Agent 與 Phase 6 Agent 完成狀態，供下一個 Agent 接手使用

---

## 一、Session 002 本 Session 完成事項

### 表單元件建立 ✅

| 任務 | 狀態 | 產出檔案 |
|------|------|----------|
| KOL Selector | ✅ 完成 | `src/components/forms/kol-selector.tsx` |
| KOL Form Dialog | ✅ 完成 | `src/components/forms/kol-form-dialog.tsx` |
| Stock Selector | ✅ 完成 | `src/components/forms/stock-selector.tsx` |
| Stock Form Dialog | ✅ 完成 | `src/components/forms/stock-form-dialog.tsx` |
| Sentiment Selector | ✅ 完成 | `src/components/forms/sentiment-selector.tsx` |
| Datetime Input | ✅ 完成 | `src/components/forms/datetime-input.tsx` |
| 統一匯出 | ✅ 完成 | `src/components/forms/index.ts` |

### 頁面整合 ✅

| 頁面 | 狀態 | 備註 |
|------|------|------|
| 草稿編輯頁 `/drafts/[id]` | ✅ 完成 | 已使用所有新表單元件 |

### 新增 shadcn/ui 元件

| 元件 | 狀態 |
|------|------|
| Popover | ✅ 新安裝 |

---

## 二、後續 Session 已完成事項（API Agent + Phase 6 Agent）

以下工作已由其他 Agent Session 完成，目前專案狀態已包含這些產出。

### API Agent 完成項目 ✅

| 項目 | 狀態 | 產出 |
|------|------|------|
| KOL API | ✅ 完成 | `src/app/api/kols/route.ts`、`[id]/route.ts`、`[id]/posts/route.ts` |
| Stock API (CRUD) | ✅ 完成 | `src/app/api/stocks/route.ts`、`[ticker]/route.ts`、`[ticker]/posts/route.ts` |
| Draft API | ✅ 完成 | `src/app/api/drafts/route.ts`、`[id]/route.ts` |
| Post API | ✅ 完成 | `src/app/api/posts/route.ts`、`[id]/route.ts`、`check-duplicate/route.ts` |
| Repositories | ✅ 完成 | `kol.repository`、`stock.repository`、`draft.repository`、`post.repository` |
| Hooks 改為呼叫 API | ✅ 完成 | `use-kols`、`use-stocks`、`use-posts`、`use-drafts` 皆呼叫上述 API |

### Phase 6 Agent 完成項目 ✅

| 項目 | 狀態 | 產出 |
|------|------|------|
| 股價 API | ✅ 完成 | `src/app/api/stocks/[ticker]/prices/route.ts` |
| Tiingo Client | ✅ 完成 | `src/infrastructure/api/tiingo.client.ts` |
| 股價快取 Repository | ✅ 完成 | `src/infrastructure/repositories/stock-price.repository.ts` |
| K 線圖元件 | ✅ 完成 | `src/components/charts/candlestick-chart.tsx`、`sentiment-marker.tsx`、`index.ts` |
| 股價 Hook | ✅ 完成 | `src/hooks/use-stock-prices.ts`（`useStockPricesForChart`） |
| 標的詳情頁 Chart Tab | ✅ 完成 | `src/app/(app)/stocks/[ticker]/page.tsx` 含 K 線圖 |
| 文章詳情頁 Chart Tab | ✅ 完成 | `src/app/(app)/posts/[id]/page.tsx` 含 K 線圖與情緒標記 |

---

## 三、目前專案結構（截至交接時）

```
investment-idea-monitor/
├── src/
│   ├── app/
│   │   ├── api/                          # ✅ API Agent 建立
│   │   │   ├── kols/                     # KOL CRUD + posts
│   │   │   ├── stocks/                   # Stock CRUD + [ticker]/posts + [ticker]/prices
│   │   │   ├── drafts/                   # Draft CRUD
│   │   │   └── posts/                    # Post CRUD + check-duplicate
│   │   └── (app)/                        # 頁面
│   │       ├── dashboard/
│   │       ├── input/
│   │       ├── drafts/                   # 草稿列表、編輯（使用 forms 元件）
│   │       ├── kols/                     # 列表、詳情
│   │       ├── stocks/                   # 列表、詳情（含 Chart Tab）
│   │       ├── posts/                    # 列表、詳情（含 Chart Tab）
│   │       └── settings/
│   │
│   ├── components/
│   │   ├── ui/                           # shadcn/ui
│   │   ├── layout/                       # Sidebar, Header, MobileNav
│   │   ├── providers/
│   │   ├── forms/                        # ✅ Session 002 表單元件
│   │   │   ├── kol-selector.tsx
│   │   │   ├── kol-form-dialog.tsx
│   │   │   ├── stock-selector.tsx
│   │   │   ├── stock-form-dialog.tsx
│   │   │   ├── sentiment-selector.tsx
│   │   │   ├── datetime-input.tsx
│   │   │   └── index.ts
│   │   └── charts/                       # ✅ Phase 6
│   │       ├── candlestick-chart.tsx
│   │       ├── sentiment-marker.tsx
│   │       └── index.ts
│   │
│   ├── domain/models/                    # KOL, Stock, Post, Draft, User
│   ├── infrastructure/
│   │   ├── supabase/                     # Client, Server, Admin
│   │   ├── api/                          # ✅ Phase 6
│   │   │   └── tiingo.client.ts
│   │   └── repositories/                 # ✅ API Agent + Phase 6
│   │       ├── kol.repository.ts
│   │       ├── stock.repository.ts
│   │       ├── draft.repository.ts
│   │       ├── post.repository.ts
│   │       ├── stock-price.repository.ts
│   │       └── index.ts
│   │
│   ├── hooks/                            # 皆已改為呼叫 API
│   │   ├── use-kols.ts
│   │   ├── use-stocks.ts
│   │   ├── use-posts.ts
│   │   ├── use-drafts.ts
│   │   ├── use-stock-prices.ts           # Phase 6 股價
│   │   └── index.ts
│   ├── stores/
│   └── lib/constants/, utils/
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── docs/
│   ├── HANDOVER_SESSION_001.md
│   ├── HANDOVER_SESSION_002.md           # 本文件
│   ├── WEB_DEV_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── PARALLEL_AGENTS_COORDINATION.md
│   ├── AGENT_INSTRUCTION_API.md
│   └── AGENT_INSTRUCTION_PHASE6.md
│
├── .env.example
├── .env.local                            # 需填入 Supabase、Tiingo 等
└── package.json
```

---

## 四、下一個 Agent 優先任務

以下依 `docs/WEB_DEV_PLAN.md` 與目前狀態整理，供接手 Agent 依優先順序執行。

### 1. 表單元件改為使用 API（高）

目前 `KOLSelector`、`StockSelector` 仍使用 **mockData**。請改為：

- **KOLSelector**：使用 `useKols` 或搜尋 API 取得列表；新增 KOL 成功後可呼叫 `useCreateKol` 並 invalidate KOL list。
- **StockSelector**：使用 `useStockSearch` 或列表/搜尋 API；新增 Stock 成功後可呼叫 `useCreateStock` 並 invalidate stock list。

相關檔案：`src/components/forms/kol-selector.tsx`、`stock-selector.tsx`；hooks 已就緒，只需在元件內呼叫並傳入 `onCreateNew` 對應的 API mutation。

### 2. 草稿／輸入流程與 API 串接（高）

- 草稿列表頁、草稿編輯頁：改為使用 `useDrafts`、`useDraft`、`useUpdateDraft`、`useCreateDraft` 等，並處理 loading/error。
- 快速輸入頁：儲存草稿、導向編輯等與 Draft API 串接。
- 預覽確認頁／發布文章：若有 `/posts/new` 或類似流程，與 `useCreatePost`、重複 URL 檢查 API 串接。

### 3. Phase 7：勝率計算（中）

依 `WEB_DEV_PLAN.md` Phase 7：

- 建立 PriceChange / WinRate 計算邏輯（`domain/calculators/`）。
- 實作或補齊 `/api/kols/[id]/win-rate`、`/api/stocks/[ticker]/win-rate`。
- KOL 詳情頁 Stats Tab、文章列表漲跌幅顯示改用上述 API。

### 4. 圖片上傳（中）

- 使用 Supabase Storage，實作上傳 API 或 Server Action。
- 草稿／文章表單的圖片欄位與上傳流程串接（表單元件已有圖片區塊，需接實際上傳與 URL 回寫）。

### 5. Phase 8：AI 整合（低）

- Gemini Client、情緒分析 API、論點提取（若規格已定）。
- 配額檢查與 UI 顯示（Sidebar 已有 AI 配額區塊可接 API）。

### 6. 其他

- 依需求補齊錯誤處理、toast、表單驗證。
- 若尚未完成，可補 E2E/單元測試（Phase 10）。

---

## 五、已知問題 / 待解決事項（更新後）

| # | 問題描述 | 優先度 | 狀態 |
|---|----------|--------|------|
| 1 | Supabase / Tiingo 等環境變數需在 `.env.local` 正確設定 | 高 | ⏳ 需確認 |
| 2 | ~~API Routes 未建立~~ | ~~高~~ | ✅ 已完成 |
| 3 | ~~Phase 6 K 線圖未開始~~ | ~~中~~ | ✅ 已完成 |
| 4 | KOL/Stock Selector 仍用 mockData，需改為 API | 高 | ⏳ 待接手 Agent |
| 5 | 草稿／輸入流程與 API 完整串接 | 高 | ⏳ 待接手 Agent |
| 6 | 圖片上傳功能未實作 | 中 | ⏳ 需 Supabase Storage |
| 7 | Phase 7 勝率計算 API 與 UI | 中 | ⏳ 待實作 |
| 8 | Phase 8 AI 整合 | 低 | ⏳ 需 Gemini API Key |

---

## 六、給下一個 Agent 的建議

1. **先讀本文件與 `WEB_DEV_PLAN.md`**：掌握目前完成範圍與接下來 Phase 7/8 規格。
2. **表單元件接 API**：`hooks` 與 API 已就緒，優先將 `kol-selector`、`stock-selector` 改為使用 `useKols`/`useStockSearch` 等，並在新增成功後更新快取。
3. **草稿與發文流程**：確認 Draft/Post 的 create/update 與列表/詳情頁資料一致，必要時補 error handling 與樂觀更新。
4. **環境變數**：若需 Tiingo 股價或 Supabase，請確認 `.env.example` 與 `.env.local` 說明完整，避免接手者卡在連線問題。

---

## 七、啟動專案指令

```bash
npm install
npm run dev          # 開發模式
npm run type-check  # 類型檢查
npm run format      # 格式化
```

---

## 八、測試頁面建議

| 頁面 | URL | 說明 |
|------|-----|------|
| Dashboard | `/dashboard` | 總覽 |
| 快速輸入 | `/input` | 輸入與草稿入口 |
| 草稿列表 | `/drafts` | 草稿列表（可接 API） |
| 草稿編輯 | `/drafts/[id]` | 表單元件、待接 API |
| KOL 列表 | `/kols` | KOL 列表與詳情 |
| 標的列表 | `/stocks` | 標的列表與詳情（含 Chart Tab） |
| 文章列表 | `/posts` | 文章列表與詳情（含 Chart Tab） |

---

**Session 002 交接已更新，API 與 Phase 6 工作皆已完成，可交由下一個 Agent 接手。** ✅

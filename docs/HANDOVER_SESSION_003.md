# Session 交接文件 - Session 003

> **建立時間**: 2026-02-01  
> **Session 003 目的**: 表單元件 API 串接 + Phase 7 勝率計算模組  
> **前置文件**: `HANDOVER_SESSION_002.md`、`WEB_DEV_PLAN.md`

---

## 一、Session 003 完成事項

### 1. 表單元件改為使用 API ✅

| 元件              | 狀態    | 修改內容                                                                |
| ----------------- | ------- | ----------------------------------------------------------------------- |
| `KOLSelector`     | ✅ 完成 | 移除 mockData，改用 `useKols` hook，加入 debounce 搜尋和 loading 狀態   |
| `StockSelector`   | ✅ 完成 | 移除 mockData，改用 `useStocks` hook，加入 debounce 搜尋和 loading 狀態 |
| `KOLFormDialog`   | ✅ 完成 | 改用 `useCreateKol` mutation 呼叫真實 API                               |
| `StockFormDialog` | ✅ 完成 | 改用 `useCreateStock` mutation 呼叫真實 API                             |

### 2. 快速輸入頁面 API 串接 ✅

| 頁面     | 狀態    | 修改內容                                                                      |
| -------- | ------- | ----------------------------------------------------------------------------- |
| `/input` | ✅ 完成 | 移除 mockDrafts，改用 `useDrafts` 取得最近草稿，`useCreateDraft` 實作儲存功能 |

### 3. Phase 7：勝率計算模組 ✅

| 項目                   | 狀態    | 產出檔案                                            |
| ---------------------- | ------- | --------------------------------------------------- |
| PriceChange Calculator | ✅ 完成 | `src/domain/calculators/price-change.calculator.ts` |
| WinRate Calculator     | ✅ 完成 | `src/domain/calculators/win-rate.calculator.ts`     |
| Calculators 統一匯出   | ✅ 完成 | `src/domain/calculators/index.ts`                   |
| KOL 勝率 API           | ✅ 完成 | `src/app/api/kols/[id]/win-rate/route.ts`           |
| Stock 勝率 API         | ✅ 完成 | `src/app/api/stocks/[ticker]/win-rate/route.ts`     |
| `useKolWinRate` hook   | ✅ 完成 | 更新 `src/hooks/use-kols.ts`                        |
| `useStockWinRate` hook | ✅ 完成 | 更新 `src/hooks/use-stocks.ts`                      |
| KOL 詳情頁 Stats Tab   | ✅ 完成 | 更新 `src/app/(app)/kols/[id]/page.tsx`             |

---

## 二、目前專案結構（截至交接時）

```
investment-idea-monitor/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── kols/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── posts/route.ts
│   │   │   │       └── win-rate/route.ts        # ✅ Session 003 新增
│   │   │   ├── stocks/
│   │   │   │   ├── route.ts
│   │   │   │   └── [ticker]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── posts/route.ts
│   │   │   │       ├── prices/route.ts
│   │   │   │       └── win-rate/route.ts        # ✅ Session 003 新增
│   │   │   ├── drafts/
│   │   │   └── posts/
│   │   └── (app)/
│   │       ├── dashboard/
│   │       ├── input/page.tsx                   # ✅ Session 003 修改（API 串接）
│   │       ├── drafts/
│   │       ├── kols/
│   │       │   └── [id]/page.tsx                # ✅ Session 003 修改（Stats Tab）
│   │       ├── stocks/
│   │       ├── posts/
│   │       └── settings/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── providers/
│   │   ├── forms/
│   │   │   ├── kol-selector.tsx                 # ✅ Session 003 修改（API 串接）
│   │   │   ├── kol-form-dialog.tsx              # ✅ Session 003 修改（API 串接）
│   │   │   ├── stock-selector.tsx               # ✅ Session 003 修改（API 串接）
│   │   │   ├── stock-form-dialog.tsx            # ✅ Session 003 修改（API 串接）
│   │   │   ├── sentiment-selector.tsx
│   │   │   ├── datetime-input.tsx
│   │   │   └── index.ts
│   │   └── charts/
│   │
│   ├── domain/
│   │   ├── models/
│   │   └── calculators/                         # ✅ Session 003 新增目錄
│   │       ├── price-change.calculator.ts
│   │       ├── win-rate.calculator.ts
│   │       └── index.ts
│   │
│   ├── infrastructure/
│   │   ├── supabase/
│   │   ├── api/
│   │   └── repositories/
│   │
│   ├── hooks/
│   │   ├── use-kols.ts                          # ✅ Session 003 修改（新增 useKolWinRate）
│   │   ├── use-stocks.ts                        # ✅ Session 003 修改（新增 useStockWinRate）
│   │   ├── use-posts.ts
│   │   ├── use-drafts.ts
│   │   ├── use-stock-prices.ts
│   │   └── index.ts
│   │
│   └── lib/
│
├── docs/
│   ├── HANDOVER_SESSION_001.md
│   ├── HANDOVER_SESSION_002.md
│   ├── HANDOVER_SESSION_003.md                  # 本文件
│   ├── WEB_DEV_PLAN.md
│   └── ARCHITECTURE.md
│
└── package.json
```

---

## 三、勝率計算說明

### 漲跌幅計算 (`price-change.calculator.ts`)

- 支援期間：5日、30日、90日、365日
- 以發文當天收盤價為基準
- 若當天無交易日，往後找最近的交易日

### 勝率判定邏輯 (`win-rate.calculator.ts`)

| 情緒          | 股價變化 | 結果    |
| ------------- | -------- | ------- |
| 看多 (1, 2)   | 上漲     | ✅ 勝利 |
| 看多 (1, 2)   | 下跌     | ❌ 失敗 |
| 看空 (-1, -2) | 下跌     | ✅ 勝利 |
| 看空 (-1, -2) | 上漲     | ❌ 失敗 |
| 中立 (0)      | -        | 不計入  |

### API 端點

| 端點                                | 說明                |
| ----------------------------------- | ------------------- |
| `GET /api/kols/[id]/win-rate`       | 取得 KOL 的勝率統計 |
| `GET /api/stocks/[ticker]/win-rate` | 取得標的的勝率統計  |

### 回傳格式

```typescript
interface WinRateStats {
  day5: { period: 5; total: number; wins: number; losses: number; rate: number | null };
  day30: { period: 30; total: number; wins: number; losses: number; rate: number | null };
  day90: { period: 90; total: number; wins: number; losses: number; rate: number | null };
  day365: { period: 365; total: number; wins: number; losses: number; rate: number | null };
  overall: { total: number; avgWinRate: number | null };
}
```

---

## 四、下一個 Agent 優先任務

以下依 `docs/WEB_DEV_PLAN.md` 與目前狀態整理，供接手 Agent 依優先順序執行。

### 1. 圖片上傳功能（中優先）

- 使用 Supabase Storage 實作上傳 API 或 Server Action
- 草稿／文章表單的圖片欄位與上傳流程串接
- 表單元件已有圖片區塊（`drafts/[id]/page.tsx` 第 226-235 行），需接實際上傳與 URL 回寫

### 2. Stock 詳情頁 Stats Tab（中優先）

- 類似 KOL 詳情頁，在 Stock 詳情頁加入勝率統計顯示
- 使用已建立的 `useStockWinRate` hook

### 3. Phase 8：AI 整合（低優先）

依 `WEB_DEV_PLAN.md` Phase 8：

- 建立 Gemini Client (`infrastructure/api/gemini.client.ts`)
- 情緒分析 API (`/api/ai/analyze`)
- 論點提取 API (`/api/ai/extract-arguments`)
- 配額檢查與 UI 顯示
- 需要 Gemini API Key

### 4. 其他待辦

- 補齊錯誤處理、toast 通知
- 預覽確認頁 (`/posts/new`) 完整實作
- E2E/單元測試（Phase 10）

---

## 五、已知問題 / 待解決事項

| #   | 問題描述                               | 優先度 | 狀態                 |
| --- | -------------------------------------- | ------ | -------------------- |
| 1   | 圖片上傳功能未實作                     | 中     | ⏳ 待實作            |
| 2   | Stock 詳情頁 Stats Tab 未實作          | 中     | ⏳ 待實作            |
| 3   | Phase 8 AI 整合                        | 低     | ⏳ 需 Gemini API Key |
| 4   | 預覽確認頁 (`/posts/new`) 尚未完整實作 | 中     | ⏳ 待實作            |
| 5   | 認證系統 (Phase 1) 尚未實作            | 低     | ⏳ 最後實作          |

---

## 六、給下一個 Agent 的建議

1. **先讀本文件與 `WEB_DEV_PLAN.md`**：掌握目前完成範圍與接下來任務
2. **圖片上傳**：建議使用 Supabase Storage，建立 `/api/upload` 端點
3. **Stock Stats Tab**：可參考 `kols/[id]/page.tsx` 的 Stats Tab 實作方式
4. **環境變數**：若需 AI 功能，請確認 `.env.local` 有正確的 Gemini API Key

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

| 頁面      | URL                | 說明                     |
| --------- | ------------------ | ------------------------ |
| Dashboard | `/dashboard`       | 總覽                     |
| 快速輸入  | `/input`           | ✅ 已接 API              |
| 草稿列表  | `/drafts`          | ✅ 已接 API              |
| 草稿編輯  | `/drafts/[id]`     | ✅ 表單元件已接 API      |
| KOL 列表  | `/kols`            | KOL 列表                 |
| KOL 詳情  | `/kols/[id]`       | ✅ Stats Tab 顯示勝率    |
| 標的列表  | `/stocks`          | 標的列表（含 Chart Tab） |
| 標的詳情  | `/stocks/[ticker]` | Stats Tab 待實作         |
| 文章列表  | `/posts`           | 文章列表（含 Chart Tab） |

---

**Session 003 交接完成，可交由下一個 Agent 接手。** ✅

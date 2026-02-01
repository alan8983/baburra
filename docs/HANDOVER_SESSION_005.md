# Session 交接文件 - Session 005

> **建立時間**: 2026-02-01  
> **Session 005 目的**: Phase 8 - AI 整合模組完整實作  
> **前置文件**: `HANDOVER_SESSION_004.md`、`WEB_DEV_PLAN.md`、`ANALYSIS_FRAMEWORK.md`

---

## 一、MVP 開發進度總覽

```
MVP 完成度: █████████████████████████░ 95%

已完成: Phase 0, 2, 3, 5, 6, 7, 8, 9
部分完成: Phase 4 (缺預覽確認頁)
未完成: Phase 1, 10
```

### Phase 完成狀態

| Phase | 名稱 | 狀態 | 完成度 | Session |
|-------|------|------|--------|---------|
| Phase 0 | 專案初始化 | ✅ 完成 | 100% | Session 001 |
| Phase 9 | App Layout & 導航 | ✅ 完成 | 100% | Session 001 |
| Phase 2 | KOL 管理模組 | ✅ 完成 | 100% | Session 001-003 |
| Phase 3 | 投資標的模組 | ✅ 完成 | 100% | Session 001-003 |
| Phase 4 | 輸入與草稿模組 | 🔶 部分完成 | 90% | Session 001-004 |
| Phase 5 | 文章檢視模組 | ✅ 完成 | 100% | Session 002 |
| Phase 6 | 股價與 K 線圖模組 | ✅ 完成 | 100% | Session 002 |
| Phase 7 | 勝率計算模組 | ✅ 完成 | 100% | Session 003-004 |
| **Phase 8** | **AI 整合模組** | ✅ **完成** | **100%** | **Session 005** |
| Phase 10 | 測試與優化 | ❌ 未開始 | 0% | - |
| Phase 1 | 認證系統 | ❌ 未開始 | 0% | - |

---

## 二、Session 005 完成事項

### 1. 基礎設施 ✅

| 項目 | 狀態 | 產出檔案 |
|------|------|----------|
| Gemini Client | ✅ 完成 | `src/infrastructure/api/gemini.client.ts` |
| AI Service | ✅ 完成 | `src/domain/services/ai.service.ts` |
| AI Usage Repository | ✅ 完成 | `src/infrastructure/repositories/ai-usage.repository.ts` |
| Argument Repository | ✅ 完成 | `src/infrastructure/repositories/argument.repository.ts` |

#### Gemini Client 功能

- `generateContent()` - 生成文字回應
- `generateJson<T>()` - 生成 JSON 並自動解析（清理 markdown 標記）

#### AI Service 功能

- `analyzeSentiment()` - 分析文章情緒
- `extractArguments()` - 提取文章論點
- `getFrameworkCategories()` - 取得框架類別列表

### 2. 配額管理 ✅

| 項目 | 狀態 | 說明 |
|------|------|------|
| 配額查詢 | ✅ 完成 | `getAiUsage()` - 取得用戶配額資訊 |
| 配額檢查 | ✅ 完成 | `checkAiQuota()` - 檢查是否有剩餘配額 |
| 配額消耗 | ✅ 完成 | `consumeAiQuota()` - 消耗一次配額 |
| 配額重置 | ✅ 完成 | `resetAiQuota()` - 重置配額（管理員功能）|

#### 配額設定

- **Free 用戶**: 每週 15 次
- **Premium 用戶**: 每週 100 次
- **自動重置**: 使用後 7 天自動重置

### 3. API 端點 ✅

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/ai/analyze` | 分析文章情緒 |
| POST | `/api/ai/extract-arguments` | 提取文章論點 |
| GET | `/api/ai/usage` | 查詢配額使用 |
| GET | `/api/ai/categories` | 論點類別列表 |
| GET | `/api/argument-categories` | 論點類別列表（別名）|
| GET | `/api/stocks/[ticker]/arguments` | 標的論點彙整 |

### 4. 論點類別 (依 ANALYSIS_FRAMEWORK.md) ✅

| 項目 | 狀態 | 說明 |
|------|------|------|
| Seed Data 更新 | ✅ 完成 | 更新 `supabase/seed.sql` |
| 兩層結構 | ✅ 完成 | 分析維度 → 論點類別 |

#### 論點類別結構

```
量化 (QUANTITATIVE)
├── FINANCIALS    財務體質
├── MOMENTUM      動能類
└── VALUATION     估值

質化 (QUALITATIVE)
├── MARKET_SIZE          市場規模
├── MOAT                 護城河
└── OPERATIONAL_QUALITY  營運品質

催化劑 (EVENT_DRIVEN)
└── CATALYST     催化劑
```

### 5. 前端元件 ✅

| 元件 | 狀態 | 檔案路徑 |
|------|------|----------|
| PostArguments | ✅ 完成 | `src/components/ai/post-arguments.tsx` |
| AiQuotaBadge | ✅ 完成 | `src/components/ai/ai-quota-badge.tsx` |
| StockArgumentsTab | ✅ 完成 | `src/components/ai/stock-arguments-tab.tsx` |
| Tooltip | ✅ 新增 | `src/components/ui/tooltip.tsx` |

### 6. Hooks ✅

| Hook | 狀態 | 說明 |
|------|------|------|
| useAiUsage | ✅ 完成 | 查詢 AI 配額 |
| useAnalyzeSentiment | ✅ 完成 | 執行情緒分析 |
| useExtractArguments | ✅ 完成 | 執行論點提取 |
| useArgumentCategories | ✅ 完成 | 取得論點類別 |
| useStockArguments | ✅ 完成 | 取得標的論點彙整 |

### 7. 頁面整合 ✅

| 頁面 | 狀態 | 修改內容 |
|------|------|----------|
| Stock 詳情頁 | ✅ 完成 | Arguments Tab 整合 StockArgumentsTab 元件 |
| Sidebar | ✅ 完成 | AI 配額顯示整合真實資料 |

### 8. 計算器 ✅

| 計算器 | 狀態 | 檔案路徑 |
|------|------|----------|
| ArgumentSummaryCalculator | ✅ 完成 | `src/domain/calculators/argument-summary.calculator.ts` |

---

## 三、待完成項目清單

### 🔴 高優先度

| # | 項目 | Phase | 說明 | 預估工作量 |
|---|------|-------|------|-----------|
| 1 | **執行 seed.sql 更新論點類別** | - | Supabase 操作 | 5 分鐘 |
| 2 | **預覽確認頁** (`/posts/new`) | Phase 4 | 完成核心輸入流程的最後一步 | 中 |

#### 預覽確認頁詳細任務

| 子任務 | 說明 | 可用資源 |
|--------|------|----------|
| 從草稿載入資料 | 讀取 draft ID 並顯示預覽 | `useDraft` hook |
| 重複 URL 檢測 | 呼叫 `/api/posts/check-duplicate` 並顯示警告 | 已有 API |
| 情緒選擇 | 使用已有的 `SentimentSelector` 元件 | 已有元件 |
| **AI 情緒分析** | 整合 `useAnalyzeSentiment` hook 顯示建議 | ✅ **Session 005 完成** |
| 確認發布 | 呼叫 `POST /api/posts` 建立文章，刪除草稿 | 已有 API |
| **AI 論點提取** | 發布後自動提取論點（可選） | ✅ **Session 005 完成** |

---

### 🟡 中優先度

| # | 項目 | Phase | 說明 | 預估工作量 |
|---|------|-------|------|-----------|
| 3 | **單元測試** | Phase 10 | Vitest + Calculator 測試 | 中 |
| 4 | **E2E 測試** | Phase 10 | Playwright + 關鍵流程測試 | 中 |

#### Phase 10 測試與優化詳細任務

| # | 任務 | 產出 |
|---|------|------|
| 10.1 | 設定 Vitest | 測試框架 |
| 10.2 | 撰寫核心邏輯單元測試 | Calculator 測試 |
| 10.3 | 設定 Playwright | E2E 測試 |
| 10.4 | 撰寫關鍵流程 E2E 測試 | 輸入流程測試 |
| 10.5 | 效能優化 | Code Splitting, Image Optimization |
| 10.6 | 設定 Vercel 專案 | 部署設定 |
| 10.7 | 設定 CI/CD | GitHub Actions |
| 10.8 | 撰寫 README | 專案文件 |

---

### 🟢 低優先度（最後實作）

| # | 項目 | Phase | 說明 |
|---|------|-------|------|
| 5 | **認證系統** | Phase 1 | 登入/註冊/RLS 啟用 |

#### Phase 1 認證系統任務

| # | 任務 | 產出 |
|---|------|------|
| 1.1 | 建立 Supabase Auth Client | `infrastructure/supabase/` |
| 1.2 | 實作登入頁面 | `/login` |
| 1.3 | 實作註冊頁面 | `/register` |
| 1.4 | 實作 Auth Callback | `/auth/callback` |
| 1.5 | 建立 Auth Context/Hook | `hooks/use-auth.ts` |
| 1.6 | 建立 Protected Route Middleware | `middleware.ts` |
| 1.7 | 建立 Profile 初始化觸發器 | Supabase Function |
| 1.8 | 啟用 RLS 政策 | 多用戶資料隔離 |
| 1.9 | 測試多用戶情境 | 確保資料正確隔離/共享 |

---

## 四、目前專案結構（截至交接時）

```
investment-idea-monitor/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/                                   # ✅ Session 005 新增
│   │   │   │   ├── analyze/route.ts
│   │   │   │   ├── categories/route.ts
│   │   │   │   ├── extract-arguments/route.ts
│   │   │   │   └── usage/route.ts
│   │   │   ├── argument-categories/route.ts          # ✅ Session 005 新增
│   │   │   ├── kols/
│   │   │   ├── stocks/
│   │   │   │   └── [ticker]/
│   │   │   │       └── arguments/route.ts            # ✅ Session 005 新增
│   │   │   ├── drafts/
│   │   │   ├── posts/
│   │   │   └── upload/
│   │   └── (app)/
│   │       └── stocks/
│   │           └── [ticker]/page.tsx                 # ✅ Session 005 修改（Arguments Tab）
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   └── tooltip.tsx                           # ✅ Session 005 新增
│   │   ├── layout/
│   │   │   └── sidebar.tsx                           # ✅ Session 005 修改（AI 配額）
│   │   ├── ai/                                       # ✅ Session 005 新增
│   │   │   ├── index.ts
│   │   │   ├── post-arguments.tsx
│   │   │   ├── ai-quota-badge.tsx
│   │   │   └── stock-arguments-tab.tsx
│   │   ├── providers/
│   │   ├── forms/
│   │   └── charts/
│   │
│   ├── domain/
│   │   ├── models/
│   │   ├── calculators/
│   │   │   ├── index.ts                              # ✅ Session 005 修改
│   │   │   └── argument-summary.calculator.ts        # ✅ Session 005 新增
│   │   └── services/                                 # ✅ Session 005 新增
│   │       ├── index.ts
│   │       └── ai.service.ts
│   │
│   ├── infrastructure/
│   │   ├── supabase/
│   │   ├── api/
│   │   │   ├── tiingo.client.ts
│   │   │   └── gemini.client.ts                      # ✅ Session 005 新增
│   │   └── repositories/
│   │       ├── index.ts                              # ✅ Session 005 修改
│   │       ├── ai-usage.repository.ts                # ✅ Session 005 新增
│   │       └── argument.repository.ts                # ✅ Session 005 新增
│   │
│   ├── hooks/
│   │   ├── index.ts                                  # ✅ Session 005 修改
│   │   └── use-ai.ts                                 # ✅ Session 005 新增
│   │
│   └── lib/
│       └── constants/
│           └── routes.ts                             # 已包含 AI 相關路由
│
├── supabase/
│   └── seed.sql                                      # ✅ Session 005 修改（論點類別）
│
├── docs/
│   ├── HANDOVER_SESSION_001.md
│   ├── HANDOVER_SESSION_002.md
│   ├── HANDOVER_SESSION_003.md
│   ├── HANDOVER_SESSION_004.md
│   ├── HANDOVER_SESSION_005.md                       # 本文件
│   ├── ANALYSIS_FRAMEWORK.md
│   ├── WEB_DEV_PLAN.md
│   └── ARCHITECTURE.md
│
└── package.json
```

---

## 五、使用說明

### 執行情緒分析

```typescript
// API 呼叫
const response = await fetch('/api/ai/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: '文章內容...' }),
});
const result = await response.json();
// result: { sentiment: 1, confidence: 0.85, reasoning: '...', usage: {...} }

// 或使用 Hook
const { mutateAsync: analyze } = useAnalyzeSentiment();
const result = await analyze('文章內容...');
```

### 執行論點提取

```typescript
const response = await fetch('/api/ai/extract-arguments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: '文章內容...',
    postId: 'xxx',
    stocks: [{ id: 'xxx', ticker: 'AAPL', name: 'Apple Inc.' }],
  }),
});
const result = await response.json();
// result: { arguments: [...], usage: {...} }
```

### 查詢配額

```typescript
// API 呼叫
const response = await fetch('/api/ai/usage');
const usage = await response.json();
// usage: { usageCount: 3, weeklyLimit: 15, remaining: 12, resetAt: '...', subscriptionTier: 'free' }

// 或使用 Hook
const { data: usage } = useAiUsage();
```

---

## 六、Supabase 操作提醒

> ⚠️ **重要**: 需要重新執行 seed.sql 來更新論點類別資料

```bash
# 在 Supabase Dashboard SQL Editor 中執行
# 或使用 Supabase CLI
supabase db reset
```

論點類別已從舊結構（6 個扁平類別）更新為新結構（3 個父類別 + 7 個子類別）。

---

## 七、給下一個 Agent 的建議

### 建議的開發順序

1. **先執行 seed.sql** - 更新論點類別資料
2. **實作預覽確認頁** (`/posts/new`) - 完成核心輸入流程，可整合 AI 功能
3. **實作測試** (Phase 10) - 品質保證
4. **實作認證系統** (Phase 1) - 最後上線前完成

### 開發提示

1. **先讀本文件與 `WEB_DEV_PLAN.md`**：掌握目前完成範圍與接下來任務
2. **執行 seed.sql**：確保論點類別資料已更新
3. **測試 AI 功能**：確認 GEMINI_API_KEY 有效
4. **預覽確認頁**：可整合 AI 情緒分析和論點提取功能

---

## 八、啟動專案指令

```bash
npm install
npm run dev          # 開發模式
npm run type-check   # 類型檢查
npm run format       # 格式化
```

---

## 九、測試頁面建議

| 頁面 | URL | 狀態 | 說明 |
|------|-----|------|------|
| Dashboard | `/dashboard` | ✅ | 總覽 |
| 快速輸入 | `/input` | ✅ | 已接 API |
| 草稿列表 | `/drafts` | ✅ | 已接 API |
| 草稿編輯 | `/drafts/[id]` | ✅ | 圖片上傳功能 |
| **預覽確認** | `/posts/new` | ⏳ | **待實作** |
| KOL 列表 | `/kols` | ✅ | KOL 列表 |
| KOL 詳情 | `/kols/[id]` | ✅ | Stats Tab 顯示勝率 |
| 標的列表 | `/stocks` | ✅ | 標的列表 |
| 標的詳情 | `/stocks/[ticker]` | ✅ | Stats Tab + **Arguments Tab** |
| 文章列表 | `/posts` | ✅ | 文章列表 |
| 文章詳情 | `/posts/[id]` | ✅ | 含 Chart Tab |

---

## 十、Phase 8 完成摘要

### ✅ 已完成功能

- [x] Gemini Client - AI API 串接
- [x] AI Service - 情緒分析、論點提取
- [x] 配額管理 - 查詢、檢查、消耗、重置
- [x] API 端點 - 6 個新端點
- [x] 論點類別 - 依 ANALYSIS_FRAMEWORK.md 定義
- [x] 前端元件 - 3 個新元件
- [x] Hooks - 5 個新 Hook
- [x] 頁面整合 - Stock Arguments Tab、Sidebar AI 配額

### 🐛 修正

- 修正 `supabase/index.ts` 匯出 `getCurrentUserId` 函數
- 修正 `getCurrentUserId` 支援 `DEV_USER_ID` 環境變數

### 📊 統計

- **新增檔案**: 14 個
- **修改檔案**: 9 個
- **新增 API 端點**: 6 個
- **新增 Hooks**: 5 個
- **新增元件**: 4 個

---

**Session 005 交接完成，Phase 8 AI 整合模組已完整實作。** ✅

**下一步建議**: 實作預覽確認頁 (`/posts/new`)，完成 MVP 核心流程。

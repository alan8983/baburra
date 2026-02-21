# Stock KOL Tracker Web - 開發計畫

> **版本**: 1.5
> **建立日期**: 2026-02-01
> **最後更新**: 2026-02-22
> **目標**: MVP 開發計畫

---

## 零、開發進度總覽

> **最後更新**: 2026-02-22

| 階段 | 名稱 | 狀態 | 備註 |
| --- | --- | --- | --- |
| Phase 0 | 專案初始化 | ✅ 完成 | 2026-02-01 |
| Phase 1 | 認證系統 | ✅ 完成 | 2026-02-02 |
| Phase 2 | KOL 管理 | ✅ 完成 | 2026-02-01 |
| Phase 3 | 投資標的 | ✅ 完成 | 2026-02-01 |
| Phase 4 | 輸入與草稿 | ✅ 完成 | 2026-02-18 |
| Phase 5 | 文章檢視 | ✅ 完成 | 2026-02-12 (含書籤) |
| Phase 6 | K 線圖 | ✅ 完成 | K 線圖+情緒標記+工具列已整合到詳情頁 |
| Phase 7 | 勝率計算 | ✅ 完成 | 計算器+API+UI 顯示全部完成 |
| Phase 8 | AI 整合 | 🔄 95% | 情緒/論點提取/論點彙整/時間分布圖元件完成，StockArgumentsTab 待整合至 Stock 詳情頁 |
| Phase 9 | App Layout | ✅ 完成 | 2026-02-10 |
| Phase 10 | 測試與優化 | 🔄 80% | 測試框架+動態載入+Vercel 部署+安全標頭完成；React Query staleTime 部分 hooks 待補 |
| Phase 11 | Google OAuth & Auth 強化 | ✅ 完成 | Google OAuth + 密碼重設 + Email 驗證設定 (2026-02-22) |
| Phase 12 | KOL 匯入工具 | ✅ 完成 | YouTube Extractor + 批量匯入管線 + 匯入 UI + 配額豁免 (2026-02-22) |
| Phase 13 | 用戶引導流程 | ✅ 完成 | 3 步驟 Onboarding + Empty States (6 頁面) + 首次登入偵測 (2026-02-22) |

**MVP 整體完成度: ~98%** (Phase 0-13 幾乎全部完成；僅餘: 8.16 Stock 頁面整合 + 10.5 React Query staleTime 補齊)
**含商業功能: ~98%** (Phase 0-13)

### 額外已完成功能（計畫外）

| 功能 | 完成日期 | 說明 |
| --- | --- | --- |
| 國際化 (i18n) | 2026-02-10 | next-intl，支援 zh-TW + en |
| Dashboard 統計 | 2026-02-10 | 儀表板 API + 頁面 |
| URL 擷取框架 | 2026-02-05 | ExtractorFactory + Twitter/FB/Threads stubs |
| Profile 時區 | 2026-02-19 | 用戶時區設定 |
| 情緒折線圖 | 2026-02-18 | sentiment-line-chart 元件 |

### 開發時程

```
2026-02-01  ██████████ Phase 0, 2, 3, 9 (專案骨架 + 核心模組)
2026-02-02  ████████   Phase 1 (認證 + RLS + E2E 框架)
2026-02-03  ███        配置調整、Auth 修正
2026-02-05  █████      URL fetcher、Extractors、文件
2026-02-06  ███        手動測試計畫、Supabase 配置
2026-02-10  ██████     i18n、Dashboard API、UI 改善
2026-02-11  ██         Extractor 測試、format 工具測試
2026-02-12  ████       書籤功能 (full-stack + i18n)
2026-02-14  ██████     快速輸入、AI Ticker 識別、CI 修正
2026-02-18  ████████   情緒折線圖、E2E fixtures、草稿審核、論點支援
2026-02-19  ████       Profile 時區、Post Arguments API、README 更新
2026-02-22  ██████     Phase 11 (Google OAuth + 密碼重設 + Email 驗證)
2026-02-22  ████████   Phase 12a (YouTube Extractor + 批量匯入管線 + 匯入 UI)
2026-02-22  ██████     Phase 13 (Onboarding 3 步驟 + Empty States 6 頁面)
2026-02-22  ████       Phase 8.16 (argument-timeline 元件) + Phase 4.16 (免責聲明 checkbox)
2026-02-22  ██████     Phase 10.5-10.6 (動態載入 + Bundle Analyzer + Vercel 部署 + 安全標頭)
```

---

## 一、專案概要

### 1.1 產品定位

Stock KOL Tracker Web 是一個**社群共享**的投資觀點追蹤平台，讓用戶能夠：

- 快速記錄/匯入 KOL 的投資觀點文章
- 追蹤 KOL 對特定標的的歷史觀點
- 計算 KOL 的預測勝率
- 透過 K 線圖對照觀點與實際走勢

### 1.2 版本規劃總覽

| 版本           | 核心目標     | 關鍵功能                                                                                |
| -------------- | ------------ | --------------------------------------------------------------------------------------- |
| **MVP**        | 核心功能驗證 | 手動輸入、基本檢視、勝率計算、K線圖                                                     |
| **Release 01** | 體驗優化     | URL 自動匯入(Twitter/X)、RWD、書籤管理、AI摘要、AI 快取層、社群洞察                     |
| **Release 02** | 功能擴展     | URL 自動匯入(FB/Threads)、YouTube 逐字稿擷取、多市場支援、Dark Mode、付費機制、熱度統計 |

### 1.3 技術架構確認

| 層級     | 技術選型                    |
| -------- | --------------------------- |
| 前端框架 | Next.js 16 (App Router)     |
| UI 套件  | Tailwind CSS 4 + shadcn/ui  |
| 狀態管理 | TanStack Query + Zustand |
| 後端     | Next.js API Routes       |
| 資料庫   | Supabase (PostgreSQL)    |
| 認證     | Supabase Auth            |
| 檔案儲存 | Supabase Storage         |
| AI 服務  | Google Gemini API        |
| 股價資料 | Tiingo API               |
| K線圖    | Lightweight Charts       |
| 部署     | Vercel                   |

---

## 二、資料模型設計

### 2.1 社群共享模式

```
┌─────────────────────────────────────────────────────────────┐
│                     共享資料層 (Public)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐             │
│  │  KOLs   │◄───│  Posts  │───►│   Stocks    │             │
│  │ (共享)   │    │ (共享)  │    │   (共享)    │             │
│  └─────────┘    └─────────┘    └─────────────┘             │
│                      │                  │                   │
│                      │                  ▼                   │
│                      │         ┌─────────────┐             │
│                      │         │ StockPrices │             │
│                      │         │   (快取)    │             │
│                      │         └─────────────┘             │
└──────────────────────┼──────────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────────┐
│                      ▼       私有資料層 (User-specific)      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐             │
│  │ Profile │    │ Drafts  │    │  Bookmarks  │             │
│  │ (私有)  │    │ (私有)  │    │   (私有)    │             │
│  └─────────┘    └─────────┘    └─────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 資料表結構

#### profiles (用戶資料)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  avatar_url TEXT,
  ai_usage_count INTEGER DEFAULT 0,        -- 本週 AI 使用次數
  ai_usage_reset_at TIMESTAMPTZ,           -- 下次重置時間
  subscription_tier TEXT DEFAULT 'free',   -- free | premium
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### kols (KOL 名單 - 共享)

```sql
CREATE TABLE kols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,               -- URL-friendly 名稱
  avatar_url TEXT,
  bio TEXT,
  social_links JSONB DEFAULT '{}',         -- {"twitter": "...", "facebook": "..."}
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kols_name ON kols USING gin(name gin_trgm_ops);  -- 模糊搜尋
```

#### stocks (投資標的 - 共享)

```sql
CREATE TABLE stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT UNIQUE NOT NULL,             -- 股票代碼 (e.g., AAPL, TSLA)
  name TEXT NOT NULL,                      -- 公司名稱
  logo_url TEXT,
  market TEXT DEFAULT 'US',                -- US | TW | HK | CRYPTO (Release 02)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stocks_ticker ON stocks(ticker);
CREATE INDEX idx_stocks_name ON stocks USING gin(name gin_trgm_ops);
```

#### posts (文章記錄 - 共享)

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES kols(id),

  -- 內容
  title TEXT,                              -- AI 生成或手動輸入的標題
  content TEXT NOT NULL,                   -- 主文內容
  source_url TEXT,                         -- 原始網址 (用於重複比對)
  source_platform TEXT,                    -- twitter | facebook | manual
  images TEXT[] DEFAULT '{}',              -- Supabase Storage URLs

  -- 情緒分析
  sentiment INTEGER NOT NULL,              -- -2(強烈看空) ~ +2(強烈看多)
  sentiment_ai_generated BOOLEAN DEFAULT FALSE,

  -- 時間
  posted_at TIMESTAMPTZ NOT NULL,          -- KOL 發文時間
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 歸屬
  created_by UUID REFERENCES profiles(id),

  CONSTRAINT unique_source_url UNIQUE(source_url) WHERE source_url IS NOT NULL
);

CREATE INDEX idx_posts_kol ON posts(kol_id);
CREATE INDEX idx_posts_posted_at ON posts(posted_at DESC);
CREATE INDEX idx_posts_source_url ON posts(source_url);
```

#### post_stocks (文章-標的關聯 - 多對多)

```sql
CREATE TABLE post_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id),

  UNIQUE(post_id, stock_id)
);

CREATE INDEX idx_post_stocks_post ON post_stocks(post_id);
CREATE INDEX idx_post_stocks_stock ON post_stocks(stock_id);
```

#### stock_prices (股價快取 - 共享)

```sql
CREATE TABLE stock_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id),
  date DATE NOT NULL,
  open DECIMAL(12,4),
  high DECIMAL(12,4),
  low DECIMAL(12,4),
  close DECIMAL(12,4) NOT NULL,
  volume BIGINT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(stock_id, date)
);

CREATE INDEX idx_stock_prices_stock_date ON stock_prices(stock_id, date DESC);
```

#### drafts (草稿 - 私有)

```sql
CREATE TABLE drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),

  -- 草稿內容 (與 posts 類似但允許部分為空)
  kol_id UUID REFERENCES kols(id),
  kol_name_input TEXT,                     -- 尚未選定 KOL 時的暫存
  content TEXT,
  source_url TEXT,
  images TEXT[] DEFAULT '{}',
  sentiment INTEGER,
  posted_at TIMESTAMPTZ,
  stock_ids UUID[] DEFAULT '{}',
  stock_name_inputs TEXT[] DEFAULT '{}',   -- 尚未選定 Stock 時的暫存

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drafts_user ON drafts(user_id);
```

#### bookmarks (書籤 - 私有)

```sql
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
```

#### edit_suggestions (編輯建議 - Release 01)

```sql
CREATE TABLE edit_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,               -- 'kol' | 'post' | 'stock'
  target_id UUID NOT NULL,
  suggested_by UUID REFERENCES profiles(id),
  suggestion_type TEXT NOT NULL,           -- 'edit' | 'merge' | 'delete'
  suggestion_data JSONB NOT NULL,          -- 建議的修改內容
  status TEXT DEFAULT 'pending',           -- pending | approved | rejected
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 RLS 政策摘要

| 資料表       | SELECT       | INSERT       | UPDATE       | DELETE |
| ------------ | ------------ | ------------ | ------------ | ------ |
| profiles     | 自己         | 自己         | 自己         | -      |
| kols         | 所有登入用戶 | 所有登入用戶 | 建立者       | -      |
| stocks       | 所有登入用戶 | 所有登入用戶 | -            | -      |
| posts        | 所有登入用戶 | 所有登入用戶 | 建立者       | 建立者 |
| post_stocks  | 所有登入用戶 | 所有登入用戶 | -            | 建立者 |
| stock_prices | 所有登入用戶 | Service Role | Service Role | -      |
| drafts       | 自己         | 自己         | 自己         | 自己   |
| bookmarks    | 自己         | 自己         | -            | 自己   |

---

## 三、MVP 開發階段

### Phase 0: 專案初始化 ✅

**目標**: 建立開發環境與基礎架構
**狀態**: ✅ 完成 (2026-02-01)

#### 任務清單

| #   | 任務                          | 產出                        | 狀態 |
| --- | ----------------------------- | --------------------------- | ---- |
| 0.1 | 初始化 Next.js 16 專案        | 專案骨架                    | ✅ |
| 0.2 | 設定 Tailwind CSS 4 + shadcn/ui | UI 基礎元件              | ✅ |
| 0.3 | 設定 Supabase 專案            | 資料庫連線                  | ✅ |
| 0.4 | 建立資料庫 Schema (Migration) | 所有資料表 (5 migrations)   | ✅ |
| 0.5 | **建立測試用戶**              | DEV_USER_ID 環境變數        | ✅ |
| 0.6 | 設定環境變數                  | .env.local                  | ✅ |
| 0.7 | 建立目錄結構                  | 依 ARCHITECTURE.md          | ✅ |
| 0.8 | 設定 ESLint + Prettier        | 程式碼品質                  | ✅ |

> **開發期間策略**: RLS 政策會先定義但暫不啟用，使用 Service Role Key 進行開發。待 Phase 1 (認證系統) 時再啟用 RLS。

#### 交付成果

- 可執行的 Next.js 開發伺服器
- Supabase 資料庫已建立並可連線
- shadcn/ui 基礎元件可用
- 測試用戶可正常操作

---

### Phase 1: 認證系統 ✅

> 此階段已於 2026-02-02 完成。

**目標**: 用戶註冊、登入、Session 管理、多用戶資料隔離
**狀態**: ✅ 完成 (2026-02-02)

#### 頁面規劃

```
/login          - 登入頁
/register       - 註冊頁
/auth/callback  - OAuth 回調
```

#### 任務清單

| #   | 任務                            | 產出                       | 狀態 |
| --- | ------------------------------- | -------------------------- | ---- |
| 1.1 | 建立 Supabase Auth Client       | `infrastructure/supabase/` | ✅ |
| 1.2 | 實作登入頁面                    | `/login`                   | ✅ |
| 1.3 | 實作註冊頁面                    | `/register`                | ✅ |
| 1.4 | 實作 Auth Callback              | `/auth/callback`           | ✅ |
| 1.5 | 建立 Auth Context/Hook          | `hooks/use-auth.ts`        | ✅ |
| 1.6 | 建立 Protected Route Middleware | `middleware.ts`            | ✅ |
| 1.7 | 建立 Profile 初始化觸發器       | Supabase Function          | ✅ |
| 1.8 | 啟用 RLS 政策                   | 多用戶資料隔離             | ✅ |
| 1.9 | 測試多用戶情境                  | 確保資料正確隔離/共享      | ✅ |

#### API 端點

| 方法 | 路徑              | 說明         |
| ---- | ----------------- | ------------ |
| POST | /api/auth/signup  | 註冊         |
| POST | /api/auth/login   | 登入         |
| POST | /api/auth/logout  | 登出         |
| GET  | /api/auth/session | 取得 Session |

#### 交付成果

- 用戶可以註冊、登入、登出
- 未登入用戶會被導向登入頁
- Session 持久化
- RLS 政策正確運作

---

### Phase 2: KOL 管理模組 ✅

**目標**: KOL 搜尋、建立、檢視
**狀態**: ✅ 完成 (2026-02-01)

#### 頁面規劃

```
/kols           - KOL 列表頁
/kols/[id]      - KOL 詳情頁 (含 Tabs)
  ├── Overview  - 投資標的 Grouping (預設)
  ├── Stats     - 勝率統計
  └── About     - KOL 簡介
```

#### 任務清單

| #    | 任務                   | 產出                                            | 狀態 |
| ---- | ---------------------- | ----------------------------------------------- | ---- |
| 2.1  | 建立 KOL Domain Model  | `domain/models/kol.ts`                          | ✅ |
| 2.2  | 建立 KOL Repository    | `infrastructure/repositories/kol.repository.ts` | ✅ |
| 2.3  | 建立 KOL Service       | `domain/services/kol.service.ts`                | ✅ (merged into repository) |
| 2.4  | 建立 KOL API Routes    | `/api/kols/*`                                   | ✅ |
| 2.5  | 建立 KOL 列表頁        | `/kols/page.tsx`                                | ✅ |
| 2.6  | 建立 KOL 搜尋/選擇元件 | `components/forms/kol-selector.tsx`             | ✅ |
| 2.7  | 建立 KOL 新增 Dialog   | `components/forms/kol-form.tsx`                 | ✅ |
| 2.8  | 建立 KOL 詳情頁 Layout | `/kols/[id]/page.tsx`                           | ✅ |
| 2.9  | 建立 KOL Overview Tab  | 文章依標的 Grouping                             | ✅ |
| 2.10 | 建立 use-kols Hook     | `hooks/use-kols.ts`                             | ✅ |

#### API 端點

| 方法  | 路徑                    | 說明            |
| ----- | ----------------------- | --------------- |
| GET   | /api/kols               | 列表 (支援搜尋) |
| GET   | /api/kols/[id]          | 詳情            |
| POST  | /api/kols               | 新增            |
| PATCH | /api/kols/[id]          | 更新            |
| GET   | /api/kols/[id]/posts    | KOL 的所有文章  |
| GET   | /api/kols/[id]/win-rate | KOL 勝率統計    |

#### UI 設計重點

**KOL 列表頁**

```
┌─────────────────────────────────────────────────────────┐
│  🔍 搜尋 KOL...                          [+ 新增 KOL]   │
├─────────────────────────────────────────────────────────┤
│  ┌─────┐                                                │
│  │Avatar│ KOL Name                    文章數: 42       │
│  └─────┘ 最近發文: 2026/01/30         勝率: 65%        │
│  ─────────────────────────────────────────────────────  │
│  ┌─────┐                                                │
│  │Avatar│ KOL Name                    文章數: 28       │
│  └─────┘ 最近發文: 2026/01/28         勝率: 58%        │
└─────────────────────────────────────────────────────────┘
```

**KOL 詳情頁**

```
┌─────────────────────────────────────────────────────────┐
│  [← 返回]                                               │
│  ┌─────┐                                                │
│  │Avatar│  KOL Name                                     │
│  └─────┘  文章數: 42 | 總體勝率: 65%                    │
├─────────────────────────────────────────────────────────┤
│  [Overview]  [Stats]  [About]                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🍎 AAPL  Apple Inc.                    勝率 70%  │   │
│  │ ├─ 2026/01/30  看多  +5.2% (5日)                │   │
│  │ ├─ 2026/01/15  強烈看多  +12.3% (30日)          │   │
│  │ └─ [查看全部 8 篇]                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🚗 TSLA  Tesla Inc.                    勝率 55%  │   │
│  │ ├─ 2026/01/28  看空  -3.1% (5日)                │   │
│  │ └─ [查看全部 5 篇]                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- 可搜尋/瀏覽 KOL 列表
- 可新增 KOL（需先搜尋確認不存在）
- 可檢視 KOL 的文章（依標的分組）

---

### Phase 3: 投資標的模組 ✅

**目標**: Stock 搜尋、建立、檢視
**狀態**: ✅ 完成 (2026-02-01)

#### 頁面規劃

```
/stocks           - 標的列表頁
/stocks/[ticker]  - 標的詳情頁 (含 Tabs)
  ├── Posts       - 相關文章列表 (預設)
  ├── Chart       - K線圖 & 漲跌幅
  └── Arguments   - 論點彙整 (Phase 8 新增)
```

#### 任務清單

| #   | 任務                     | 產出                                              | 狀態 |
| --- | ------------------------ | ------------------------------------------------- | ---- |
| 3.1 | 建立 Stock Domain Model  | `domain/models/stock.ts`                          | ✅ |
| 3.2 | 建立 Stock Repository    | `infrastructure/repositories/stock.repository.ts` | ✅ |
| 3.3 | 建立 Stock Service       | `domain/services/stock.service.ts`                | ✅ (merged into repository) |
| 3.4 | 建立 Stock API Routes    | `/api/stocks/*`                                   | ✅ |
| 3.5 | 建立 Stock 列表頁        | `/stocks/page.tsx`                                | ✅ |
| 3.6 | 建立 Stock 搜尋/選擇元件 | `components/forms/stock-selector.tsx`             | ✅ |
| 3.7 | 建立 Stock 詳情頁        | `/stocks/[ticker]/page.tsx`                       | ✅ |
| 3.8 | 建立 use-stocks Hook     | `hooks/use-stocks.ts`                             | ✅ |

#### API 端點

| 方法 | 路徑                          | 說明            |
| ---- | ----------------------------- | --------------- |
| GET  | /api/stocks                   | 列表 (支援搜尋) |
| GET  | /api/stocks/[ticker]          | 詳情            |
| POST | /api/stocks                   | 新增            |
| GET  | /api/stocks/[ticker]/posts    | 相關文章        |
| GET  | /api/stocks/[ticker]/prices   | 股價資料        |
| GET  | /api/stocks/[ticker]/win-rate | 標的勝率        |

#### 交付成果

- 可搜尋/瀏覽投資標的列表
- 可新增標的（需先搜尋確認不存在）
- 可檢視標的的相關文章

---

### Phase 4: 輸入與草稿模組 (核心) ✅

**目標**: 實現完整的文章輸入流程
**狀態**: ✅ 完成 (2026-02-18)

#### 頁面規劃

```
/input          - 快速輸入頁 (Landing Page)
/drafts         - 草稿列表頁
/drafts/[id]    - 草稿編輯頁
/posts/new      - 預覽確認頁
```

#### 用戶流程

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  輸入   │────►│  草稿   │────►│  預覽   │────►│  建檔   │
│ Landing │     │  編輯   │     │  確認   │     │  完成   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │
     │               │               │
     ▼               ▼               ▼
  自動存草稿      手動編輯        重複比對
  AI 識別        完善資訊        情緒確認
```

#### 任務清單

| #    | 任務                   | 產出                                              | 狀態 |
| ---- | ---------------------- | ------------------------------------------------- | ---- |
| 4.1  | 建立 Post Domain Model | `domain/models/post.ts`                           | ✅ |
| 4.2  | 建立 Post Repository   | `infrastructure/repositories/post.repository.ts`  | ✅ |
| 4.3  | 建立 Post Service      | `domain/services/post.service.ts`                 | ✅ (merged into repository) |
| 4.4  | 建立 Draft Repository  | `infrastructure/repositories/draft.repository.ts` | ✅ |
| 4.5  | 建立快速輸入頁         | `/input/page.tsx`                                 | ✅ |
| 4.6  | 建立 QuickInput 元件   | `components/forms/quick-input.tsx`                | ✅ |
| 4.7  | 建立草稿列表頁         | `/drafts/page.tsx`                                | ✅ |
| 4.8  | 建立草稿編輯頁         | `/drafts/[id]/page.tsx`                           | ✅ |
| 4.9  | 建立 PostForm 元件     | `components/forms/post-form.tsx`                  | ✅ |
| 4.10 | 建立預覽確認頁         | 草稿審核流程 (draft review)                       | ✅ |
| 4.11 | 建立情緒選擇器         | `components/forms/sentiment-selector.tsx`         | ✅ |
| 4.12 | 建立時間輸入器         | `components/forms/datetime-input.tsx`             | ✅ |
| 4.13 | 實作重複 URL 比對      | `/api/posts/check-duplicate`                      | ✅ |
| 4.14 | 實作圖片上傳           | `/api/upload` + image-uploader 元件               | ✅ |
| 4.15 | 建立 use-drafts Hook   | `hooks/use-drafts.ts`                             | ✅ |
| 4.16 | 建立發布免責聲明       | 預覽確認頁 checkbox + 條款內容                    | ⏳ |

#### API 端點

| 方法   | 路徑                       | 說明         |
| ------ | -------------------------- | ------------ |
| GET    | /api/drafts                | 我的草稿列表 |
| GET    | /api/drafts/[id]           | 草稿詳情     |
| POST   | /api/drafts                | 新增草稿     |
| PATCH  | /api/drafts/[id]           | 更新草稿     |
| DELETE | /api/drafts/[id]           | 刪除草稿     |
| POST   | /api/posts                 | 發布文章     |
| GET    | /api/posts/check-duplicate | 檢查重複 URL |

#### UI 設計重點

**快速輸入頁 (Landing)**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    Stock KOL Tracker                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │   貼上文章內容或網址...                           │  │
│  │                                                   │  │
│  │                                                   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│           [儲存為草稿]        [直接建檔 →]              │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  📝 草稿 (3)                              [查看全部 →]  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ TSLA 相關 - 2小時前                      [編輯] │    │
│  │ AAPL 相關 - 昨天                         [編輯] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**草稿編輯頁**

```
┌─────────────────────────────────────────────────────────┐
│  [← 返回草稿列表]                          [🗑️ 刪除]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  KOL *                                                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🔍 搜尋或選擇 KOL...                     [+ 新增] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  投資標的 *                                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🔍 搜尋或選擇標的... (可多選)            [+ 新增] │  │
│  │ [AAPL ✕] [TSLA ✕]                                 │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  發文時間 *                                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │ [📅 2026/01/30]  [🕐 14:30]                       │  │
│  │ 或輸入相對時間: [2小時前] [1天前] [3天前]         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  主文內容 *                                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │ KOL 的原始發文內容...                             │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  圖片                                                   │
│  ┌─────┐ ┌─────┐ ┌─────┐                               │
│  │ 📷  │ │ 📷  │ │ +   │                               │
│  └─────┘ └─────┘ └─────┘                               │
│                                                         │
│                        [預覽並確認 →]                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**預覽確認頁**

```
┌─────────────────────────────────────────────────────────┐
│  [← 返回編輯]                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️ 此文章網址已存在於資料庫中                         │
│     建立於 2026/01/28 - [查看現有文章]                  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ┌─────┐  KOL Name                                      │
│  │Avatar│  2026/01/30 14:30                             │
│  └─────┘  AAPL, TSLA                                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │ 主文內容預覽...                                   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  走勢情緒 *                                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │ [強烈看空] [看空] [●中立] [看多] [強烈看多]       │  │
│  │                                                   │  │
│  │ 💡 AI 建議: 看多 (基於文本分析)          [採用]   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ☐ 我確認以下事項：                                    │
│    1. 本內容非來自付費牆或受版權保護的來源              │
│    2. 本平台不對任何投資決策或潛在損失負責              │
│    3. 我對上傳內容的合法性承擔完全責任                  │
│                                                         │
│                        [✓ 確認建檔]  ← 未勾選時 disabled│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- 完整的文章輸入流程
- 草稿自動儲存
- 重複 URL 檢測
- 情緒選擇（5 級制）
- 圖片上傳
- 發布前免責聲明 (內容合法性、投資風險、用戶責任)

---

### Phase 5: 文章檢視模組 ✅

**目標**: 單篇文章詳情頁
**狀態**: ✅ 完成 (2026-02-12)

#### 頁面規劃

```
/posts          - 文章列表頁 (全部文章)
/posts/[id]     - 文章詳情頁 (含 Tabs)
  ├── Content   - 主文內容 (預設)
  └── Chart     - K線圖
```

#### 任務清單

| #   | 任務                | 產出                         | 狀態 |
| --- | ------------------- | ---------------------------- | ---- |
| 5.1 | 建立文章列表頁      | `/posts/page.tsx`            | ✅ |
| 5.2 | 建立文章詳情頁      | `/posts/[id]/page.tsx`       | ✅ |
| 5.3 | 建立文章 Header     | 顯示 KOL、時間、情緒、漲跌幅 | ✅ |
| 5.4 | 建立內容 Tab        | 主文 + 圖片 + 書籤           | ✅ |
| 5.5 | 建立 use-posts Hook | `hooks/use-posts.ts`         | ✅ |

#### API 端點

| 方法   | 路徑            | 說明     |
| ------ | --------------- | -------- |
| GET    | /api/posts      | 文章列表 |
| GET    | /api/posts/[id] | 文章詳情 |
| PATCH  | /api/posts/[id] | 更新文章 |
| DELETE | /api/posts/[id] | 刪除文章 |

#### UI 設計重點

**文章詳情頁**

```
┌─────────────────────────────────────────────────────────┐
│  [← 返回]                                    [☆ 書籤]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────┐  KOL Name                                      │
│  │Avatar│  2026/01/30 14:30                             │
│  └─────┘                                                │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🍎 AAPL    看多 ▲    +5.2% (5日) | +8.1% (30日)  │  │
│  │ 🚗 TSLA    看多 ▲    +3.1% (5日) | +2.3% (30日)  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Content]  [Chart]                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  主文內容...                                            │
│                                                         │
│  ┌─────────┐ ┌─────────┐                               │
│  │  圖片1   │ │  圖片2   │                               │
│  └─────────┘ └─────────┘                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- 可瀏覽所有文章列表
- 可檢視單篇文章詳情
- 顯示發文後漲跌幅

---

### Phase 6: 股價與 K 線圖模組 ✅

**目標**: 整合 Tiingo API、K 線圖顯示
**狀態**: ✅ 完成 — K 線圖+情緒標記+工具列已整合到兩個詳情頁

#### 任務清單

| #   | 任務                       | 產出                                                    | 狀態 |
| --- | -------------------------- | ------------------------------------------------------- | ---- |
| 6.1 | 建立 Tiingo Client         | `infrastructure/api/tiingo.client.ts`                   | ✅ |
| 6.2 | 建立 StockPrice Repository | `infrastructure/repositories/stock-price.repository.ts` | ✅ |
| 6.3 | 建立股價快取邏輯           | 7 天快取                                                | ✅ |
| 6.4 | 建立股價 API               | `/api/stocks/[ticker]/prices`                           | ✅ |
| 6.5 | 建立 K 線圖元件            | `components/charts/candlestick-chart.tsx`               | ✅ |
| 6.6 | 建立情緒標記元件           | `components/charts/sentiment-marker.tsx`                | ✅ |
| 6.7 | 整合到文章詳情頁           | `/posts/[id]` 右側面板雙圖表 (K線+情緒折線)             | ✅ |
| 6.8 | 整合到標的詳情頁           | `/stocks/[ticker]` Chart Tab 雙圖表                     | ✅ |
| 6.9 | 實作圖表縮放/平移          | chart-toolbar (日/週/月/季/年 + 1M/1Q/YTD/1Y/5Y)       | ✅ |

#### API 端點

| 方法 | 路徑                        | 說明         |
| ---- | --------------------------- | ------------ |
| GET  | /api/stocks/[ticker]/prices | 取得股價資料 |

#### UI 設計重點

**K 線圖 (文章頁)**

```
┌─────────────────────────────────────────────────────────┐
│  [日線] [週線] [月線]                    [← →] 平移     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│        ┃                                                │
│        ┃    ┃                                           │
│   ┃    ┃    ┃         ┃                                 │
│   ┃    ┃    ┃    ┃    ┃    ┃                            │
│   ┃    ┃    ┃    ┃    ┃    ┃    ┃                       │
│        ┃              ┃         ┃                       │
│                       🔺                                │
│                    看多 (本篇發文)                       │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  ▁▂▃▂▁▂▃▄▅▄▃▂▃▄▃▂▁▂▃▂▁  (成交量)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- K 線圖正常顯示
- 可縮放（日/週/月線）、平移
- 文章情緒標記顯示在圖表上
- 股價資料快取機制

---

### Phase 7: 勝率計算模組 ✅

**目標**: 計算 KOL / 標的勝率
**狀態**: ✅ 完成 — 計算邏輯 + API + UI 顯示全部完成

#### 任務清單

| #   | 任務                        | 產出                                            | 狀態 |
| --- | --------------------------- | ----------------------------------------------- | ---- |
| 7.1 | 建立 PriceChange Calculator | `domain/calculators/price-change.calculator.ts` | ✅ (含單元測試) |
| 7.2 | 建立 WinRate Calculator     | `domain/calculators/win-rate.calculator.ts`     | ✅ (含單元測試) |
| 7.3 | 建立勝率 API (KOL)          | `/api/kols/[id]/win-rate`                       | ✅ |
| 7.4 | 建立勝率 API (Stock)        | `/api/stocks/[ticker]/win-rate`                 | ✅ |
| 7.5 | 更新 KOL 詳情頁 Stats Tab   | `/stocks/[ticker]` Stats Tab 顯示勝率統計       | ✅ |
| 7.6 | 更新文章列表顯示漲跌幅      | 5/30 日顯示於 posts, stocks, kols, post detail  | ✅ |

#### 勝率計算邏輯

```typescript
// 情緒對應
const SENTIMENT_MAP = {
  2: 'strong_bullish',   // 強烈看多
  1: 'bullish',          // 看多
  0: 'neutral',          // 中立
  -1: 'bearish',         // 看空
  -2: 'strong_bearish',  // 強烈看空
};

// 勝率判定
function isWin(sentiment: number, priceChange: number): boolean {
  if (sentiment > 0) return priceChange > 0;  // 看多 + 漲 = 勝
  if (sentiment < 0) return priceChange < 0;  // 看空 + 跌 = 勝
  return true;  // 中立不計入勝負
}

// 勝率計算
function calculateWinRate(posts: Post[], period: number): WinRateResult {
  const validPosts = posts.filter(p => p.sentiment !== 0);
  const wins = validPosts.filter(p => isWin(p.sentiment, p.priceChanges[period]));
  return {
    period,
    total: validPosts.length,
    wins: wins.length,
    rate: wins.length / validPosts.length,
  };
}
```

#### 交付成果

- KOL 勝率統計（5/30/90/365 日）
- 標的勝率統計
- 文章列表顯示漲跌幅

---

### Phase 8: AI 整合模組 🔄

**目標**: Gemini API 整合、情緒分析、**論點提取與彙整**、配額管理
**狀態**: 🔄 85% — 情緒分析/論點提取/論點彙整 UI/配額完成，時間分布圖待實作

#### 8.1 功能概述

本模組分為三大功能：

| 功能         | 說明                                 | 觸發時機     |
| ------------ | ------------------------------------ | ------------ |
| **情緒分析** | 判斷文章的看多/看空傾向              | 文章收錄時   |
| **論點提取** | 依據「特定框架」提取支持情緒的論點   | 文章收錄時   |
| **論點彙整** | 以 Ticker 為維度，彙整所有論點的分布 | 檢視標的頁時 |

#### 8.2 資料模型擴充

```sql
-- 論點類別 (依據特定框架定義)
CREATE TABLE argument_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,           -- e.g., 'VALUATION', 'GROWTH', 'RISK'
  name TEXT NOT NULL,                  -- 顯示名稱
  description TEXT,
  sentiment_direction TEXT,            -- 'bullish' | 'bearish' | 'neutral'
  parent_id UUID REFERENCES argument_categories(id),  -- 支援階層
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文章論點 (AI 提取結果)
CREATE TABLE post_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id),
  category_id UUID NOT NULL REFERENCES argument_categories(id),

  -- AI 提取內容
  original_text TEXT,                  -- 原文摘錄
  summary TEXT,                        -- AI 摘要
  sentiment INTEGER NOT NULL,          -- -2 ~ +2 (此論點的情緒強度)
  confidence DECIMAL(3,2),             -- AI 信心度 0~1

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_arguments_post ON post_arguments(post_id);
CREATE INDEX idx_post_arguments_stock ON post_arguments(stock_id);
CREATE INDEX idx_post_arguments_category ON post_arguments(category_id);

-- 論點彙整快取 (定期更新或即時計算)
CREATE TABLE stock_argument_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES stocks(id),
  category_id UUID NOT NULL REFERENCES argument_categories(id),

  -- 統計資料
  mention_count INTEGER DEFAULT 0,           -- 被提及次數
  bullish_count INTEGER DEFAULT 0,           -- 看多次數
  bearish_count INTEGER DEFAULT 0,           -- 看空次數
  first_mentioned_at TIMESTAMPTZ,            -- 首次提及時間
  last_mentioned_at TIMESTAMPTZ,             -- 最近提及時間
  avg_sentiment DECIMAL(3,2),                -- 平均情緒

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(stock_id, category_id)
);
```

#### 8.3 任務清單

| #            | 任務                     | 產出                                                | 狀態 |
| ------------ | ------------------------ | --------------------------------------------------- | ---- |
| **基礎設施** |                          |                                                     |      |
| 8.1          | 建立 Gemini Client       | `infrastructure/api/gemini.client.ts`               | ✅ |
| 8.2          | 建立 AI Service          | `domain/services/ai.service.ts`                     | ✅ (含單元測試) |
| 8.3          | 建立配額檢查邏輯         | ai-usage.repository.ts                              | ✅ |
| 8.4          | 建立週次重置 Cron        | Supabase Function                                   | ⏳ |
| **情緒分析** |                          |                                                     |      |
| 8.5          | 建立情緒分析 API         | `/api/ai/analyze`                                   | ✅ |
| 8.6          | 整合到預覽確認頁         | AI 建議情緒 (draft review)                          | ✅ |
| **論點提取** |                          |                                                     |      |
| 8.7          | 建立論點類別資料表       | Migration 003                                       | ✅ |
| 8.8          | 匯入「特定框架」論點類別 | Seed Data (7 categories)                            | ✅ |
| 8.9          | 建立論點提取 Prompt      | 依框架結構化提取                                    | ✅ |
| 8.10         | 建立論點提取 API         | `/api/ai/extract-arguments`                         | ✅ |
| 8.11         | 整合到文章建檔流程       | 自動提取論點                                        | ✅ |
| 8.12         | 建立文章論點檢視元件     | `components/ai/post-arguments.tsx`                  | ✅ |
| **論點彙整** |                          |                                                     |      |
| 8.13         | 建立論點彙整計算器       | `domain/calculators/argument-summary.calculator.ts` | ✅ (含單元測試) |
| 8.14         | 建立論點彙整 API         | `/api/stocks/[ticker]/arguments`                    | ✅ |
| 8.15         | 建立標的論點彙整頁面     | Stock 詳情新增 Arguments Tab                        | ✅ |
| 8.16         | 建立論點時間分布圖表     | `components/charts/argument-timeline.tsx`           | 🔄 (元件+API 完成，Stock 頁面整合待做) |
| **配額管理** |                          |                                                     |      |
| 8.17         | 建立配額查詢 API         | `/api/ai/usage`                                     | ✅ |
| 8.18         | 顯示剩餘配額             | `components/ai/ai-quota-badge.tsx`                  | ✅ |

#### 8.4 API 端點

| 方法 | 路徑                           | 說明         |
| ---- | ------------------------------ | ------------ |
| POST | /api/ai/analyze                | 分析文本情緒 |
| POST | /api/ai/extract-arguments      | 提取文章論點 |
| GET  | /api/ai/usage                  | 查詢配額使用 |
| GET  | /api/stocks/[ticker]/arguments | 標的論點彙整 |
| GET  | /api/argument-categories       | 論點類別列表 |

#### 8.5 Prompt 設計

**情緒分析 Prompt**

```typescript
const SENTIMENT_ANALYSIS_PROMPT = `
分析以下投資相關文章，判斷作者對提及的投資標的的看法。

文章內容:
{content}

請以 JSON 格式回傳:
{
  "sentiment": <-2 到 2 的整數>,
  "confidence": <0 到 1 的小數>,
  "reasoning": "<簡短說明判斷理由>"
}

sentiment 數值對應:
- 2: 強烈看多 (明確表示非常看好，建議買入)
- 1: 看多 (正面評價，認為會上漲)
- 0: 中立 (沒有明確方向性判斷)
- -1: 看空 (負面評價，認為會下跌)
- -2: 強烈看空 (明確表示非常不看好，建議賣出)
`;
```

**論點提取 Prompt (框架待確認)**

```typescript
const ARGUMENT_EXTRACTION_PROMPT = `
分析以下投資文章，依據指定的分析框架，提取作者提出的論點。

文章內容:
{content}

投資標的:
{ticker} - {stockName}

分析框架類別:
{frameworkCategories}

請以 JSON 格式回傳找到的論點:
{
  "arguments": [
    {
      "category_code": "<框架類別代碼>",
      "original_text": "<原文摘錄 (最多 200 字)>",
      "summary": "<論點摘要 (一句話)>",
      "sentiment": <-2 到 2，此論點的看多/看空程度>,
      "confidence": <0 到 1>
    }
  ]
}

注意事項:
1. 只提取文章中明確提及的論點，不要推測
2. 每個論點需對應到框架中的類別
3. 如果文章沒有提到某類別，不需要硬填
`;
```

#### 8.6 UI 設計重點

**標的論點彙整頁 (新增 Tab)**

```
┌─────────────────────────────────────────────────────────┐
│  🍎 AAPL  Apple Inc.                                    │
├─────────────────────────────────────────────────────────┤
│  [Posts]  [Chart]  [Arguments]                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📊 論點分布統計                                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 估值 (Valuation)                                  │  │
│  │ ████████████░░░░  12 次提及  |  看多 8 / 看空 4   │  │
│  │ 最近: 2026/01/30  |  首次: 2025/08/15            │  │
│  │                                           [展開] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 成長性 (Growth)                                   │  │
│  │ ██████████████████  18 次提及  |  看多 15 / 看空 3│  │
│  │ 最近: 2026/01/28  |  首次: 2025/06/01            │  │
│  │                                           [展開] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 風險因素 (Risk)                                   │  │
│  │ ████░░░░░░░░░░░░░  4 次提及   |  看多 1 / 看空 3 │  │
│  │ 最近: 2026/01/20  |  首次: 2025/12/01            │  │
│  │                                           [展開] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  📈 論點時間分布                                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │     ●                    ●  ●                     │  │
│  │  ●  ●  ●              ●  ●  ●  ●                  │  │
│  │  ●  ●  ●  ●        ●  ●  ●  ●  ●  ●              │  │
│  │──────────────────────────────────────────────────│  │
│  │ Aug  Sep  Oct  Nov  Dec  Jan                     │  │
│  │ ● 估值  ● 成長性  ● 風險                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**論點展開詳情**

```
┌───────────────────────────────────────────────────────┐
│ 估值 (Valuation) - 12 次提及                          │
├───────────────────────────────────────────────────────┤
│                                                       │
│ ▲ 看多論點 (8)                                        │
│ ├─ "目前本益比僅 25 倍，低於歷史平均..."              │
│ │   by 股癌 @ 2026/01/30          [查看原文]         │
│ ├─ "相較於同業，估值具有吸引力..."                   │
│ │   by 財報狗 @ 2026/01/25        [查看原文]         │
│ └─ [查看更多 6 則]                                    │
│                                                       │
│ ▼ 看空論點 (4)                                        │
│ ├─ "以目前的成長率來看，估值已經偏高..."             │
│ │   by 某某 @ 2026/01/20          [查看原文]         │
│ └─ [查看更多 3 則]                                    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### 8.7 交付成果

- ✅ AI 情緒分析功能
- ✅ **論點提取功能** (依特定框架，7 大類別已 seed)
- ✅ **論點彙整頁面** (以 Ticker 為維度) — API + UI + i18n 完成
- ⏳ **論點時間分布圖表** — 待實作
- ✅ 配額管理

#### 8.8 待辦事項 (Pending)

| #            | 待辦項目             | 狀態      | 備註                     |
| ------------ | -------------------- | --------- | ------------------------ |
| **TODO-001** | 提供「特定框架」定義 | ✅ 已完成 | 7 大類別已定義並 seed    |

> **框架定義需求**:
> 請提供論點分析框架，包含：
>
> 1. 類別代碼 (code)
> 2. 類別名稱 (name)
> 3. 類別描述 (description)
> 4. 情緒方向 (bullish/bearish/neutral)
> 5. 階層結構 (如有父子關係)
>
> 範例格式:
>
> ```
> VALUATION (估值) - neutral
> ├── VALUATION_PE (本益比)
> ├── VALUATION_PB (股價淨值比)
> └── VALUATION_DCF (現金流折現)
> GROWTH (成長性) - bullish
> ├── GROWTH_REVENUE (營收成長)
> └── GROWTH_MARGIN (毛利率提升)
> RISK (風險因素) - bearish
> ├── RISK_COMPETITION (競爭風險)
> └── RISK_REGULATION (法規風險)
> ```

---

### Phase 9: App Layout & 導航 ✅

**目標**: 建立整體 App 框架與導航
**狀態**: ✅ 完成 (2026-02-10)

#### 任務清單

| #   | 任務              | 產出                            | 狀態 |
| --- | ----------------- | ------------------------------- | ---- |
| 9.1 | 建立 App Layout   | `app/(app)/layout.tsx`          | ✅ |
| 9.2 | 建立 Sidebar      | `components/layout/sidebar.tsx` | ✅ |
| 9.3 | 建立 Header       | `components/layout/header.tsx`  | ✅ |
| 9.4 | 建立 Dashboard 頁 | `/dashboard/page.tsx`           | ✅ |
| 9.5 | 建立路由常數      | `lib/constants/routes.ts`       | ✅ |
| 9.6 | 建立 Mobile Nav   | `components/layout/mobile-nav.tsx` | ✅ (計畫外新增) |

#### 導航結構

```
Sidebar:
├── 📊 Dashboard      (總覽)
├── ✏️ 快速輸入       (/input)
├── 📝 草稿          (/drafts)
├── 👤 KOL 列表      (/kols)
├── 📈 投資標的      (/stocks)
├── 📄 所有文章      (/posts)
└── ⚙️ 設定          (/settings)
```

#### UI 設計重點

**App Layout**

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────┐                                      [Avatar]  │
│  │  Logo   │    Stock KOL Tracker                           │
│  └─────────┘                                                │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  📊 Dashboard│   [Page Content Area]                        │
│              │                                              │
│  ✏️ 快速輸入 │                                              │
│              │                                              │
│  📝 草稿 (3) │                                              │
│              │                                              │
│  ──────────  │                                              │
│              │                                              │
│  👤 KOL 列表 │                                              │
│              │                                              │
│  📈 投資標的 │                                              │
│              │                                              │
│  📄 所有文章 │                                              │
│              │                                              │
│  ──────────  │                                              │
│              │                                              │
│  ⚙️ 設定     │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  AI 配額: 12/15 本週                   © 2026 Stock Tracker │
└─────────────────────────────────────────────────────────────┘
```

#### 交付成果

- 完整的 App 框架
- Sidebar 導航
- Dashboard 總覽頁

---

### Phase 10: 測試與優化 🔄

**目標**: 品質保證、效能優化、部署準備
**狀態**: 🔄 50% — 測試框架完成，覆蓋率與部署待加強

#### 任務清單

| #    | 任務                  | 產出                               | 狀態 |
| ---- | --------------------- | ---------------------------------- | ---- |
| 10.1 | 設定 Vitest           | 測試框架 (happy-dom)               | ✅ |
| 10.2 | 撰寫核心邏輯單元測試  | price-change, win-rate, argument-summary, ai.service, stock-price.repo | ✅ |
| 10.3 | 設定 Playwright       | E2E 測試 + fixtures                | ✅ |
| 10.4 | 撰寫關鍵流程 E2E 測試 | quick-input flow                   | ✅ (基本流程) |
| 10.5 | 效能優化              | 動態載入 (charts ssr:false) + Bundle Analyzer 完成；React Query staleTime 部分 hooks 待補 | 🔄 |
| 10.6 | 設定 Vercel 專案      | vercel.json + .env.example + /api/health + 安全標頭 + DEV_USER_ID guard | ✅ |
| 10.7 | 設定 CI/CD            | GitHub Actions                     | ✅ (lint + type-check + test) |
| 10.8 | 撰寫 README           | 專案文件                           | ✅ |

#### 交付成果

- 單元測試覆蓋核心邏輯
- E2E 測試覆蓋關鍵流程
- 可部署到 Vercel

---

### Phase 11: Google OAuth & Auth 強化 ✅

**目標**: 降低註冊門檻 + 補齊認證基礎設施
**狀態**: ✅ 完成 (2026-02-22)
**對應工作**: Session A (Google OAuth) + Session C (Auth Hardening)

#### 任務清單

| #    | 任務                        | 產出                              | 狀態 |
| ---- | --------------------------- | --------------------------------- | ---- |
| 11.1 | 設定 Supabase Google OAuth  | Supabase Dashboard + env 設定     | ✅ |
| 11.2 | 建立 OAuth Callback 處理    | `/auth/callback` 更新             | ✅ |
| 11.3 | 更新登入頁 UI               | Google 登入按鈕 + 分隔線 + GoogleIcon 元件 | ✅ |
| 11.4 | 更新註冊頁 UI               | Google 註冊按鈕 + 分隔線          | ✅ |
| 11.5 | 啟用 Email 驗證             | Supabase client.ts 文件化設定     | ✅ |
| 11.6 | 建立密碼重設頁面            | `/reset-password` 頁面            | ✅ |
| 11.7 | 建立密碼重設確認頁面        | `/reset-password/confirm` 頁面    | ✅ |

#### UI 設計重點

**登入頁 (更新後)**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                 Stock KOL Tracker                       │
│                                                         │
│         [🔵 Continue with Google]                       │
│                                                         │
│         ─────── or ───────                              │
│                                                         │
│         Email:    [________________]                    │
│         Password: [________________]                    │
│                                                         │
│                  [Login]                                │
│                                                         │
│         Forgot password?    Sign up                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- 用戶可用 Google 帳號一鍵登入/註冊
- 忘記密碼可透過 Email 重設
- Email 驗證機制啟用

---

### Phase 12: KOL 匯入工具 ✅

**目標**: 讓用戶透過 URL 批量匯入 KOL 的歷史文章，快速體驗產品價值
**狀態**: ✅ 完成 (2026-02-22)
**對應工作**: Session B-0 (Agent 1)
**策略**: MVP 先做「貼個別 URL」(12a)，後續再加「Profile 自動發現」(12b)

#### 12.1 功能概述

**Phase 12a — 個別 URL 匯入 (MVP)**

用戶手動貼入個別文章/影片 URL，系統批量處理：

| 平台 | 輸入 | 數量上限 | 技術方案 | 現有基礎 |
|------|------|----------|----------|----------|
| **Twitter/X** | 個別推文 URL | 5 則 | 現有 TwitterExtractor (oEmbed API, 免費) | ✅ 已實作 |
| **YouTube** | 個別影片 URL | 3 則 | 新建 YouTubeExtractor + transcript 庫 | ✅ 已實作 |

**Phase 12b — Profile 自動發現 (Release 01)**

用戶貼入 KOL 的 Profile/Channel URL，系統自動找出近期文章：

| 平台 | 輸入 | 技術方案 | 預估成本 |
|------|------|----------|----------|
| **Twitter/X** | Profile URL | Twitter API v2 或第三方服務 (Apify/SocialData) | 付費 |
| **YouTube** | Channel URL | YouTube Data API (免費 10K units/day) | 免費 |

#### 12.2 配額策略

- **首次引導匯入免配額**: 用戶在 onboarding flow 中的第一次匯入不計入 AI 週配額
- 實作方式: `profiles` 新增 `onboarding_import_used BOOLEAN DEFAULT FALSE` 欄位
- 後續匯入按正常配額計算

#### 12.3 資料流 (Phase 12a)

```
用戶輸入 KOL 名稱
用戶貼入 3-5 個文章/影片 URL
        │
        ▼
┌─────────────────┐
│  平台識別        │  逐一識別 URL 類型
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
Twitter/X  YouTube
(oEmbed)   (transcript)
    │         │
    └────┬────┘
         ▼
┌─────────────────┐
│  批量處理管線    │
│  1. 建立 KOL    │  ← 用戶手動輸入名稱
│  2. 建立 Posts  │  ← 每個 URL 一篇
│  3. AI 情緒分析 │  ← 首次免配額
│  4. AI Ticker   │
│  5. AI 論點提取 │
└────────┬────────┘
         ▼
   匯入結果頁面
   (顯示已建立的 KOL + Posts)
```

#### 12.4 任務清單

| #    | 任務                            | 產出                                          | 狀態 |
| ---- | ------------------------------- | --------------------------------------------- | ---- |
| **Phase 12a — 個別 URL 匯入 (MVP)** | |                                        |      |
| 12.1 | 建立 YouTube Extractor          | `extractors/youtube.extractor.ts`             | ✅ |
| 12.2 | 建立 YouTube 逐字稿擷取        | youtube-transcript 庫整合                     | ✅ |
| 12.3 | 註冊 YouTube 到 ExtractorFactory| `extractors/factory.ts` 更新                  | ✅ |
| 12.4 | 建立批量匯入管線               | `domain/services/import-pipeline.service.ts`  | ✅ |
| 12.5 | 建立批量匯入 API               | `/api/import/batch`                           | ✅ |
| 12.6 | 建立配額豁免邏輯               | `onboarding_import_used` 欄位 + DB migration  | ✅ |
| 12.7 | 建立匯入頁面 UI                | `/import` 頁面 (KOL 名稱 + URL 清單輸入)     | ✅ |
| 12.8 | 建立匯入進度元件               | `components/import/import-loading-overlay.tsx` | ✅ |
| 12.9 | 建立匯入結果元件               | `components/import/import-result.tsx`          | ✅ |
| **Phase 12b — Profile 自動發現 (Release 01)** | |                                |      |
| 12.10 | 調研 Twitter 批量取得方案      | 技術選型文件                                  | ⏳ |
| 12.11 | 建立 Twitter Profile Parser    | `extractors/twitter-profile.extractor.ts`     | ⏳ |
| 12.12 | 建立 YouTube Channel Parser    | YouTube Data API 整合                         | ⏳ |

#### 12.5 API 端點

| 方法 | 路徑                   | 說明                                     |
| ---- | ---------------------- | ---------------------------------------- |
| POST | /api/import/batch      | 批量匯入 (KOL 名稱 + URL 陣列)          |
| GET  | /api/import/status/[id]| 查詢匯入任務進度 (Phase 12b SSE 預留)    |

#### 12.6 UI 設計重點

**KOL 匯入頁 (Phase 12a)**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  📥 快速匯入 KOL 文章                                  │
│                                                         │
│  KOL 名稱 *                                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 例如: 股癌、財報狗、Graham Stephan...             │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  文章/影片 URL (最多 5 則)                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🔗 https://x.com/stockguru/status/123...   [✕]   │  │
│  │ 🔗 https://x.com/stockguru/status/456...   [✕]   │  │
│  │ 📺 https://youtube.com/watch?v=abc...       [✕]   │  │
│  │                                                   │  │
│  │ [+ 新增 URL]                                      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  支援: 🐦 Twitter/X 推文  📺 YouTube 影片              │
│  ⭐ 首次匯入免消耗 AI 配額！                           │
│                                                         │
│                        [開始匯入]                       │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  📊 匯入進度                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ 建立 KOL: 股癌                                 │  │
│  │ ✅ 擷取內容: 3/3                                  │  │
│  │ 🔄 AI 分析: 2/3                                   │  │
│  │ ████████████████████░░░░  78%                     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│                  [查看 KOL 詳情 →]                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

**Phase 12a (MVP)**
- 用戶可貼入 Twitter/X 推文 URL (最多 5 則)，批量匯入
- 用戶可貼入 YouTube 影片 URL (最多 3 則)，自動擷取逐字稿匯入
- 可混合貼入不同平台的 URL
- 首次 onboarding 匯入免消耗 AI 配額
- 匯入過程顯示即時進度
- 匯入完成後自動跳轉至 KOL 詳情頁

**Phase 12b (Release 01)**
- 用戶可貼入 Profile/Channel URL，自動發現近期文章

---

### Phase 13: 用戶引導流程 ✅

**目標**: 新用戶首次登入後的引導體驗，降低流失率
**狀態**: ✅ 完成 (2026-02-22)
**對應工作**: Session B-1 (Agent 2)

#### 任務清單

| #    | 任務                         | 產出                                       | 狀態 |
| ---- | ---------------------------- | ------------------------------------------ | ---- |
| 13.1 | 建立 Welcome 頁面            | `/onboarding` (3 步驟引導)                 | ✅ |
| 13.2 | 建立 Step 1: 產品介紹        | 功能亮點 + 價值主張 (4 feature cards)      | ✅ |
| 13.3 | 建立 Step 2: KOL 匯入整合    | 嵌入 Phase 12 匯入工具                     | ✅ |
| 13.4 | 建立 Step 3: 完成引導        | 引導至 KOL 詳情頁或 Dashboard              | ✅ |
| 13.5 | 建立 Empty States 元件       | Dashboard, KOLs, Stocks, Posts, Drafts, Bookmarks | ✅ |
| 13.6 | 建立首次登入偵測邏輯         | `profiles.onboarding_completed` + `onboarding-guard.tsx` | ✅ |
| 13.7 | 建立 Sidebar Hint            | Import 連結 "New" 徽章 (未完成 onboarding 用戶) | ✅ |

#### 13.1 用戶流程

```
首次登入
    │
    ▼
┌─────────┐     ┌──────────────┐     ┌─────────┐
│ Step 1  │────►│   Step 2     │────►│ Step 3  │
│ 產品介紹 │     │ 匯入 KOL 文章│     │ 完成！  │
│ (可跳過) │     │ (核心體驗)   │     │ 前往首頁│
└─────────┘     └──────────────┘     └─────────┘
                      │
                      ▼
               貼入 KOL URL
               自動匯入 5-10 篇
               即時看到 AI 分析結果
```

#### 13.2 Empty States 設計

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  📊 Dashboard                                          │
│                                                         │
│            ┌──────────────────────┐                     │
│            │                      │                     │
│            │   📭 尚無追蹤資料    │                     │
│            │                      │                     │
│            │  開始追蹤你關注的     │                     │
│            │  投資 KOL 吧！       │                     │
│            │                      │                     │
│            │  [匯入 KOL 文章]     │                     │
│            │  [手動新增文章]      │                     │
│            │                      │                     │
│            └──────────────────────┘                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 交付成果

- 新用戶首次登入自動進入引導流程
- 引導流程整合 KOL 匯入工具作為核心體驗
- 所有頁面有有意義的 Empty States 和 CTA
- 引導完成後標記 `onboarding_completed`，不再重複觸發

---

## 四、開發順序總覽

> **開發策略**: 先以單一用戶（開發者）驗證核心功能，認證系統最後實作

```
Phase 0: 專案初始化
    │
    ▼
Phase 9: App Layout & 導航  ◄── 先建立框架，方便後續開發
    │
    ├───────────────────────────────────────┐
    ▼                                       ▼
Phase 2: KOL 管理              Phase 3: 投資標的管理
    │                                       │
    └───────────────┬───────────────────────┘
                    ▼
            Phase 4: 輸入與草稿 (核心)
                    │
                    ▼
            Phase 5: 文章檢視
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
Phase 6:       Phase 7:        Phase 8:
K線圖          勝率計算         AI 整合
    │               │           (情緒+論點分析)
    └───────────────┴───────────────┘
                    │
                    ▼
            Phase 10: 測試與優化
                    │
                    ▼
            Phase 1: 認證系統  ◄── 基本認證
                    │
    ════════════════╪════════════════════  商業功能 ════
                    │
                    ▼
            Phase 11: Google OAuth & Auth 強化
                    │
                    ▼
            Phase 12: KOL 匯入工具
                    │   (Twitter/X + YouTube)
                    ▼
            Phase 13: 用戶引導流程
                    │   (Welcome + Empty States + 匯入整合)
                    ▼
            Phase 14: 付費機制  ◄── Release 02 (上線後)
```

---

## 五、里程碑檢查點

| 里程碑 | 完成階段    | 可驗收功能                   | 狀態 |
| ------ | ----------- | ---------------------------- | ---- |
| **M1** | Phase 0, 9  | App 框架、基本導航           | ✅ 2026-02-01 |
| **M2** | Phase 2-3   | 可搜尋/新增 KOL 和標的       | ✅ 2026-02-01 |
| **M3** | Phase 4-5   | 完整輸入流程、可檢視文章     | ✅ 2026-02-18 |
| **M4** | Phase 6-7   | K 線圖顯示、勝率計算         | ✅ 2026-02-18 |
| **M5** | Phase 8     | AI 情緒分析、論點提取與彙整  | 🔄 95% — argument-timeline 元件完成，Stock 頁面整合待做 |
| **M6** | Phase 10, 1 | 測試優化、認證系統、完整 MVP | 🔄 90% — 認證+Vercel 部署完成，React Query staleTime 待補 |
| **M7** | Phase 11    | Google OAuth、Email 驗證、密碼重設 | ✅ 2026-02-22 |
| **M8** | Phase 12-13 | KOL 匯入工具 + 用戶引導流程 | ✅ 2026-02-22 |

---

## 六、待確認/待辦事項

### MVP 待辦

| ID           | 項目                     | 狀態      | 說明                                 |
| ------------ | ------------------------ | --------- | ------------------------------------ |
| **TODO-001** | 論點分析框架定義         | ✅ 已完成 | 7 大類別已 seed                      |
| **TODO-002** | 勝率 UI (Stats Tab)      | ✅ 已完成 | Phase 7.5 — stocks 詳情頁 Stats Tab  |
| **TODO-003** | 漲跌幅顯示 (文章列表)    | ✅ 已完成 | Phase 7.6 — 5/30 日顯示於四個頁面   |
| **TODO-004** | K 線圖整合到詳情頁       | ✅ 已完成 | Phase 6.7-6.8 — 雙圖表 (K線+情緒)   |
| **TODO-005** | K 線圖縮放/平移          | ✅ 已完成 | Phase 6.9 — 日/週/月/季/年+時間範圍 |
| **TODO-006** | 論點彙整 UI              | ✅ 已完成 | Phase 8.15 — Stock Arguments Tab + i18n |
| **TODO-007** | 論點時間分布圖表         | 🔄 90%  | Phase 8.16 — argument-timeline 元件+API 完成，StockArgumentsTab 待整合至 Stock 詳情頁 (Agent 3) |
| **TODO-008** | 效能優化                 | 🔄 80%  | Phase 10.5 — 動態載入+Bundle Analyzer 完成；React Query staleTime 部分 hooks 待補 (Agent 4) |
| **TODO-009** | Vercel 部署              | ✅ 已完成 | Phase 10.6 — vercel.json + .env.example + /api/health + 安全標頭 (Agent 4) |
| **TODO-010** | Google OAuth             | ✅ 已完成 | Phase 11.1-11.4 — Google 一鍵登入 (Session A) |
| **TODO-011** | Email 驗證 + 密碼重設    | ✅ 已完成 | Phase 11.5-11.7 — Auth 強化 (Session C) |
| **TODO-012** | YouTube Extractor        | ✅ 已完成 | Phase 12.1-12.3 — YouTubeExtractor + transcript + Factory 註冊 (Agent 1) |
| **TODO-013** | 批量匯入管線 + API       | ✅ 已完成 | Phase 12.4-12.6 — import-pipeline.service + /api/import/batch + 配額豁免 (Agent 1) |
| **TODO-014** | 匯入 UI                  | ✅ 已完成 | Phase 12.7-12.9 — /import 頁面 + import-form + loading-overlay + result (Agent 1) |
| **TODO-015** | 用戶引導流程             | ✅ 已完成 | Phase 13.1-13.7 — 3 步驟 Onboarding + Empty States 6 頁面 + onboarding-guard (Agent 2) |
| **TODO-016** | 發布免責聲明             | ✅ 已完成 | Phase 4.16 — 3 點免責聲明 checkbox + 按鈕禁用邏輯 + i18n (Agent 3) |

### Release 01

- [ ] URL 自動匯入 (Twitter/X only — 使用免費 oEmbed API，無需 API Key)
- [ ] RWD 響應式設計
- [x] 書籤管理功能 ✅ (2026-02-12, 提前至 MVP 完成)
- [ ] AI 文章摘要
- [ ] 編輯建議系統
- [ ] **AI 分析快取層 (Phase 15)**
  - `ai_analysis_cache` 表：以 URL hash 為 key 快取 AI 分析結果 (sentiment, tickers, arguments)
  - `model_version` 欄位標記產出模型版本 (e.g., `gemini-2.0-flash`)，模型升級時自動使舊快取失效
  - Cache hit 時跳過 AI 呼叫，直接套用快取結果至新用戶的 post
  - 用戶通知機制：模型升級時提示「AI 模型已更新，是否重新分析您的文章？」
  - 保持用戶資料完全隔離 — 僅共享 AI 運算結果，不共享 post/KOL 記錄
- [ ] **社群洞察 (匿名聚合統計) (Phase 16)**
  - 匿名聚合查詢：「N 位用戶追蹤此 KOL」、「本週熱門個股 Top 10」、「最多人追蹤的 KOL」
  - 原則：**分享計數與趨勢，絕不暴露個人資料**
  - Dashboard 趨勢卡片 + KOL 詳情頁社群熱度標示
  - 不需更動 RLS — 使用 admin client 執行跨用戶 COUNT/GROUP BY 聚合查詢

### Release 02

- [ ] URL 自動匯入 - Facebook & Threads (需申請 Meta Developer App，使用 oEmbed API + App Access Token)
  - Extractor stub 已存在：`infrastructure/extractors/facebook.extractor.ts`、`threads.extractor.ts`
  - 需完成 HTML/JSON-LD 解析實作
- [x] ~~YouTube 影片逐字稿擷取~~ → **已提前至 MVP Phase 12a**
- [ ] 多市場支援 (台股、港股、加密貨幣)
- [ ] Dark Mode
- [ ] 付費機制設計 (Phase 14 — Stripe 整合、訂閱管理、定價頁面)
- [ ] 文章熱度統計
- [ ] **KOL 平台化 (雙層用戶模型)** — 長期願景
  - 將用戶分為「一般用戶」與「KOL (受邀)」兩種角色
  - 一般用戶：自行上傳的文章僅自己可見 (私有筆記)
  - KOL：受邀入駐，透過 OAuth 授權連接社群帳號，文章公開給所有用戶
  - 需要：`posts.visibility` 欄位 (public/private)、RLS 調整、KOL OAuth 工具 (Twitter API v2, YouTube Data API, Facebook Graph API)
  - 解決：內容版權合法性 (KOL 自行授權) + 付費牆內容風險
  - 前置條件：先驗證 MVP 市場需求，確認有足夠用戶基礎後再投入

---

## 七、修改記錄

| 版本 | 日期       | 修改內容                                                                                                                             |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0  | 2026-02-01 | 初始版本 - MVP 開發計畫                                                                                                              |
| 1.1  | 2026-02-01 | 調整開發順序：認證系統移至最後；擴充 Phase 8 AI 模組加入論點提取與彙整功能                                                           |
| 1.2  | 2026-02-13 | URL 自動匯入調整：Release 01 僅支援 Twitter/X (免費 oEmbed)；Facebook & Threads 移至 Release 02 (需 Meta Developer App + oEmbed API) |
| 1.3  | 2026-02-18 | Release 02 新增 YouTube 影片逐字稿擷取功能；補充 Facebook/Threads extractor stub 說明                                                |
| 1.4  | 2026-02-19 | 全面更新各 Phase 完成狀態；新增「零、開發進度總覽」章節；標記所有任務的 ✅/🔄/⏳ 狀態；整理 MVP 待辦清單 (TODO-002~009)             |
| 1.5  | 2026-02-22 | 新增商業功能階段：Phase 11 (Google OAuth & Auth 強化)、Phase 12 (KOL 匯入工具 — Twitter/X + YouTube)、Phase 13 (用戶引導流程)；新增 TODO-010~015；更新里程碑 M7-M8 |
| 1.5a | 2026-02-22 | 細化 Phase 12：拆分為 12a (個別 URL 匯入, MVP) 與 12b (Profile 自動發現, Release 01)；新增配額豁免策略 (首次 onboarding 匯入免配額)；更新 UI mockup 為多 URL 輸入 |
| 1.5b | 2026-02-22 | 新增 Phase 4.16 發布免責聲明 (TODO-016)；YouTube 逐字稿從 Release 02 提前至 MVP Phase 12a；Release 02 新增「KOL 平台化 (雙層用戶模型)」長期願景 |
| 1.5c | 2026-02-22 | Release 01 新增 Phase 15 (AI 分析快取層 — URL hash + model_version 失效策略) 與 Phase 16 (社群洞察 — 匿名聚合統計) |
| 1.6  | 2026-02-22 | Phase 12a ✅ 完成 (Agent 1: YouTube Extractor + 批量匯入管線 + 匯入 UI + 配額豁免 + use-import hook)；Phase 13 ✅ 完成 (Agent 2: 3 步驟 Onboarding + Empty States 6 頁面 + onboarding-guard + Sidebar "New" 徽章)；TODO-012~015 全部完成；M8 ✅；MVP 完成度提升至 ~96% |
| 1.7  | 2026-02-22 | Phase 4.16 ✅ (免責聲明 checkbox + i18n)；Phase 8.16 🔄 90% (argument-timeline 元件+API 完成，Stock 頁面整合待做)；Phase 10.5 🔄 80% (動態載入+Bundle Analyzer 完成，React Query staleTime 待補)；Phase 10.6 ✅ (vercel.json + .env.example + /api/health + 安全標頭)；TODO-009/016 完成；MVP ~98% |

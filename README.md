# Baburra.io

投資觀點追蹤平台 — 回測工具，幫助散戶投資人評估哪些 KOL（關鍵意見領袖）的投資觀點值得信賴且有獲利能力。使用者可追蹤投資觀點、記錄帶情緒標記的預測，並透過 K 線圖與勝率計算來衡量準確度。

A backtesting tool for retail investors to evaluate which KOLs' investment opinions are trustworthy and profitable. Track investment ideas, record predictions with sentiment, and measure accuracy over time via candlestick charts and win rate calculations.

## 功能特色

- **KOL 管理** — 搜尋、建立、追蹤投資 KOL，並可訂閱 KOL 的內容來源
- **投資標的追蹤** — 管理股票/標的資訊，支援 per-stock 情緒記錄
- **Discover** — 探索 KOL、觀點與熱門標的
- **快速輸入** — AI 輔助的快速文章輸入，自動識別股票代碼、情緒與論點
- **內容擷取（Scrape Jobs）** — 背景抓取社群貼文與 YouTube 影片逐字稿（Apify、Deepgram、youtube-transcript）
- **批次匯入（Import）** — 一次性匯入既有貼文與來源
- **訂閱機制** — KOL Sources 與訂閱（`kol_sources`、`kol_subscriptions`）
- **草稿管理** — 草稿儲存、編輯、發布流程
- **K 線圖** — 整合 Lightweight Charts 顯示股價走勢與情緒時間線
- **勝率與統計** — 自動計算 KOL 的預測勝率（5/30/90/365 日）及 KOL/Stock 統計視圖
- **AI 分析** — 整合 Gemini API 進行情緒分析、論點提取與股票代碼識別
- **AI 額度與 Credit System** — 原子化的 AI quota 與點數扣抵 / 退款
- **A/B 實驗** — 內建 experiments 表支援 A/B 測試
- **書籤收藏** — 收藏重要文章以便快速存取
- **國際化** — 支援繁體中文（預設）與英文
- **認證系統** — Supabase Auth 實現用戶登入/註冊

## 技術架構

| 層級     | 技術選型                                                         |
| -------- | ---------------------------------------------------------------- |
| 前端框架 | Next.js 16.1 (App Router) + React 19.2                           |
| UI 套件  | Tailwind CSS 4 + shadcn/ui (Radix)                               |
| 狀態管理 | TanStack Query 5 + Zustand 5                                     |
| 後端     | Next.js API Routes                                               |
| 資料庫   | Supabase (PostgreSQL) via `@supabase/ssr`                        |
| 認證     | Supabase Auth                                                    |
| AI 服務  | Google Gemini API                                                |
| 股價資料 | Tiingo API                                                       |
| 內容擷取 | Apify Client、youtube-transcript-plus、fast-xml-parser、Deepgram |
| K 線圖   | Lightweight Charts 5                                             |
| 國際化   | next-intl                                                        |
| 表單     | React Hook Form + Zod                                            |
| 測試     | Vitest 4 (happy-dom) + Playwright 1.58                           |

## 開始使用

### 環境需求

- Node.js 20+
- npm
- Supabase 專案

### 安裝

```bash
npm install
cp .env.example .env.local
# 編輯 .env.local 填入必要的環境變數
```

### 環境變數

完整清單請見 [`.env.example`](.env.example)。最低需要：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Supabase CLI（migration / type generation 用）
SUPABASE_ACCESS_TOKEN=...
SUPABASE_DB_PASSWORD=...

# 外部 API
GEMINI_API_KEY=...
TIINGO_API_TOKEN=...
DEEPGRAM_API_KEY=...      # 長影片語音轉文字（可選）

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 開發（可選）— 設定後可繞過登入
DEV_USER_ID=...
```

### 開發

```bash
npm run dev          # 開發伺服器（會先執行 scripts/clean-dev.mjs）
npm run type-check   # TypeScript 檢查
npm run lint         # ESLint
npm run format       # Prettier
```

### 測試

```bash
npm test             # Vitest 單元測試
npm run test:watch
npm run test:coverage
npm run test:e2e     # Playwright
npm run test:e2e:ui
```

### 建置

```bash
npm run build
npm start
```

## 專案結構

```
src/
├── app/
│   ├── (app)/             # 應用程式頁面（需要認證）
│   │   ├── bookmarks/
│   │   ├── dashboard/
│   │   ├── discover/      # KOL / 觀點探索
│   │   ├── drafts/
│   │   ├── import/        # 批次匯入
│   │   ├── input/         # 快速輸入（AI 輔助）
│   │   ├── kols/
│   │   ├── posts/
│   │   ├── scrape/        # 內容擷取與 scrape jobs
│   │   ├── settings/
│   │   ├── stocks/
│   │   └── subscriptions/ # KOL 訂閱
│   ├── api/               # API Routes
│   ├── login/
│   └── register/
├── components/            # React 元件（ai, charts, forms, layout, providers, ui）
├── domain/                # 領域層
│   ├── calculators/       # 勝率、漲跌幅等純函式
│   ├── models/            # 領域模型
│   └── services/          # AI 情緒分析等服務
├── hooks/                 # TanStack Query hooks
├── infrastructure/
│   ├── api/               # Gemini、Tiingo、Apify 等外部 API client
│   ├── extractors/        # 社群平台內容擷取器
│   ├── repositories/      # 資料存取層（snake_case ↔ camelCase）
│   └── supabase/          # browser / server / admin clients + database.types.ts
├── lib/                   # 工具函式與常數（含 ROUTES）
├── messages/              # 國際化翻譯（zh-TW, en）
└── stores/                # Zustand stores
```

## 資料庫設定

完整的 schema 與遷移檔位於 [`supabase/migrations/`](supabase/migrations)。目前包含 40+ 個遷移，涵蓋初始 schema、RLS、論點系統、AI quota / credit 系統、KOL sources 與訂閱、scrape jobs、A/B 實驗、KOL/Stock 統計視圖等。**living schema 文件**請見 [`openspec/specs/data-models.md`](openspec/specs/data-models.md)。

### Seed Data

- **`supabase/seed.sql`** — 完整測試資料（KOL、股票、文章、論點類別）。
- **`supabase/seed-minimal.sql`** — 僅論點類別，供「手動測試、空狀態」使用。詳細步驟見 [手動測試環境設定](docs/MANUAL_TESTING_SETUP.md)。

### Supabase CLI 常用指令

```bash
supabase migration list -p "$SUPABASE_DB_PASSWORD"
supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"
supabase db push          -p "$SUPABASE_DB_PASSWORD"
supabase gen types typescript --linked --schema public \
  > src/infrastructure/supabase/database.types.ts
```

## 開發流程

本專案使用 **OpenSpec** 進行規格驅動開發。所有非瑣碎變更（新功能、重大重構、跨多檔案的修復）都應走 OpenSpec 流程：

1. `/opsx:propose <change-name>` — 建立 proposal、design 與 task checklist
2. `/opsx:apply <change-name>` — 依 task checklist 實作
3. `/opsx:archive <change-name>` — 完成後封存

完整的貢獻規範、分支流程、Supabase CLI 安全層級等請見 [`CLAUDE.md`](CLAUDE.md)。

## 部署

### Vercel（推薦）

1. 連接 GitHub 倉庫到 Vercel
2. 設定環境變數
3. 自動部署

### 其他平台

支援任何支援 Node.js 的平台，確保設定正確的環境變數即可。

## 文件

- [開發計畫](docs/WEB_DEV_PLAN.md)
- [架構設計](docs/ARCHITECTURE.md)
- [API 規格](docs/API_SPEC.md)
- [領域模型](docs/DOMAIN_MODELS.md)
- [分析框架](docs/ANALYSIS_FRAMEWORK.md)
- [Invariants](docs/INVARIANTS.md)
- [協作指南](docs/COLLABORATION_GUIDE.md)
- [手動測試計畫](docs/MANUAL_TESTING_PLAN.md)
- [手動測試環境設定](docs/MANUAL_TESTING_SETUP.md)
- [待辦事項](docs/BACKLOG.md)
- Living specs：[`openspec/specs/`](openspec/specs)

## 授權

MIT License

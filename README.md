# Stock KOL Tracker Web

社群共享的投資觀點追蹤平台，讓用戶能夠快速記錄 KOL 的投資觀點文章、追蹤歷史觀點、計算預測勝率並透過 K 線圖對照觀點與實際走勢。

## 功能特色

- **KOL 管理** - 搜尋、建立、追蹤投資 KOL
- **投資標的追蹤** - 管理股票/標的資訊
- **文章記錄** - 快速輸入、草稿管理、發布流程
- **K 線圖** - 整合 Lightweight Charts 顯示股價走勢
- **勝率計算** - 自動計算 KOL 的預測勝率（5/30/90/365 日）
- **AI 分析** - 整合 Gemini API 進行情緒分析和論點提取
- **認證系統** - Supabase Auth 實現用戶登入/註冊

## 技術架構

| 層級     | 技術選型                 |
| -------- | ------------------------ |
| 前端框架 | Next.js 14 (App Router)  |
| UI 套件  | Tailwind CSS + shadcn/ui |
| 狀態管理 | TanStack Query + Zustand |
| 後端     | Next.js API Routes       |
| 資料庫   | Supabase (PostgreSQL)    |
| 認證     | Supabase Auth            |
| AI 服務  | Google Gemini API        |
| 股價資料 | Tiingo API               |
| K 線圖   | Lightweight Charts       |

## 開始使用

### 環境需求

- Node.js 20+
- npm 或 yarn
- Supabase 專案

### 安裝

```bash
# 安裝依賴
npm install

# 複製環境變數範本
cp .env.example .env.local

# 編輯 .env.local 填入必要的環境變數
```

### 環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# External APIs
GEMINI_API_KEY=your_gemini_api_key
TIINGO_API_TOKEN=your_tiingo_api_token

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Development (可選)
DEV_USER_ID=test_user_id
```

### 開發

```bash
# 啟動開發伺服器
npm run dev

# 類型檢查
npm run type-check

# ESLint 檢查
npm run lint

# 格式化程式碼
npm run format
```

### 測試

```bash
# 執行單元測試
npm test

# 監聽模式
npm run test:watch

# 測試覆蓋率
npm run test:coverage

# E2E 測試
npm run test:e2e

# E2E 測試 (互動式 UI)
npm run test:e2e:ui
```

### 建置

```bash
# 生產環境建置
npm run build

# 啟動生產伺服器
npm start
```

## 專案結構

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/             # 應用程式頁面 (需要認證)
│   │   ├── dashboard/
│   │   ├── drafts/
│   │   ├── input/
│   │   ├── kols/
│   │   ├── posts/
│   │   ├── settings/
│   │   └── stocks/
│   ├── api/               # API Routes
│   ├── login/             # 登入頁面
│   └── register/          # 註冊頁面
├── components/            # React 元件
│   ├── ai/               # AI 相關元件
│   ├── charts/           # 圖表元件
│   ├── forms/            # 表單元件
│   ├── layout/           # 版面元件
│   ├── providers/        # Context Providers
│   └── ui/               # UI 元件 (shadcn/ui)
├── domain/               # 領域層
│   ├── calculators/      # 計算器 (勝率、漲跌幅等)
│   ├── models/           # 領域模型
│   └── services/         # 領域服務
├── hooks/                # React Hooks
├── infrastructure/       # 基礎設施層
│   ├── api/             # 外部 API 客戶端
│   ├── repositories/    # 資料存取
│   └── supabase/        # Supabase 客戶端
├── lib/                  # 工具函式
└── stores/              # Zustand Stores
```

## 資料庫設定

### Migration

資料庫 schema 位於 `supabase/migrations/` 目錄：

- `001_initial_schema.sql` - 初始資料表和 RLS 政策
- `002_enable_rls.sql` - 啟用 RLS 政策

### Seed Data

- **`supabase/seed.sql`**：完整測試資料（KOL、股票、文章、論點類別）。執行 `supabase db reset` 時會自動套用。
- **`supabase/seed-minimal.sql`**：僅論點類別，無 KOL/文章等假資料，供「手動測試、空狀態」使用。  
  → 詳細步驟見 [手動測試環境設定（無預建假資料）](docs/MANUAL_TESTING_SETUP.md)。

## 部署

### Vercel (推薦)

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
- [手動測試環境設定（無預建假資料）](docs/MANUAL_TESTING_SETUP.md)

## 授權

MIT License

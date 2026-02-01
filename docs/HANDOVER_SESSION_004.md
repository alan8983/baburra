# Session 交接文件 - Session 004

> **建立時間**: 2026-02-01  
> **Session 004 目的**: 圖片上傳功能 + Stock 詳情頁 Stats Tab  
> **前置文件**: `HANDOVER_SESSION_003.md`、`WEB_DEV_PLAN.md`

---

## 一、Session 004 完成事項

### 1. 圖片上傳功能 ✅

| 項目 | 狀態 | 產出檔案 |
|------|------|----------|
| Upload API | ✅ 完成 | `src/app/api/upload/route.ts` |
| useUploadImage Hook | ✅ 完成 | `src/hooks/use-upload.ts` |
| ImageUploader 元件 | ✅ 完成 | `src/components/forms/image-uploader.tsx` |
| 草稿編輯頁整合 | ✅ 完成 | 更新 `src/app/(app)/drafts/[id]/page.tsx` |
| Hooks 匯出 | ✅ 完成 | 更新 `src/hooks/index.ts` |
| Forms 匯出 | ✅ 完成 | 更新 `src/components/forms/index.ts` |
| API Routes 常數 | ✅ 完成 | 更新 `src/lib/constants/routes.ts` |

#### 圖片上傳功能說明

- **儲存位置**: Supabase Storage `images` bucket
- **檔案命名**: `{userId}/{timestamp}-{randomId}.{ext}`
- **限制**:
  - 檔案大小: 最大 5MB
  - 支援格式: JPEG, PNG, GIF, WebP
  - 每篇草稿最多 10 張圖片
- **API 端點**:
  - `POST /api/upload` - 上傳圖片
  - `DELETE /api/upload?path=xxx` - 刪除圖片

### 2. Stock 詳情頁 Stats Tab ✅

| 項目 | 狀態 | 修改內容 |
|------|------|----------|
| Stats Tab | ✅ 完成 | 新增獨立的 Stats Tab，顯示完整勝率統計 |
| 整合 useStockWinRate | ✅ 完成 | 使用已建立的 hook 取得真實勝率資料 |
| Tab 順序調整 | ✅ 完成 | Posts → Stats → Chart → Arguments |

#### Stats Tab 顯示內容

- 整體平均勝率（所有期間平均）
- 各期間勝率（5日、30日、90日、365日）
- 勝敗統計（勝/敗次數）
- 有效樣本數
- 勝率計算說明

---

## 二、目前專案結構（截至交接時）

```
investment-idea-monitor/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/
│   │   │   │   └── route.ts                    # ✅ Session 004 新增
│   │   │   ├── kols/
│   │   │   ├── stocks/
│   │   │   ├── drafts/
│   │   │   └── posts/
│   │   └── (app)/
│   │       ├── dashboard/
│   │       ├── input/
│   │       ├── drafts/
│   │       │   └── [id]/page.tsx               # ✅ Session 004 修改（圖片上傳整合）
│   │       ├── kols/
│   │       ├── stocks/
│   │       │   └── [ticker]/page.tsx           # ✅ Session 004 修改（Stats Tab）
│   │       ├── posts/
│   │       └── settings/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── providers/
│   │   ├── forms/
│   │   │   ├── image-uploader.tsx              # ✅ Session 004 新增
│   │   │   ├── kol-selector.tsx
│   │   │   ├── kol-form-dialog.tsx
│   │   │   ├── stock-selector.tsx
│   │   │   ├── stock-form-dialog.tsx
│   │   │   ├── sentiment-selector.tsx
│   │   │   ├── datetime-input.tsx
│   │   │   └── index.ts                        # ✅ Session 004 修改
│   │   └── charts/
│   │
│   ├── domain/
│   │   ├── models/
│   │   └── calculators/
│   │
│   ├── infrastructure/
│   │   ├── supabase/
│   │   ├── api/
│   │   └── repositories/
│   │
│   ├── hooks/
│   │   ├── use-kols.ts
│   │   ├── use-stocks.ts
│   │   ├── use-posts.ts
│   │   ├── use-drafts.ts
│   │   ├── use-stock-prices.ts
│   │   ├── use-upload.ts                       # ✅ Session 004 新增
│   │   └── index.ts                            # ✅ Session 004 修改
│   │
│   └── lib/
│       └── constants/
│           └── routes.ts                       # ✅ Session 004 修改（新增 UPLOAD）
│
├── docs/
│   ├── HANDOVER_SESSION_001.md
│   ├── HANDOVER_SESSION_002.md
│   ├── HANDOVER_SESSION_003.md
│   ├── HANDOVER_SESSION_004.md                 # 本文件
│   ├── WEB_DEV_PLAN.md
│   └── ARCHITECTURE.md
│
└── package.json
```

---

## 三、新增檔案說明

### `/api/upload/route.ts`

圖片上傳 API，支援：
- `POST`: 上傳圖片到 Supabase Storage
- `DELETE`: 刪除指定路徑的圖片

### `use-upload.ts`

提供兩個 hooks：
- `useUploadImage()`: 單張圖片上傳
- `useUploadImages()`: 批量圖片上傳

### `image-uploader.tsx`

圖片上傳元件，功能：
- 點擊上傳（支援多選）
- 圖片預覽
- 移除圖片
- 上傳進度顯示
- 錯誤處理

---

## 四、Supabase Storage 設定需求

> ⚠️ **重要**: 需要在 Supabase 後台建立 Storage bucket

1. 前往 Supabase Dashboard → Storage
2. 建立新 bucket: `images`
3. 設定為 Public bucket（允許公開讀取）
4. 設定 RLS 政策（可選，開發期間可暫時關閉）

---

## 五、下一個 Agent 優先任務

以下依 `docs/WEB_DEV_PLAN.md` 與目前狀態整理，供接手 Agent 依優先順序執行。

### 1. 預覽確認頁完整實作（中優先）

- 頁面路徑: `/posts/new`
- 功能:
  - 從草稿載入資料預覽
  - 重複 URL 檢測與警告
  - 情緒選擇（含 AI 建議）
  - 確認發布文章

### 2. Phase 8：AI 整合（低優先）

依 `WEB_DEV_PLAN.md` Phase 8：

- 建立 Gemini Client (`infrastructure/api/gemini.client.ts`)
- 情緒分析 API (`/api/ai/analyze`)
- 論點提取 API (`/api/ai/extract-arguments`)
- 配額檢查與 UI 顯示
- 需要 Gemini API Key

### 3. 其他待辦

- 補齊錯誤處理、toast 通知
- E2E/單元測試（Phase 10）
- 認證系統（Phase 1）

---

## 六、已知問題 / 待解決事項

| # | 問題描述 | 優先度 | 狀態 |
|---|----------|--------|------|
| 1 | 預覽確認頁 (`/posts/new`) 尚未完整實作 | 中 | ⏳ 待實作 |
| 2 | Phase 8 AI 整合 | 低 | ⏳ 需 Gemini API Key |
| 3 | 認證系統 (Phase 1) 尚未實作 | 低 | ⏳ 最後實作 |
| 4 | Supabase Storage bucket 需手動建立 | 高 | ⚠️ 需操作 |

---

## 七、給下一個 Agent 的建議

1. **先讀本文件與 `WEB_DEV_PLAN.md`**：掌握目前完成範圍與接下來任務
2. **Supabase Storage**：確認已建立 `images` bucket，否則圖片上傳會失敗
3. **預覽確認頁**：可參考 `drafts/[id]/page.tsx` 的表單實作方式
4. **環境變數**：若需 AI 功能，請確認 `.env.local` 有正確的 Gemini API Key

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

| 頁面 | URL | 說明 |
|------|-----|------|
| Dashboard | `/dashboard` | 總覽 |
| 快速輸入 | `/input` | ✅ 已接 API |
| 草稿列表 | `/drafts` | ✅ 已接 API |
| 草稿編輯 | `/drafts/[id]` | ✅ 圖片上傳功能（Session 004） |
| KOL 列表 | `/kols` | KOL 列表 |
| KOL 詳情 | `/kols/[id]` | ✅ Stats Tab 顯示勝率 |
| 標的列表 | `/stocks` | 標的列表（含 Chart Tab） |
| 標的詳情 | `/stocks/[ticker]` | ✅ Stats Tab 顯示勝率（Session 004） |
| 文章列表 | `/posts` | 文章列表（含 Chart Tab） |

---

**Session 004 交接完成，可交由下一個 Agent 接手。** ✅

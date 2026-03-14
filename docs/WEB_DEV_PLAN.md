# Baburra.io Web - 開發計畫

> **版本**: v0.2.0-dev
> **建立日期**: 2026-02-01
> **最後更新**: 2026-03-14
> **目標**: 產品開發計畫 (高層級路線圖)

> **注意**: 本文件為精簡版路線圖。詳細的資料模型、API 端點、UI 設計等技術規格已移至 `openspec/specs/`。
> 每個功能的實作細節由 OpenSpec changes 管理 (`openspec/changes/<change-name>/`)。

---

## 零、開發進度總覽

> **最後更新**: 2026-03-14

#### v0.1.0 (MVP) — 全部完成

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
| Phase 8 | AI 整合 | ✅ 完成 | 情緒/論點提取/論點彙整/時間分布圖全部完成 (2026-02-22) |
| Phase 9 | App Layout | ✅ 完成 | 2026-02-10 |
| Phase 10 | 測試與優化 | ✅ 完成 | 測試框架+動態載入+Vercel 部署+安全標頭+React Query staleTime 全部完成 (2026-02-22) |
| Phase 11 | Google OAuth & Auth 強化 | ✅ 完成 | Google OAuth + 密碼重設 + Email 驗證設定 (2026-02-22) |
| Phase 12 | KOL 匯入工具 | ✅ 完成 | YouTube Extractor + 批量匯入管線 + 匯入 UI + 配額豁免 (2026-02-22) |
| Phase 13 | 用戶引導流程 | ✅ 完成 | 3 步驟 Onboarding + Empty States (6 頁面) + 首次登入偵測 (2026-02-22) |

#### v0.2.0 — 開發中

| 階段 | 名稱 | 狀態 | 備註 |
| --- | --- | --- | --- |
| Phase 12b | KOL Profile 爬取 + 訂閱監控 | ✅ 完成 | YouTube Channel 爬取 + 訂閱系統 + Cron 背景處理 (2026-03-08) |
| Phase 12b-UX | 擷取流程圖 + 佇列系統 | ✅ 完成 | 5 步驟工作流程 + 佇列位置 + 通知鈴 (2026-03-13) |
| Phase 15-lite | AI 模型版本追蹤 + 重新分析 | 🔄 進行中 | Migration 完成，API/UI 補完中 |
| Phase 8-QA | AI 論點分析品質提升 | ✅ 完成 | 結構化輸出 + 事實/觀點分類 + 提示詞工程 + 多輪驗證 (2026-03-13) |
| Phase 16 | 社群洞察 (匿名聚合統計) | 🔄 進行中 | 趨勢標的 + 熱門 KOL + 追蹤人數 |
| Phase 17 | 行銷首頁 | ✅ 完成 | Hero + 功能介紹 + 定價表 + FAQ (2026-03-08) |

**v0.1.0 完成度: 100%** (Phase 0-13 全部完成，TODO-001~017 全部 ✅)
**v0.2.0 完成度: ~75%** (Phase 12b + 17 + 8-QA 已完成，Phase 15-lite + 16 進行中)

### 額外已完成功能（計畫外）

| 功能 | 完成日期 | 說明 |
| --- | --- | --- |
| 國際化 (i18n) | 2026-02-10 | next-intl，支援 zh-TW + en |
| Dashboard 統計 | 2026-02-10 | 儀表板 API + 頁面 |
| URL 擷取框架 | 2026-02-05 | ExtractorFactory + Twitter/FB/Threads stubs |
| Profile 時區 | 2026-02-19 | 用戶時區設定 |
| 情緒折線圖 | 2026-02-18 | sentiment-line-chart 元件 |
| 色盤偏好設定 | 2026-02-23 | Asian/American + settings 頁面 + ColorPaletteProvider |
| KOL 歸屬論點 | 2026-02-23 | Stock Arguments Tab 顯示 KOL 頭像與名稱 |
| 論點 per-user 隔離 | 2026-02-23 | real-time 計算 + RLS 收緊 |
| AI 論點擷取上限調整 | 2026-02-23 | 每篇文章最多 5 則論點 |
| A/B 測試框架 | 2026-03-01 | ab-test.ts + middleware 50/50 分流 |
| Welcome 頁面 (Variant B) | 2026-03-01 | /welcome 2 步驟預註冊體驗 |
| 統一錯誤處理 | 2026-03-01 | ApiError class + parse-error.ts |
| 驗證模組擴充 | 2026-03-01 | validation.ts 統一 Zod schemas |
| DB 原子操作 | 2026-03-01 | create_post_atomic() + refund_ai_quota() |
| KOL/Stock 統計 View | 2026-03-01 | materialized views (migration 016) |
| 三角標記圖表元件 | 2026-03-01 | triangle-markers-primitive.ts |
| PriceChangeBadge 元件 | 2026-03-01 | 可複用漲跌幅 badge |
| 已讀追蹤 Hook | 2026-03-01 | use-seen-posts.ts |
| Hook 測試套件 | 2026-03-01 | 5 hooks + 1 repository 單元測試 |
| 論點 UI 暫時停用 | 2026-03-01 | ArgumentPlaceholder 替換，待重新啟用 |
| OpenSpec (SDD 框架) | 2026-03-13 | 規格驅動開發框架 |
| YouTube 日期修正 | 2026-03-14 | YouTube Data API v3 取得原始發布日期 |

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
2026-02-22  ████       Phase 8.16 (argument-timeline) + Phase 4.16 (免責聲明)
2026-02-22  ██████     Phase 10.5-10.6 (動態載入 + Vercel 部署 + 安全標頭)
2026-02-23  ████       色盤偏好 + KOL 歸屬論點 + 論點隔離 + AI 上限調整
2026-03-01  ██████████ A/B 測試 + Welcome 頁面 + 錯誤處理 + DB 原子操作
2026-03-08  ████████   Phase 12b (KOL Profile 爬取 + 訂閱監控)
2026-03-13  ██████     Phase 12b-UX + Phase 8-QA (AI 論點品質提升)
```

---

## 一、專案概要

### 1.1 產品定位

Baburra.io Web 是一個**社群共享**的投資觀點追蹤平台，讓用戶能夠：

- 快速記錄/匯入 KOL 的投資觀點文章
- 追蹤 KOL 對特定標的的歷史觀點
- 計算 KOL 的預測勝率
- 透過 K 線圖對照觀點與實際走勢

### 1.2 版本規劃總覽

| 版本           | 核心目標     | 關鍵功能                                                                                |
| -------------- | ------------ | --------------------------------------------------------------------------------------- |
| **v0.1.0**     | 核心功能驗證 | 手動輸入、基本檢視、勝率計算、K線圖                                                     |
| **v0.2.0**     | 體驗優化     | KOL Profile 爬取+訂閱、行銷首頁、AI 模型版本追蹤、社群洞察                              |
| **v1.0.0**     | 功能擴展     | URL 自動匯入(FB/Threads)、多市場支援、Dark Mode、付費機制、熱度統計                     |

### 1.3 技術架構

| 層級     | 技術選型                    |
| -------- | --------------------------- |
| 前端框架 | Next.js 16 (App Router)     |
| UI 套件  | Tailwind CSS 4 + shadcn/ui  |
| 狀態管理 | TanStack Query + Zustand    |
| 後端     | Next.js API Routes          |
| 資料庫   | Supabase (PostgreSQL)       |
| 認證     | Supabase Auth               |
| AI 服務  | Google Gemini API            |
| 股價資料 | Tiingo API                   |
| K線圖    | Lightweight Charts           |
| 部署     | Vercel                       |

> 詳細架構圖、資料模型、API 端點等技術規格見 `openspec/specs/` 及 `docs/ARCHITECTURE.md`。

---

## 二、版本功能規劃

### v0.2.0 — 體驗優化 (開發中)

| 功能 | 狀態 | 說明 |
| --- | --- | --- |
| KOL Profile 爬取 (Phase 12b) | ✅ | YouTube Channel 爬取 + 訂閱 + Cron 背景處理 |
| 擷取流程圖 + 佇列 (Phase 12b-UX) | ✅ | 5 步驟工作流程 + 佇列位置 + 通知鈴 |
| AI 論點品質提升 (Phase 8-QA) | ✅ | 結構化輸出 + 事實/觀點分類 + 多輪驗證 |
| 行銷首頁 (Phase 17) | ✅ | Hero + 功能介紹 + 定價表 + FAQ |
| AI 模型版本追蹤 (Phase 15-lite) | 🔄 | posts.ai_model_version + 重新分析按鈕 |
| 社群洞察 (Phase 16) | 🔄 | 匿名聚合統計 (趨勢標的、熱門 KOL、追蹤人數) |

### v1.0.0 — 功能擴展 (規劃中)

- URL 自動匯入 — Facebook & Threads (Meta Developer App + oEmbed API)
- 多市場支援 (台股、港股、加密貨幣)
- Dark Mode
- 付費機制 (Phase 14 — Stripe 整合)
- 文章熱度統計
- AI 文章摘要
- 編輯建議系統
- KOL 平台化 (雙層用戶模型) — 長期願景

---

## 三、里程碑

| 里程碑 | 完成階段    | 可驗收功能                   | 狀態 |
| ------ | ----------- | ---------------------------- | ---- |
| **M1** | Phase 0, 9  | App 框架、基本導航           | ✅ 2026-02-01 |
| **M2** | Phase 2-3   | 可搜尋/新增 KOL 和標的       | ✅ 2026-02-01 |
| **M3** | Phase 4-5   | 完整輸入流程、可檢視文章     | ✅ 2026-02-18 |
| **M4** | Phase 6-7   | K 線圖顯示、勝率計算         | ✅ 2026-02-18 |
| **M5** | Phase 8     | AI 情緒分析、論點提取與彙整  | ✅ 2026-02-22 |
| **M6** | Phase 10, 1 | 測試優化、認證系統、完整 MVP | ✅ 2026-02-22 |
| **M7** | Phase 11    | Google OAuth、Email 驗證     | ✅ 2026-02-22 |
| **M8** | Phase 12-13 | KOL 匯入工具 + 用戶引導流程  | ✅ 2026-02-22 |

---

## 四、OpenSpec 工作流整合

> **2026-03-14 起**，所有非瑣碎變更透過 OpenSpec 管理。

### 角色分工

| 文件 | 用途 | 更新時機 |
| --- | --- | --- |
| `docs/WEB_DEV_PLAN.md` (本文件) | 高層級路線圖 + Phase 狀態 | Phase 完成或狀態改變時 |
| `docs/BACKLOG.md` | 產品級 User Story 追蹤 | User Story 完成時打勾 |
| `openspec/specs/` | 共享技術規格 (資料模型、API、架構) | 規格異動時 |
| `openspec/changes/<name>/` | 單一變更的 proposal + design + tasks | 功能開發期間 |
| `openspec/changes/archive/` | 已完成變更的歸檔 | 變更完成後 |

### 已歸檔的 OpenSpec 變更

| 變更名稱 | 完成日期 | 說明 |
| --- | --- | --- |
| `improve-argument-analysis` | 2026-03-13 | Phase 8-QA: 結構化輸出 + 事實/觀點分類 + 多輪驗證 |
| `scrape-flowchart-queue` | 2026-03-13 | Phase 12b-UX: 5 步驟流程圖 + 佇列 + 通知鈴 |

### 進行中的 OpenSpec 變更

_無_

---

## 五、修改記錄

| 版本 | 日期 | 修改內容 |
| ---- | ---- | ---- |
| 1.0 | 2026-02-01 | 初始版本 - MVP 開發計畫 |
| 1.1–2.3 | 2026-02-01 ~ 2026-03-01 | MVP 開發迭代 (Phase 0-13 完成) |
| 3.0–3.2 | 2026-03-07 ~ 2026-03-08 | v0.2.0 開發 (Phase 12b + 17 + 15-lite 規劃) |
| v0.2.0-dev | 2026-03-08 | 版本命名統一為語義版本 |
| 4.0 | 2026-03-14 | **精簡重構**: 移除詳細 Phase 規格 (任務清單、UI mockup、SQL schema、API 端點)，遷移至 `openspec/specs/`。本文件轉為高層級路線圖。新增 OpenSpec 工作流整合章節。 |

> **完整修改歷史**: 參見 git history 中 v3.2 及更早版本的 `docs/WEB_DEV_PLAN.md`。

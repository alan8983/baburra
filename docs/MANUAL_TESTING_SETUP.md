# 手動測試環境設定（無預建假資料）

本文件說明如何建立一個**沒有預建假資料**的環境，並註冊一個新帳號供手動測試使用。此環境僅包含必要的參考資料（論點類別），不包含 KOL、股票、文章等假資料。

## 適用情境

- 驗證「空狀態」UI（無 KOL、無文章、無書籤）
- 從頭體驗完整註冊與建立內容流程
- 手動測試時不想被既有假資料干擾

## 前置需求

- 已安裝 [Supabase CLI](https://supabase.com/docs/guides/cli)
- 專案已連結 Supabase 專案（`supabase link`）或使用本地 Supabase

## 步驟一：重置資料庫並只跑 migrations

先套用 schema，**不要**執行完整 `seed.sql`（否則會寫入假資料）。

### 方式 A：使用 Supabase 本地開發

```bash
# 1. 重置資料庫（會跑完所有 migrations，並執行 seed.sql）
supabase db reset

# 2. 用 minimal seed 覆蓋：先刪除 seed 寫入的假資料，再灌入僅論點類別
#    若你希望「完全無假資料」，請改為手動執行 seed-minimal.sql（見方式 B）
```

若使用 `db reset`，預設會執行 `seed.sql`，因此會出現假資料。若要**無假資料**，請改用方式 B。

### 方式 B：只跑 migrations + 手動執行 minimal seed（建議）

```bash
# 1. 僅套用 migrations（不執行 seed.sql）
supabase db reset --no-seed

# 若你的 CLI 不支援 --no-seed，可改為：
# supabase migration up
# （或依你目前的 Supabase 版本文件操作）

# 2. 執行 minimal seed（僅論點類別）
supabase db execute -f supabase/seed-minimal.sql
```

若 `supabase db reset --no-seed` 在你的版本不存在，可改為：

1. 在 Supabase Dashboard → SQL Editor 依序執行 `supabase/migrations/` 內所有 migration 檔案。
2. 再在 SQL Editor 執行 `supabase/seed-minimal.sql` 的內容。

## 步驟二：確認環境變數

確保 `.env.local` 已設定該 Supabase 專案的：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- （若後端需用）`SUPABASE_SERVICE_ROLE_KEY`

且**不要**設定 `DEV_USER_ID` / `TEST_USER_ID`，以便用真實登入流程測試。

## 步驟三：啟動 App 並註冊測試帳號

```bash
npm run dev
```

1. 開啟 http://localhost:3000
2. 前往註冊頁面（例如 `/register`）
3. 使用一組**僅供手動測試**的 email / 密碼註冊
4. 登入後即可在「無 KOL、無文章、無書籤」的環境下操作

## 結果

- **有**：論點類別（argument_categories），供 Phase 8 論點提取與 UI 使用。
- **無**：KOL、Stocks、Posts、Post-Stocks 等假資料；該帳號的書籤、草稿為空。

之後若要恢復含假資料的開發環境，再執行一次 `supabase db reset`（會跑完整 `seed.sql`）即可。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `supabase/seed.sql` | 完整測試資料（KOL、股票、文章、論點類別） |
| `supabase/seed-minimal.sql` | 僅論點類別，無假內容 |

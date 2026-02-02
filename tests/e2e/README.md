# E2E 測試說明

此目錄包含專案的端對端（E2E）測試腳本。

## 測試檔案

- `core-flow.spec.ts` - 核心輸入流程的完整 Happy Path 測試
- `app.spec.ts` - 基本頁面載入和導航測試
- `test-teardown.ts` - 測試資料清理腳本

## 執行測試

### 執行所有 E2E 測試

```bash
npm run test:e2e
```

### 使用 Playwright UI 模式執行

```bash
npm run test:e2e:ui
```

### 執行特定測試檔案

```bash
npx playwright test tests/e2e/core-flow.spec.ts
```

## 環境變數設定

執行測試前，請確保設定以下環境變數：

```bash
# Supabase 設定（必填）
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# 認證跳過（可選，用於開發/測試環境）
TEST_USER_ID=your_test_user_id
# 或
DEV_USER_ID=your_dev_user_id
```

這些環境變數可以放在 `.env.local` 檔案中，Playwright 會自動讀取。

## 測試資料清理

測試執行後，可以使用 teardown 腳本清理測試產生的資料：

```bash
npm run test:e2e:teardown
```

或手動執行：

```bash
npx tsx tests/e2e/test-teardown.ts
```

### Teardown 腳本功能

- 自動刪除測試產生的 Posts
- 自動刪除測試產生的 Drafts
- 清理相關的關聯資料（post_stocks, draft_stocks 等）
- 可選：清理測試 KOL（預設不執行，避免影響其他測試）

## 測試流程說明

### core-flow.spec.ts

此測試模擬完整的文章建立流程：

1. **輸入階段** (`/input`)
   - 輸入測試內容
   - 點擊「直接建檔」按鈕

2. **草稿編輯階段** (`/drafts/[id]`)
   - 選擇 KOL
   - 選擇股票（可多選）
   - 設定發文時間
   - 設定情緒為「看多」
   - 點擊「預覽並確認」

3. **預覽確認階段** (`/posts/new`)
   - 確認文章內容
   - 確認情緒設定
   - 點擊「確認建檔」

4. **驗證階段**
   - 驗證導航到文章詳情頁 (`/posts/[id]`)
   - 驗證文章出現在文章列表 (`/posts`)

### 認證處理

測試使用以下方式跳過認證：

1. 設定 `TEST_USER_ID` 或 `DEV_USER_ID` 環境變數
2. Middleware 會自動允許這些測試用戶存取
3. API 路由會使用 `getCurrentUserId()` 取得用戶 ID，如果沒有 session 則使用環境變數中的 ID

## 注意事項

1. **測試資料隔離**：測試會建立專用的測試資料（KOL、Stock 等），並在測試結束後清理。

2. **並行執行**：如果多個測試同時執行，可能會產生資料衝突。建議：
   - 使用唯一的測試資料名稱（包含時間戳）
   - 或在 CI/CD 中設定 `workers: 1` 來避免並行執行

3. **Supabase 權限**：確保使用的 Supabase 專案有適當的 RLS 政策，允許測試用戶建立和刪除資料。

4. **測試穩定性**：測試中包含適當的等待時間和重試機制，但網路延遲或 Supabase 回應時間可能影響測試穩定性。

## 疑難排解

### 測試失敗：認證錯誤

- 檢查是否設定了 `TEST_USER_ID` 或 `DEV_USER_ID`
- 確認 Supabase 環境變數正確設定

### 測試失敗：找不到元素

- 檢查頁面是否正確載入
- 確認選擇器是否正確（可能需要根據 UI 變更調整）
- 增加等待時間或使用 `waitFor` 方法

### 測試失敗：資料清理失敗

- 確認 Supabase 環境變數正確
- 檢查 RLS 政策是否允許刪除操作
- 手動執行 teardown 腳本清理資料

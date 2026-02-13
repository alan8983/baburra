# Manual Testing Results - 2026-02-13

## Test Session Information

| Item | Details |
|------|---------|
| **Tester** | Alan |
| **Date** | 2026-02-13 |
| **Start Time** | (17:40) |
| **End Time** | (fill in when done) |
| **Environment** | Development (localhost:3000) |
| **Browser** | Cursor Browser |
| **Database** | With seed data (supabase db reset) |
| **Auth Mode** | DEV_USER_ID bypass enabled |
| **Test User** | DEV_USER_ID=00000000-0000-0000-0000-000000000001 |

---

## Testing Scope

Focus areas for this session:
- [ ] Phase 9: App Layout & Navigation
- [ ] Phase 2: KOL Management
- [ ] Phase 3: Stock Management
- [ ] Phase 4: Input & Drafts
- [ ] Phase 5: Post Viewing
- [ ] Phase 6: K-line Charts
- [ ] Phase 7: Win Rate Calculation
- [ ] Phase 8: AI Integration
- [ ] Phase 1: Authentication

---

## Test Execution Log

### Phase 9: App Layout & Navigation

#### TC-09-001: Sidebar 導航切換
- **Status**: ❌ Failed
- **Execution Time**:1741-1745
- **Notes**:
- **Pass Criteria**:
  - [o] 所有導航項目可點擊
  - [o] URL 正確變更
  - [o] 頁面內容正確載入
  - [o] 當前頁面在 Sidebar 有 active 狀態標示
- **Issues Found**:
   Sidebar 狀態顯示的對比太低
   Sidebar 左上角出現兩個關閉符號，沒有正確顯示
   讓產品名變得可維護。"KOL Tracker"不是最終定案。需要跟網址與整個網頁連動(Stock KOL Tracker- 追蹤 KOL 投資觀點)
  

#### TC-09-002: Header 使用者資訊顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確顯示用戶資訊
  - [ ] 下拉選單功能正常
  - [ ] 登出後 Session 清除
- **Issues Found**:

---

#### TC-09-003: AI 配額顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 配額顯示區正確顯示「AI 配額: X/15 本週」
  - [ ] 使用 AI 後數字正確增加
  - [ ] 資料與 Supabase profiles 一致
- **Issues Found**:

---

#### TC-09-004: Dashboard 總覽頁面
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] KOL 數量顯示正確
  - [ ] 投資標的數量顯示正確
  - [ ] 文章數量顯示正確
  - [ ] 最近文章列表正確顯示
- **Issues Found**:

---

#### TC-09-005: 語言切換功能
- **Status**: ❌ Failed
- **Execution Time**:1746-1747
- **Notes**:
- **Pass Criteria**:
  - [o] 可在 zh-TW 和 en 之間切換
  - [x] 切換後所有文字正確翻譯
  - [ ] NEXT_LOCALE cookie 正確設定
  - [o] 重新載入後語言設定保持
- **Issues Found**:
  Side Bar, Dashboard, Header有正確切換，但Quickinput, Drafts等等子頁面沒有正確切換


---

### Phase 2: KOL 管理

#### TC-02-001: KOL 列表顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 列表正確載入
  - [o] 資料與 Supabase 一致
  - [ ] 顯示 KOL 名稱、頭像、簡介
  - [ ] 點擊可導向詳情頁
- **Issues Found**:

---

#### TC-02-002: 新增 KOL
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [x] 表單驗證正常運作
  - [x] 成功新增後導向 KOL 詳情頁
  - [o] Supabase kols 資料表有新記錄
  - [ ] Toast 通知顯示成功訊息
- **Issues Found**:

---

#### TC-02-003: KOL 詳情頁顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確顯示 KOL 資訊
  - [ ] 顯示該 KOL 的所有文章
  - [ ] 顯示勝率統計（若有）
  - [ ] 社交連結可點擊
- **Issues Found**:

---

#### TC-02-004: 編輯 KOL
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 編輯表單預填現有資料
  - [ ] 成功更新後資料正確
  - [ ] Supabase 資料已更新
  - [ ] Toast 通知顯示成功訊息
- **Issues Found**:

---

#### TC-02-005: 刪除 KOL
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 顯示確認對話框
  - [ ] 確認後成功刪除
  - [ ] 導向 KOL 列表頁
  - [ ] Supabase 記錄已刪除
- **Issues Found**:

---

### Phase 3: 投資標的管理

#### TC-03-001: Stock 列表顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 列表正確載入
  - [ ] 資料與 Supabase 一致
  - [ ] 顯示 Ticker、名稱、Logo
  - [ ] 點擊可導向詳情頁
- **Issues Found**:

---

#### TC-03-002: 新增 Stock
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] Ticker 輸入自動轉大寫
  - [ ] 表單驗證正常
  - [ ] 成功新增後導向 Stock 詳情頁
  - [ ] Supabase stocks 資料表有新記錄
- **Issues Found**:

---

#### TC-03-003: Stock 詳情頁與相關文章
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確顯示相關文章
  - [ ] 排序依發文時間由新到舊
  - [ ] 每篇文章顯示 KOL 名稱
  - [ ] 點擊可導向文章詳情
- **Issues Found**:

---

### Phase 4: 輸入與草稿核心

#### TC-04-001: 快速輸入草稿
- **Status**: ⬜ Not Started
- **Execution Time**:1755-1800
- **Notes**:
- **Pass Criteria**:
  - [o] 輸入框正常運作
  - [o] 成功儲存草稿
  - [o] Supabase drafts 資料表有新記錄
  - [o] 導向草稿編輯頁
- **Issues Found**:

---

#### TC-04-002: 草稿自動儲存
- **Status**: ⬜ Not Started
- **Execution Time**:1755-1800
- **Notes**:
- **Pass Criteria**:
  - [x] 輸入後 3 秒自動儲存
  - [x] 顯示「已儲存」提示
  - [o] Supabase updated_at 時間戳更新
  - [o] 重新整理後內容保留
- **Issues Found**:
  未觸發自動儲存

---

#### TC-04-003: URL 自動擷取功能
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [x] 貼上 URL 自動觸發擷取
  - [x] 成功擷取網頁內容
  - [ ] 內容填入文章內容框
  - [ ] 顯示載入狀態
- **Issues Found**:
  擷取失敗 Post API fetch-url 400
---

#### TC-04-004: URL 擷取錯誤處理
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 無效 URL 顯示錯誤訊息
  - [ ] 網路錯誤顯示錯誤訊息
  - [ ] 錯誤不影響草稿儲存
  - [ ] 可重試擷取
- **Issues Found**:

---

#### TC-04-005: 草稿列表顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 列表正確顯示所有草稿
  - [ ] 僅顯示當前用戶的草稿（RLS）
  - [o] 排序依更新時間由新到舊
  - [o] 顯示預覽內容前 100 字
- **Issues Found**:
  Sidebar顯示的草稿數量錯誤
---

#### TC-04-006: 草稿編輯與標籤選擇
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] KOL 選擇器正常運作
  - [o] Stock 選擇器支援多選
  - [ ] 自動儲存正常運作
  - [ ] 資料正確寫入 Supabase
- **Issues Found**:

---

#### TC-04-007: 草稿刪除
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 顯示確認對話框
  - [o] 確認後成功刪除
  - [o] 導向草稿列表頁
  - [o] Supabase 記錄已刪除
- **Issues Found**:

---

#### TC-04-008: 預覽並確認情緒
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 情緒選擇器正常運作
  - [o] 可切換不同情緒
  - [x] AI 建議（若有）可採用
- **Issues Found**:
  AI Analyze error GEMINI API Error 404 (model gemini 1.5. flash no found)

---

#### TC-04-009: 發布文章
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] 驗證必填欄位
  - [o] 成功發布後導向文章詳情頁
  - [o] Supabase posts 資料表有新記錄
  - [o] 草稿狀態變更或刪除
- **Issues Found**:

---

#### TC-04-010: 發布文章關聯資料
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] post_stocks 關聯正確建立
  - [x] 發布時間 posted_at 正確
  - [o] KOL 關聯正確
  - [o] 情緒值正確儲存
- **Issues Found**:

---

### Phase 5: 文章檢視

#### TC-05-001: 文章列表顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 列表正確載入已發布文章
  - [ ] 排序依發文時間由新到舊
  - [ ] 顯示 KOL、標的、情緒
  - [ ] 點擊可導向文章詳情
- **Issues Found**:

---

#### TC-05-002: 文章詳情頁顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確顯示文章內容
  - [ ] 顯示 KOL 資訊
  - [ ] 顯示投資標的列表
  - [ ] 顯示情緒標籤
- **Issues Found**:

---

#### TC-05-003: 文章書籤功能
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 可新增書籤
  - [ ] 可移除書籤
  - [ ] Supabase bookmarks 資料正確
  - [ ] 書籤狀態即時更新
- **Issues Found**:

---

### Phase 6: K 線圖

#### TC-06-001: K 線圖顯示
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [x] 正確顯示 K 線圖
  - [X] 資料來源為 Tiingo API
  - [X] 標記發文時間點
  - [X] 圖表可互動（縮放、tooltip）
- **Issues Found**: Lethal Failed

---

#### TC-06-002: 股價資料快取
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [X] 首次載入呼叫 Tiingo API
  - [X] 後續載入使用 Supabase 快取
  - [X] 資料正確寫入 stock_prices 資料表
  - [ ] 快取過期後重新抓取
- **Issues Found**: Lethal Failed

---

### Phase 7: 勝率計算

#### TC-07-001: KOL 勝率計算
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確計算 7 日勝率
  - [ ] 正確計算 30 日勝率
  - [ ] 只計算有效文章（有標的、有情緒）
  - [ ] 計算邏輯符合 DOMAIN_MODELS.md
- **Issues Found**:

---

#### TC-07-002: 價格漲跌計算
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 正確計算發文日到目標日的漲跌幅
  - [ ] 使用收盤價計算
  - [ ] 數據不足時顯示 N/A
  - [ ] 百分比格式正確（+5.23% / -2.15%）
- **Issues Found**:

---

### Phase 8: AI 整合

#### TC-08-001: AI 情緒分析
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [o] AI 分析成功回傳
  - [o] 情緒建議合理
  - [o] 配額正確扣除
- **Issues Found**:

---

#### TC-08-002: AI Ticker 識別
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [x] 正確識別文中的 Ticker
  - [x] 支援中英文股票名稱
  - [x] 回傳標準化 Ticker 格式
  - [x] 無 Ticker 時回傳空陣列
- **Issues Found**:

---

#### TC-08-003: AI 配額限制
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 達到 15 次上限後禁用 AI 功能
  - [ ] 顯示「已達配額上限」訊息
  - [ ] 每週重置配額正常運作
  - [ ] profiles.ai_usage_reset_at 正確更新
- **Issues Found**:

---

### Phase 1: 認證系統

#### TC-01-001: 使用者註冊
- **Status**: ⏭️ Skipped (DEV_USER_ID enabled)
- **Execution Time**:
- **Notes**: Skipped due to DEV_USER_ID bypass
- **Pass Criteria**:
  - [ ] 表單驗證正常
  - [ ] 成功註冊後建立 profile
  - [ ] Email 格式驗證
  - [ ] 密碼強度驗證
- **Issues Found**:

---

#### TC-01-002: 使用者登入
- **Status**: ⏭️ Skipped (DEV_USER_ID enabled)
- **Execution Time**:
- **Notes**: Skipped due to DEV_USER_ID bypass
- **Pass Criteria**:
  - [ ] 正確帳密可登入
  - [ ] 錯誤帳密顯示錯誤訊息
  - [ ] 登入後導向 Dashboard
  - [ ] Session 正確建立
- **Issues Found**:

---

#### TC-01-003: 使用者登出
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 登出後 Session 清除
  - [ ] 導向登入頁
  - [ ] 無法存取受保護頁面
- **Issues Found**:

---

#### TC-01-004: RLS 資料隔離
- **Status**: ⬜ Not Started
- **Execution Time**:
- **Notes**:
- **Pass Criteria**:
  - [ ] 用戶只能看到自己的草稿
  - [ ] 無法透過 API 存取他人資料
- **Issues Found**:

---

## Issues Found During Testing

### ISSUE-20260212-001: [Issue Title]
- **Test Case**: TC-XX-XXX
- **Severity**: Critical / High / Medium / Low
- **Status**: Open
- **Description**:
- **Steps to Reproduce**:
  1.
  2.
  3.
- **Expected**:
- **Actual**:
- **Screenshots/Logs**:

---

## Testing Summary

### Overall Results

| Item | Count |
|------|-------|
| Total Test Cases | 35 |
| ✅ Passed | 0 |
| ❌ Failed | 0 |
| ⏭️ Skipped | 0 |
| 🚧 Blocked | 0 |
| ⬜ Not Started | 33 |
| **Pass Rate** | 0% |

### Phase Breakdown

| Phase | Total | Passed | Failed | Skipped | Pass Rate |
|-------|-------|--------|--------|---------|-----------|
| Phase 9: Layout & 導航 | 5 | 0 | 0 | 0 | 0% |
| Phase 2: KOL 管理 | 5 | 0 | 0 | 0 | 0% |
| Phase 3: Stock 管理 | 3 | 0 | 0 | 0 | 0% |
| Phase 4: 輸入與草稿 | 10 | 0 | 0 | 0 | 0% |
| Phase 5: 文章檢視 | 3 | 0 | 0 | 0 | 0% |
| Phase 6: K 線圖 | 2 | 0 | 0 | 0 | 0% |
| Phase 7: 勝率計算 | 2 | 0 | 0 | 0 | 0% |
| Phase 8: AI 整合 | 3 | 0 | 0 | 0 | 0% |
| Phase 1: 認證系統 | 2 | 0 | 0 | 2 | N/A |

### Key Findings

#### Critical Issues
- (list any P0/Critical issues here)

#### High Priority Issues
- (list any P1/High issues here)

#### Medium/Low Issues
- (list any P2/P3 issues here)

#### Recommendations
- (list recommendations for fixes or improvements)

---

## Notes & Observations

### General Comments
-

### Browser-Specific Issues
-

### Performance Observations
-

### UX Feedback
-

---

## Next Steps

- [ ] Fix critical issues
- [ ] Retest failed test cases
- [ ] Complete skipped test cases with proper auth
- [ ] Document all issues in separate issue files
- [ ] Update test plan based on findings

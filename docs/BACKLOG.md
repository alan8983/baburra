# Product Backlog

> 本文件由 `User Story Mapping Framework_v20251207.csv` 自動生成，作為開發待辦清單。
> 已於 2026-02-19 更新為 Next.js Web 版本的實作狀態。
>
> **最後更新**: 2026-03-08

---

## 📊 進度統計

| 狀態        | 數量   | 百分比   |
| ----------- | ------ | -------- |
| ✅ 已完成   | 49     | 55.7%    |
| 🔄 部分完成 | 7      | 8.0%     |
| ⏳ 待實現   | 32     | 36.4%    |
| **總計**    | **88** | **100%** |

> **v0.1.0 (MVP) 100% 完成！** TODO-001 ~ TODO-017 全部完成。剩餘 🔄/⏳ 項目屬於 v0.2.0 / v1.0.0 範圍。

### 完成度分析

- **v0.1.0 (MVP) 核心功能**: **100% 完成** (TODO-001~017 全部 ✅)
- **v0.2.0 功能**: 約 70% 完成 (Phase 12b + Phase 17 + Twitter oEmbed + RWD + 書籤已完成；Phase 15-lite + Phase 16 進行中)
- **關鍵待實現功能**: v0.2.0 — **AI 模型版本追蹤 (Phase 15-lite)**、**社群洞察 (Phase 16)**
- **本次更新**: 版本命名統一為語義版本 (v0.1.0/v0.2.0/v1.0.0)；AI 文章摘要 + 編輯建議系統延後至 v1.0.0

> **注意**: 本專案已從 Flutter 移動端遷移至 Next.js 16 Web 版本 (2026-02-01 起)。
> 下方 User Story 中的元件名稱已更新為 Web 版對應元件。

---

## Step 0.0

- [x] 作為​一​個​ [​快速紀錄者​]，​ ​我​想​要​ [​能​打開​APP​直接​輸入​內容]，​ 以​便 [置入​在​SNS​的​使用​心流]。​
  - _Tags: User Story-MVP, Step 0.0_
  - ✅ **已實現** - `/input` (Quick Input page) 提供直接輸入介面
- [x] 作為​一​個​ [​快速紀錄者​]，​ ​我​想​要​ [​能​貼​上​剪​貼​簿​中​的​文本​]，​ 以​便 [​提升​效率]。​
  - _Tags: User Story-MVP, Step 0.0_
  - ✅ **已實現** - 支援文字貼上功能
- [ ] 作為​一​個​ [​快速紀錄者​]，​ ​我​想​要​ [​看到​AI​自動​辨識​輸入​的​內容​類型​ (網址 or 文​章)，​並轉​到​正確​的​相應​的​頁面]，​ 以​便 [​減少​我​手動​設定​的​次​數]。​
  - _Tags: User Story-MVP, Step 0.0_
  - ⏳ **待實現** - v0.2.0 功能
- [x] 作為​一​個​ [​快速紀錄者​]，​ ​我​想​要​ [​系統​自動​暫存​輸入​的​內容​為草稿]，​ 以​便 [​在​我​分心​切換​的​時候​能​留​檔]。​
  - _Tags: User Story-MVP, Step 0.0_
  - ✅ **已實現** - 自動暫存機制已實作

## Step 1a

- [ ] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [貼​上​網址​直接​抓取資​訊]，​以​便​ [​減少​我​手動​設定​的​次​數]。​
  - _Tags: User Story-v0.2.0, Step 1a_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​預覽​結果]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-v0.2.0, Step 1a_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​在​自動​爬取​的​文本​之​上​進行​編​輯]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-v0.2.0, Step 1a_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​在​貼上​不​支援​的​網址時，​跳出​錯誤​提示​]，​以​便​ [​我​注意​到​問題]。​
  - _Tags: User Story-v0.2.0, Step 1a_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​在​錯誤​提示​之內​有​取消​&​手動​輸入​的​按鈕]，​以​便​ [​我​跳轉​到​正確​的​頁面]。​
  - _Tags: User Story-v0.2.0, Step 1a_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為一個 [快速紀錄者]，我想要 [貼上 Threads 網址直接抓取資訊]，以便 [減少我手動設定的次數]。
  - _Tags: User Story-v1.0.0, Step 1a_
  - ⏳ **待實現** - v1.0.0 功能（Extractor 已有 stub，需完成 HTML 解析實作）
- [ ] 作為一個 [快速紀錄者]，我想要 [貼上 Facebook 貼文網址直接抓取資訊]，以便 [減少我手動設定的次數]。
  - _Tags: User Story-v1.0.0, Step 1a_
  - ⏳ **待實現** - v1.0.0 功能（Extractor 已有 stub，需完成 HTML/JSON-LD 解析實作）
- [ ] 作為一個 [快速紀錄者]，我想要 [貼上 YouTube 影片網址，系統自動擷取影片逐字稿並填入文字區域進行後續分析]，以便 [將影片形式的投資觀點也納入追蹤]。
  - _Tags: User Story-v1.0.0, Step 1a_
  - ⏳ **待實現** - v1.0.0 功能
  - 實作步驟：
    1. 使用者輸入 YouTube 影片網址
    2. 系統擷取影片逐字稿（Transcript）
    3. 將逐字稿填入文字區域，交由 AI 進行 KOL、標的與情緒分析

## Step 1b.1

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​編輯​文本]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-MVP, Step 1b.1_
  - ✅ **已實現** - `/drafts/[id]` (Draft edit page) 提供完整文本編輯功能

## Step 1b.3

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​編輯​文本]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-MVP, Step 1b.3_
  - ✅ **已實現** - `/drafts/[id]` (Draft edit page) 提供完整文本編輯功能
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​編輯AI辨​識出​的​結果]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-v0.2.0, Step 1b.3_
  - ✅ **已實現** - Draft review page 允許編輯 AI 辨識結果
- [~] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​在下拉式​多​選​清單​中，​挑選​AI​自動辨​識出​在​文本​中​主要​討論​的​投資標​的​]，​以​便​ [​減少​我​手動​輸入​的​次​數]。​
  - _Tags: User Story-v0.2.0, Step 1b.3_
  - 🔄 **部分完成** - AI 已自動辨識單一 Ticker，多選功能待實作
- [ ] 作為​一​個​ [市場觀察者​]，​我​想​要​ [​在下拉式​多​選​清單​中，​挑選​AI​自動辨​識出​文本​中​主要​討論​的​資產​分類]，​以​便​ [​提供​不同​的​觀察​維度​]。​
  - _Tags: User Story-v0.2.0, Step 1b.3_
  - ⏳ **待實現** - v0.2.0 功能
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​在下拉式​多​選​清單​中，​挑選​AI​自動辨​識出​文本​中​主要​討論​的​資產​分類]，​以​便​ ​[為模糊​主題​的​文檔​分類]。​
  - _Tags: User Story-v0.2.0, Step 1b.3_
  - ⏳ **待實現** - v0.2.0 功能

## Step 1b.4

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​編輯​文本]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-MVP, Step 1b.4_
  - ✅ **已實現** - `/drafts/[id]` (Draft edit page) 提供完整文本編輯功能
- [ ] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​能​從下​拉式​選單​中，​選擇到​最近​五​個​新​增文檔​的​KO​L]，​以​便​ [​減少​我​手動​輸入​的​次​數]。​
  - _Tags: User Story-v0.2.0, Step 1b.4_
  - ⏳ **待實現** - v0.2.0 功能

## Step 1b.5

- [x] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​能​直接​輸入​相對​時間​(​大部分​SNS​都​是​顯示​X​天前、​X小​時​前​)]，​以​便​ [讓​我​不​須​手動​換算]。​
  - _Tags: User Story-MVP, Step 1b.5_
  - ✅ **已實現** - `datetime-input.tsx` 支援相對時間輸入（2025-12-13）
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​手動​輸入​絕對​日期​與時​間]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-MVP, Step 1b.5_
  - ✅ **已實現** - `datetime-input.tsx` 支援絕對時間輸入

## Step 2

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​看到​所有​草稿​在​清單​中]，​以​便​ [​提高​管理​效率]。​
  - _Tags: User Story-MVP, Step 2_
  - ✅ **已實現** - `/drafts` (Drafts list page) 顯示所有草稿
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點選草稿​進入​手動​編輯​畫面]，​以​便​ [​完成​建檔]。​
  - _Tags: User Story-MVP, Step 2_
  - ✅ **已實現** - 點選草稿可進入編輯畫面
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​在​清單​中(​不​開啟編輯​畫面​)​左右滑動刪​除]，​以​便​ [​提高​清理​的​效率​]。​
  - _Tags: User Story-MVP, Step 2_
  - ⏳ **待實現** - 滑動刪除功能
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​在​清單​中(​不​開啟編輯​畫面​)長​按​進行多​選並​一​併​刪​除]，​以​便​ [​提高​清理​的​效率​]。​
  - _Tags: User Story-MVP, Step 2_
  - ⏳ **待實現** - 多選刪除功能

## Step 3.1

- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​複​核AI​自動辨​識出​文本​中，​針對​特定​投資​項目​的​市場​情​緒]，​以​便​ [​提供​不同​的​觀察​維度​]。​
  - _Tags: User Story-MVP, Step 3.1_
  - ✅ **已實現** - Draft review page 顯示 AI 分析結果供複核
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​編輯AI辨​識出​的​結果]，​以​便​ [​提高​建檔​的​準確性]。​
  - _Tags: User Story-MVP, Step 3.1_
  - ✅ **已實現** - 可在分析結果畫面編輯所有欄位
- [x] 作為一個 [用戶]，我想要 [在 AI 無法辨識出任何投資標的時收到明確警告]，以便 [避免建立無意義的文章記錄]。
  - _Tags: User Story-MVP, Step 3.1, TODO-017_
  - ✅ **已實現** - 匯入管線 reject (error status) + Quick Input toast 警告 + validation.ts min(1) + import-result amber icon + i18n (zh-TW + en)
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​有​AI​比對準備​建立​的​文檔​跟​既​有​資料庫​的​內容]，​以​便​ [​避免​重複​輸入​建檔]。​
  - _Tags: User Story-v0.2.0, Step 3.1_
  - ⏳ **待實現** - v0.2.0 功能

## Step 3.2

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​建檔​前​有​多​一​個​確認彈​窗]，​以​便​ [降低​誤觸率]。​
  - _Tags: User Story-MVP, Step 3.2_
  - ✅ **已實現** - Draft review page 提供確認建檔彈窗
- [x] 作為一個 [用戶]，我想要 [在發布文章前看到免責聲明並勾選同意]，以便 [了解自己的責任並確保內容合法性]。
  - _Tags: User Story-MVP, Step 3.2, Phase 4.16_
  - ✅ **已實現** - 草稿發布頁 3 點免責聲明 checkbox + Confirm 按鈕禁用邏輯 + i18n (zh-TW + en)

## Step 4.1

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​有​凍結​的​Header​顯示​基本​資料​]，​以​便​ [​在​查看​細​節時，​不​用​一直​翻到​最​前面​看作者​是​哪個​KO​L]。​
  - _Tags: User Story-MVP, Step 4.1_
  - ✅ **已實現** - `/kols/[id]` (KOL detail page) 提供凍結 Header
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右滑動​畫面​中​段​查​看​不同​細​節]，​以​便​ ​[從​更​多​面向​去理​解這​公司​]。​
  - _Tags: User Story-MVP, Step 4.1_
  - ⏳ **待實現** - 左右滑動查看不同細節功能

## Step 4.2

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​把​文檔​依照​投資標​的​進行​Groupin​g]，​以​便​ ​[查​找​某​個單篇文​檔]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - `/kols/[id]` (KOL detail page) 依投資標的 Grouping
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​把​Grouping​依照​最近​更新​進行​排序]，​以​便​ [​快速瀏​覽該KO​L​關注​的​領域​]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - Grouping 依最近更新排序
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​Group​中列出​最​新​3筆​文​檔]，​以​便​ [​檢視​最​新​的​觀點]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - 每個 Group 顯示最新 3 筆文檔
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​標題​旁​註明發​表時​間]，​以​便​ [評估​時效性]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - 文檔標題旁顯示發表時間
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​旁邊​註明情​緒​觀點與漲​跌​幅]，​以​便​ [評​估勝率]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - 情緒觀點 + 5 日漲跌幅已顯示於 KOL 詳情頁
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右滑動​顯示​其他​區間​30、​90、​365​的​漲跌​幅]，​以​便​ [評估​不同​維度​的​勝率​]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ⏳ **待實現** - 5 日漲跌幅已顯示，多區間切換待實作
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點擊Logo查​看​特定​標​的​的​文檔​清單]，​以​便​ [access​過往​其他​文檔]。​
  - _Tags: User Story-MVP, Step 4.2_
  - ✅ **已實現** - 點擊 Logo 可查看特定標的文檔清單

## Step 4.3

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​看到​所有​相關​文檔​在​清單​中]，​以​便​ [​提高​管理​效率]。​
  - _Tags: User Story-MVP, Step 4.3_
  - ✅ **已實現** - `/kols/[id]` (KOL detail page) 顯示所有相關文檔
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​標題​旁​註明發​表時​間]，​以​便​ [評估​時效性]。​
  - _Tags: User Story-MVP, Step 4.3_
  - ✅ **已實現** - 文檔標題旁顯示發表時間
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​旁邊​註明情​緒​觀點與漲​跌​幅]，​以​便​ [評​估勝率]。​
  - _Tags: User Story-MVP, Step 4.3_
  - ✅ **已實現** - 情緒觀點 + 5 日漲跌幅已顯示
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右滑動​顯示​其他​區間​30、​90、​365​的​漲跌​幅]，​以​便​ [評估​不同​維度​的​勝率​]。​
  - _Tags: User Story-MVP, Step 4.3_
  - ⏳ **待實現** - 5 日漲跌幅已顯示，多區間切換待實作
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點擊​以​移轉​到​單篇文​檔]，​以​便​ ​[查​看​特定​文檔]。​
  - _Tags: User Story-MVP, Step 4.3_
  - ✅ **已實現** - 點擊文檔可查看詳情

## Step 4.4

- [~] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​依照​投資標​的​對文​檔​進行Groupin​g]，​以​便​ [評估​個股​的​勝率​]。​
  - _Tags: User Story-MVP, Step 4.4_
  - 🔄 **部分完成** - Grouping 已實作，個股勝率未顯示於 Grouping 卡片
- [~] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每個​項目旁邊​註明情​緒​觀點​與5、​30、​90、​36​5日​的​漲跌​幅]，​以​便​ [評​估勝率]。​
  - _Tags: User Story-MVP, Step 4.4_
  - 🔄 **部分完成** - 5 日漲跌幅已顯示，30/90/365 日待實作
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​彙總​每​個​Grouping​在​5、​30、​90、​36​5日​的​勝率​(情緒​觀點符合漲​跌​方向​)]，​以​便​ [評估KOL對​特定標​的​意見​的​準度​]。​
  - _Tags: User Story-MVP, Step 4.4_
  - ⏳ **待實現** - 需在 Grouping 卡片中顯示個股勝率
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​彙總KOL​所有​文檔​在​5、​30、​90、​36​5日​的​勝率​(情緒​觀點符合漲​跌​方向​)]，​以​便​ [評估KOL​整體​的​可​信​度​]。​
  - _Tags: User Story-MVP, Step 4.4_
  - ✅ **已實現** - Stats Tab 顯示 KOL 整體勝率 (5/30/90/365 日)
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點擊​以​移轉​到​單篇文​檔]，​以​便​ ​[查​看​特定​文檔]。​
  - _Tags: User Story-MVP, Step 4.4_
  - ✅ **已實現** - 點擊文檔可查看詳情

## Step 4.5

- [x] 作為​一​個​ [​快速紀錄者​]，​我​想​要​ [​顯示​該K​OL​的​簡介、​SNS連結]，​以​便​ ​[​到​外部​網站​去持​續​追蹤該K​OL​的​動態]。​
  - _Tags: User Story-v0.2.0, Step 4.5_
  - ✅ **已實現** - `/kols/[id]` (KOL detail page) 顯示簡介與 SNS 連結
- [ ] 作為​一​個​ [​整理者​]，​我​想​要​ [​能​長​按​編輯​簡介、​SNS連結]，​以​便​ [隨時​進行調​整]。​
  - _Tags: User Story-v0.2.0, Step 4.5_
  - ⏳ **待實現** - 長按編輯功能

## Step 5.1

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​有​凍結​的​Header​顯示​基本​資料​]，​以​便​ [​在​查看​細​節時，​不​用​一直​翻到​最​前面​看作者​是​哪個​KO​L]。​
  - _Tags: User Story-MVP, Step 5.1_
  - ✅ **已實現** - `/posts/[id]` (Post detail page) 提供凍結 Header
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​Heade​r查​看​回測​結果]，​以​便​ [對照主文​來​評估可​信度​]。​
  - _Tags: User Story-MVP, Step 5.1_
  - ⏳ **待實現** - 回測計算已完成 (Phase 7)，Post Header UI 待整合
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右滑動​畫面​中​段​查​看​不同​細​節]，​以​便​ ​[從​更​多​面向​去理​解這​公司​]。​
  - _Tags: User Story-MVP, Step 5.1_
  - ⏳ **待實現** - 左右滑動查看不同細節功能

## Step 5.2

- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [查​看文檔​全​文]，​以​便​ [​當​作​跨​平台​的​筆記​/​資料​庫]。​
  - _Tags: User Story-MVP, Step 5.2_
  - ✅ **已實現** - `/posts/[id]` (Post detail page) 顯示文檔全文
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​將文章​加為書​籤]，​以​便​ [​再次​閱讀​內容]。​
  - _Tags: User Story-MVP, Step 5.2_
  - ✅ **已實現** - `use-bookmarks.ts` hook 提供書籤功能

## Step 5.3

- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​縮放線​圖]，​以​便​ [​更​好​的​理解​走​勢]。​
  - _Tags: User Story-MVP, Step 5.3_
  - ✅ **已實現** - chart-toolbar 支援日/週/月/季/年 + 1M/1Q/YTD/1Y/5Y
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右平移線​圖]，​以​便​ ​[查​看​先​前​/​後續​的​走勢]。​
  - _Tags: User Story-MVP, Step 5.3_
  - ✅ **已實現** - Lightweight Charts 內建平移功能
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​線圖​上​檢視該文檔​傳達​的​走勢​情​緒]，​以​便​ [對時機點​進行​更​準確​的​對照]。​
  - _Tags: User Story-MVP, Step 5.3_
  - ✅ **已實現** - sentiment-line-chart 情緒標記顯示於圖表上

## Step 6.1

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​有​凍結​的​Header​顯示​基本​資料​]，​以​便​ [​在​查看​細​節時，​不​用​一直​翻到​最​前​面查​看標​的​公司​的​基本​資料]。​
  - _Tags: User Story-MVP, Step 6.1_
  - ✅ **已實現** - `/stocks/[ticker]` (Stock detail page) 提供凍結 Header
- [ ] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右滑動​畫面​中​段​查​看​不同​細​節]，​以​便​ ​[從​更​多​面向​去理​解這​公司​]。​
  - _Tags: User Story-MVP, Step 6.1_
  - ⏳ **待實現** - 左右滑動查看不同細節功能

## Step 6.2

- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​看到​所有​相關​文檔​在​清單​中]，​以​便​ [​提高​管理​效率]。​
  - _Tags: User Story-MVP, Step 6.2_
  - ✅ **已實現** - `/stocks/[ticker]` (Stock detail page) 顯示所有相關文檔
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​標題​旁​註明發​表時​間]，​以​便​ [評估​時效性]。​
  - _Tags: User Story-MVP, Step 6.2_
  - ✅ **已實現** - 文檔標題旁顯示發表時間
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​每​個​文檔​旁邊​註明情​緒​觀點與漲​跌​幅]，​以​便​ [評​估勝率]。​
  - _Tags: User Story-MVP, Step 6.2_
  - ✅ **已實現** - 情緒觀點 + 5 日/30 日漲跌幅已顯示於標的詳情頁
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點擊​以​移轉​到​單篇文​檔]，​以​便​ ​[查​看​特定​文檔]。​
  - _Tags: User Story-MVP, Step 6.2_
  - ✅ **已實現** - 點擊文檔可查看詳情

## Step 6.4

- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​縮放線​圖]，​以​便​ [​更​好​的​理解​走​勢]。​
  - _Tags: User Story-MVP, Step 6.4_
  - ✅ **已實現** - chart-toolbar 支援日/週/月/季/年 + 1M/1Q/YTD/1Y/5Y
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​左右平移線​圖]，​以​便​ ​[查​看​先​前​/​後續​的​走勢]。​
  - _Tags: User Story-MVP, Step 6.4_
  - ✅ **已實現** - Lightweight Charts 內建平移功能
- [x] 作為​一​個​ [​個股​研究者​]，​我​想​要​ [​在​線圖​上​檢視​所有​文檔​傳達​的​走勢​情​緒]，​以​便​ [對時機點​進行​更​準確​的​對照]。​
  - _Tags: User Story-MVP, Step 6.4_
  - ✅ **已實現** - sentiment-line-chart 顯示所有 KOL 文檔的情緒標記
- [x] 作為​一​個​ [​整理者​]，​我​想​要​ [​點擊​線圖​上​的​標記​以​移轉​到​單篇文​檔]，​以​便​ ​[查​看​特定​文檔]。​
  - _Tags: User Story-MVP, Step 6.4_
  - ✅ **已實現** - 點擊情緒標記可跳轉到對應文檔 (Stock 詳情頁)

## Step 7.1 — 認證強化 (Phase 11)

- [x] 作為一個 [新用戶]，我想要 [用 Google 帳號一鍵登入]，以便 [不用額外記一組帳密就能使用產品]。
  - _Tags: User Story-MVP, Step 7.1, Phase 11_
  - ✅ **已實現** - Google OAuth + GoogleIcon 元件 + 登入/註冊頁 UI 更新 + i18n
- [x] 作為一個 [用戶]，我想要 [在忘記密碼時能透過 Email 重設]，以便 [不會因為忘記密碼而無法使用產品]。
  - _Tags: User Story-MVP, Step 7.1, Phase 11_
  - ✅ **已實現** - `/reset-password` + `/reset-password/confirm` 頁面 + useAuth hook 整合
- [x] 作為一個 [管理者]，我想要 [用戶註冊時需通過 Email 驗證]，以便 [確保帳號的真實性]。
  - _Tags: User Story-MVP, Step 7.1, Phase 11_
  - ✅ **已實現** - Supabase client.ts 文件化設定，生產環境啟用即可

## Step 7.2 — KOL 匯入工具 (Phase 12)

- [x] 作為一個 [新用戶]，我想要 [貼上 KOL 的 Twitter/X Profile URL，自動匯入最近 5-10 則推文]，以便 [快速體驗產品的核心功能而不需手動逐一輸入]。
  - _Tags: User Story-MVP, Step 7.2, Phase 12_
  - ✅ **已實現** - TwitterExtractor (oEmbed) + 批量匯入管線 + `/import` 頁面 + use-import hook
- [x] 作為一個 [新用戶]，我想要 [貼上 YouTube 頻道 URL，自動匯入最近 5-10 部影片的逐字稿]，以便 [將影片形式的投資觀點也快速納入追蹤]。
  - _Tags: User Story-MVP, Step 7.2, Phase 12_
  - ✅ **已實現** - YouTubeExtractor (oEmbed + youtube-transcript) + ExtractorFactory 註冊
- [x] 作為一個 [用戶]，我想要 [在匯入過程中看到即時進度 (擷取中、AI 分析中、完成)]，以便 [了解系統正在處理且不會離開頁面]。
  - _Tags: User Story-MVP, Step 7.2, Phase 12_
  - ✅ **已實現** - import-loading-overlay (7 步驟動畫進度) + import-result 結果頁
- [x] 作為一個 [用戶]，我想要 [匯入完成後自動跳轉到該 KOL 的詳情頁]，以便 [立刻看到 AI 分析結果和勝率統計]。
  - _Tags: User Story-MVP, Step 7.2, Phase 12_
  - ✅ **已實現** - 匯入結果頁「查看 KOL 詳情」按鈕導向 KOL detail page

## Step 7.3 — 用戶引導流程 (Phase 13)

- [x] 作為一個 [新用戶]，我想要 [首次登入時看到簡短的產品介紹引導 (2-3 步)]，以便 [快速理解產品能幫我做什麼]。
  - _Tags: User Story-MVP, Step 7.3, Phase 13_
  - ✅ **已實現** - `/onboarding` 3 步驟引導 (產品介紹 → KOL 匯入 → 完成)
- [x] 作為一個 [新用戶]，我想要 [在引導流程中直接體驗 KOL 匯入功能]，以便 [用實際資料感受產品價值而非看到空白頁面]。
  - _Tags: User Story-MVP, Step 7.3, Phase 13_
  - ✅ **已實現** - Onboarding Step 2 嵌入 Phase 12 匯入工具 + 首次匯入免配額徽章
- [x] 作為一個 [用戶]，我想要 [在空白頁面看到有意義的提示和行動按鈕]，以便 [知道下一步該做什麼而不是面對空白畫面]。
  - _Tags: User Story-MVP, Step 7.3, Phase 13_
  - ✅ **已實現** - Empty States 元件 (Dashboard, KOLs, Stocks, Posts, Drafts, Bookmarks) + CTA 按鈕
- [x] 作為一個 [用戶]，我想要 [引導流程只出現一次，完成後不再重複觸發]，以便 [不被重複的引導打擾]。
  - _Tags: User Story-MVP, Step 7.3, Phase 13_
  - ✅ **已實現** - `profiles.onboarding_completed` 欄位 + `onboarding-guard.tsx` 偵測邏輯 + PATCH API

## Step 7.4 — KOL Profile 爬取 + 訂閱監控 (Phase 12b, v0.2.0)

- [ ] 作為一個 [用戶]，我想要 [貼上 KOL 的 YouTube 頻道 URL，系統自動爬取該頻道最近 50 部影片並匯入]，以便 [一次取得大量歷史觀點而不需逐一輸入]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - YouTubeChannelExtractor + profile-scrape.service + scrape_jobs 背景佇列
- [ ] 作為一個 [用戶]，我想要 [在爬取過程中看到即時進度 (已處理/總數)]，以便 [了解系統正在處理且預估等待時間]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - scrape-progress 元件 + React Query polling + /api/scrape/jobs/[id]
- [ ] 作為一個 [用戶]，我想要 [訂閱 KOL 的頻道，系統每天自動檢查並匯入新影片]，以便 [不用手動回來重新爬取]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - kol_subscriptions 表 + subscription-toggle + Vercel Cron 每日監控
- [ ] 作為一個 [用戶]，我想要 [在 KOL 詳情頁看到「追蹤」按鈕並管理所有訂閱]，以便 [集中管理我關注的 KOL]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - /subscriptions 頁面 + KOL 詳情頁 subscription-toggle + i18n
- [ ] 作為一個 [系統]，我想要 [當多位用戶爬取同一 KOL 時，共享已爬取的文章而非重複建立]，以便 [節省 AI 分析資源與儲存空間]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - 全域 UNIQUE(source_url) + kol_sources UNIQUE(platform, platform_id) + quotaExempt
- [ ] 作為一個 [用戶]，我想要 [爬取 50 部影片在 25-45 分鐘內完成（而非 80+ 分鐘）]，以便 [更快看到完整的 KOL 歷史績效分析]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b-8_
  - ⏳ **待實現** - Promise.allSettled 平行 AI 分析 (8-10 篇/批次) + 進度 UI 每 5s 輪詢 + Gemini RPM 限流保護
- [ ] 作為一個 [免費用戶]，我想要 [追蹤最多 10 位 KOL，付費用戶最多 50 位]，以便 [在合理限制下使用自動監控功能]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b-4_
  - ⏳ **待實現** - subscription.repository 額度檢查 + profiles 表 tier 欄位 + API 端點驗證
- [ ] 作為一個 [系統]，我想要 [每位新訂閱者觸發該 KOL 額外 10 篇更早文章爬取，上限 200 影片/500 推文/500 貼文]，以便 [透過群眾效應逐步加深歷史資料深度]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b_
  - ⏳ **待實現** - scrape orchestrator 擴展觸發邏輯 + kol_sources.posts_scraped_count 上限檢查 + 達上限通知
- [ ] 作為一個 [用戶]，我想要 [貼上 KOL 的 Twitter/X Profile URL，系統自動爬取推文]，以便 [追蹤 Twitter 上的投資 KOL]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b-5_
  - ⏳ **待實現** - TwitterProfileExtractor + X API v2 pay-as-you-go 整合
- [ ] 作為一個 [用戶]，我想要 [貼上 KOL 的 Instagram 或 Facebook Profile URL，系統自動爬取貼文]，以便 [追蹤 Meta 平台上的投資 KOL]。
  - _Tags: User Story-v0.2.0, Step 7.4, Phase 12b-9_
  - ⏳ **待實現** - InstagramProfileExtractor + FacebookPageExtractor + Bright Data/Apify 第三方整合

## Step 8.1 — 行銷首頁 (Phase 17, v0.2.0)

- [ ] 作為一個 [潛在用戶]，我想要 [在首頁看到產品的核心功能介紹和價值主張]，以便 [快速判斷這個產品是否適合我]。
  - _Tags: User Story-v0.2.0, Step 8.1, Phase 17_
  - ⏳ **待實現** - Hero + 痛點陳述 + 功能卡片 (6 項) + 使用流程 (3 步驟)
- [ ] 作為一個 [潛在用戶]，我想要 [在首頁看到免費方案與付費方案的比較]，以便 [了解我可以免費使用哪些功能]。
  - _Tags: User Story-v0.2.0, Step 8.1, Phase 17_
  - ⏳ **待實現** - Freemium 定價表 (Free vs Pro) + FAQ 區塊
- [ ] 作為一個 [潛在用戶]，我想要 [點擊「免費試用」或「註冊」按鈕直接跳轉到註冊頁]，以便 [立即開始使用產品]。
  - _Tags: User Story-v0.2.0, Step 8.1, Phase 17_
  - ⏳ **待實現** - CTA 按鈕導向 `/register` + 已登入用戶顯示「前往 Dashboard」
- [ ] 作為一個 [用戶]，我想要 [在首頁切換繁體中文和英文]，以便 [用自己熟悉的語言瀏覽產品介紹]。
  - _Tags: User Story-v0.2.0, Step 8.1, Phase 17_
  - ⏳ **待實現** - 導覽列語言切換 + `landing.json` i18n (zh-TW + en)

## Step 8.2 — AI 模型版本追蹤 + 重新分析 (Phase 15-lite, v0.2.0)

- [ ] 作為一個 [用戶]，我想要 [當 AI 模型升級後，能重新分析舊文章以獲得更精準的情緒/論點結果]，以便 [受益於 AI 模型的持續改進]。
  - _Tags: User Story-v0.2.0, Step 8.2, Phase 15-lite_
  - ⏳ **待實現** - posts.ai_model_version 欄位 (migration) + 重新分析 API + 單篇/批量重新分析按鈕 + i18n

---

## ✨ 已實現的新功能（不在原始 User Story）

以下功能在開發過程中新增，提供額外的用戶價值：

### AI 增強功能 (Web 版 2026-02)

1. ✅ **AI 情緒分析** - Gemini API 整合，自動判斷文章看多/看空 (-2~+2)
2. ✅ **AI Ticker 識別** - 從文章自動辨識股票代碼 (US/TW/HK/Crypto)
3. 🔄 **AI 論點提取** - 依 7 大分析框架類別提取投資論點 (後端完成，前端 UI 暫以 ArgumentPlaceholder 取代，待重新啟用)
4. ✅ **AI 配額管理** - 使用次數追蹤與 `ai-quota-badge.tsx` 顯示
5. ✅ **DB 原子操作** - create_post_atomic() + refund_ai_quota() + ai_quota 非負 CHECK (migration 013-015, 018)

### UI/UX 增強功能

5. ✅ **國際化 (i18n)** - next-intl 支援繁體中文 + 英文
6. ✅ **Dashboard 儀表板** - 統計總覽頁面 + API
7. ✅ **情緒折線圖** - `sentiment-line-chart.tsx` 時間趨勢圖
8. ✅ **Sidebar + Mobile Nav** - 響應式導覽架構
9. ✅ **三角標記圖表元件** - triangle-markers-primitive.ts — K 線圖情緒三角形 (▲/▼/●)
10. ✅ **PriceChangeBadge** - 可複用漲跌幅 badge，整合色盤系統
11. ✅ **已讀追蹤** - use-seen-posts.ts — localStorage 追蹤最近 500 則已讀文章

### 管理功能

12. ✅ **書籤管理** - full-stack 書籤功能 (`use-bookmarks.ts` hook)
13. ✅ **Profile 時區** - 用戶時區設定支援
14. ✅ **URL 擷取框架** - ExtractorFactory + Twitter/Facebook/Threads stubs
15. ✅ **色盤偏好設定** - Asian (紅漲綠跌) / American (綠漲紅跌)，settings 頁面切換 + ColorPaletteProvider + 全 UI 元件動態套用
16. ✅ **KOL 歸屬論點** - Stock Arguments Tab 顯示 KOL 頭像與名稱，論點來源可溯
17. ✅ **論點 per-user 隔離** - 移除全域 stock_argument_summary 表，改為 real-time 計算；RLS 收緊 (migration 012)
18. ✅ **AI 論點擷取上限調整** - 每篇文章最多 5 則論點 (原 10)，降低 token 消耗與雜訊

### A/B 測試與預註冊體驗

19. ✅ **A/B 測試框架** - ab-test.ts + ab-experiment.repository + /api/ab/events + middleware 50/50 分流 (migration 017)
20. ✅ **Welcome 頁面 (Variant B)** - /welcome 2 步驟預註冊體驗，匿名 session + 資料保留至註冊
21. ✅ **統一錯誤處理** - ApiError class (fetch-error.ts) + parse-error.ts + 全 API routes 結構化錯誤回應
22. ✅ **驗證模組擴充** - validation.ts 統一 Zod schemas (posts, KOLs, stocks, bookmarks, drafts, profile, AI)
23. ✅ **KOL/Stock 統計 Views** - kol_stats + stock_stats materialized views (migration 016)

### 開發工具

24. ✅ **CI/CD** - GitHub Actions (lint + type-check + test)
25. ✅ **E2E 測試框架** - Playwright + fixtures + teardown
26. ✅ **安全機制** - Git Pre-commit Hook 防止 API Keys 洩露
27. ✅ **Hook 測試套件** - 5 hooks + 1 repository 單元測試 (use-ai, use-drafts, use-kols, use-posts, use-quick-input, ai-usage.repository)
28. ✅ **測試工具** - query-wrapper.tsx — React Query provider wrapper for hook testing

---

## 🔐 API Keys Reminder (開發階段專用)

**⚠️ 重要提醒：當前使用的 API Keys 僅限開發階段使用**

**🚨 安全警告：請勿在版本控制系統中提交真實的 API Keys！**

### 目前配置的 API Keys：

1. **Tiingo API Token**: `YOUR_TIINGO_API_TOKEN`
   - 免費額度：1000 次請求/天，500 檔股票/月
   - 請在 `.env` 檔案中設定：`TIINGO_API_TOKEN=your_token_here`
2. **Gemini API Key**: `YOUR_GEMINI_API_KEY`
   - 免費額度：15 次請求/分鐘，1500 次請求/天
   - 請在 `.env` 檔案中設定：`GEMINI_API_KEY=your_key_here`

### 📋 上線前必做事項：

- [ ] 為正式環境申請新的 Tiingo API Token
- [ ] 為正式環境申請新的 Gemini API Key
- [ ] 更新 `.env` 檔案中的 API Keys
- [ ] 確認 `.env` 已加入 `.gitignore`，避免洩漏至版控系統
- [ ] **立即撤銷或刪除已洩露的 API Keys**（如果已提交到 git 歷史）
- [ ] 檢查 git 歷史記錄，考慮使用 `git filter-branch` 或 BFG Repo-Cleaner 清理已洩露的憑證

### 🔗 API Keys 申請連結：

- Tiingo: https://www.tiingo.com/ → Sign Up → API Token
- Google Gemini: https://aistudio.google.com/ → Get API Key

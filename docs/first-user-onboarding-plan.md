# 讓第一個用戶自己上手：最小改動清單

> 目標：你的朋友收到私訊後，從註冊到看見 KOL 勝率，全程不需要問你問題。
> 原則：改最少的東西。不做新 onboarding 系統，只優化現有路徑。

---

## 現狀分析

**目前新用戶路徑：**
```
註冊 → 登入 → middleware 導向 /input → ???
```

**問題：** 用戶到了 /input 之後，不知道：
1. 該做什麼（貼什麼？貼到哪裡？）
2. 要不要花錢（credits 是什麼？）
3. 結果長什麼樣（值不值得我繼續用？）

**已有的好東西（不需要重做）：**
- ✅ Scrape 5 步驟流程圖（視覺化引導）
- ✅ URL 探索 + 選擇（用戶有控制感）
- ✅ 首次匯入免費（`first_import_free` flag）
- ✅ 自動跳轉到 KOL 詳情頁（即時看到價值）
- ✅ Empty States 有 CTA 按鈕
- ✅ Credit badge 在 sidebar

---

## 只需要改 3 件事

### 改動 1：首次用戶 Hero Banner（最重要）

**位置：** `/input` 頁面（或 scrape 頁面，看 middleware 導向哪個）

**觸發條件：** `first_import_free === true`（只有新用戶看到）

**內容：**
```
┌─────────────────────────────────────────────────┐
│  🎯 追蹤你的第一個投資 KOL                        │
│                                                   │
│  貼上 YouTube 頻道連結，AI 自動分析觀點勝率        │
│  首次完全免費，不需信用卡                          │
│                                                   │
│  ┌──────────────────────────────────────┐        │
│  │ https://youtube.com/@...             │        │
│  └──────────────────────────────────────┘        │
│                                                   │
│  不確定要貼什麼？試試看：                          │
│  [股癌 Gooaye]  [柴鼠兄弟]  [財報狗]              │
│                                                   │
└─────────────────────────────────────────────────┘
```

**實作細節：**
- 在 scrape page 最上方加 conditional banner
- 用 `useCreditInfo()` 或直接 fetch profile 取 `first_import_free`
- 「試試看」按鈕 = 預填 URL 到 input field，不是自動送出（讓用戶有控制感）
- `first_import_free` 變 false 後，banner 消失，永遠不再出現
- 不需要新的 API、不需要新的 DB column

**建議的預設 KOL（挑 3 個有大量 YouTube 內容的台灣財經 KOL）：**
- 確認這些 KOL 的頻道 URL 在 scrape flow 中能成功跑完
- 在 private beta 之前先自己跑過一遍，確保數據有意義

**檔案改動：**
```
src/app/(app)/input/page.tsx     → 加 Hero Banner 元件（或 scrape page）
src/components/scrape/           → 新增 first-time-hero.tsx（~50 行）
src/messages/zh-TW/scrape.json   → 加幾行 i18n
src/messages/en/scrape.json      → 加幾行 i18n
```

---

### 改動 2：「首次免費」標示更明顯

**問題：** 用戶不知道 credit system 怎麼運作，看到「消耗 N 點」會猶豫。

**做法：** 在 scrape flow 的 URL 發現列表（Step 2）的費用摘要旁邊，加一個明確的提示：

```
預估消耗：210 點
剩餘額度：850 / 850 點
🎁 首次匯入免費 — 本次不扣點
```

**觸發條件：** 同樣是 `first_import_free === true`

**檔案改動：**
```
src/components/scrape/url-discovery-list.tsx  → 在 footer 加 conditional 免費提示
```

大約 10 行程式碼。

---

### 改動 3：middleware 導向 scrape 頁面（而非 quick input）

**問題：** 目前 middleware 把新用戶導向 `/input`（快速輸入 = 單一 URL）。
但 scrape flow（頻道批量匯入）才能給出最有衝擊力的「第一印象」——
一次匯入 20-50 篇 → 立刻看到勝率曲線。

**做法：**
```typescript
// middleware.ts
// 改: / → /input (authed)
// 為: / → /scrape (authed)  ← 或你的 scrape page 路徑
```

**或者更簡單：** 不改 middleware，只在 `/input` 的 Hero Banner 中，
把 CTA 按鈕做成「前往頻道匯入」的連結，引導到 scrape page。

**取決於你的判斷：** 你的朋友會先貼單一影片 URL 還是整個頻道？
- 如果你會在私訊中給他頻道 URL → 導向 scrape page
- 如果你會給他單一影片 URL → 留在 /input

---

## 不需要改的東西（忍住）

| 想改的                     | 為什麼不改                                     |
| -------------------------- | ---------------------------------------------- |
| 重新設計 onboarding 流程   | 你只有 <5 個用戶，不需要系統化引導             |
| 加 product tour / tooltip  | 你會在私訊中親自教，比任何 tooltip 都有效       |
| 做 landing page            | TME：先賣給 100 人，再做 marketing              |
| 接 Stripe                  | 你連第一個 free user 都還沒有                   |
| 多語言完善                 | 你的前 5 個用戶都是台灣人，zh-TW 就夠了        |
| 做 demo 影片               | 等你有 10 個用戶、知道他們怎麼用之後再做        |

---

## 實作順序（建議用 1-2 小時搞定）

```
Step 1: 選 3 個預設 KOL，自己先跑一遍 scrape flow
        → 確認整條路徑能走完、數據有意義
        → 這是 QA，不是開發

Step 2: 寫 first-time-hero.tsx (~50 行)
        → conditional banner + 預設 KOL 按鈕
        → 加到 scrape page 或 input page

Step 3: url-discovery-list.tsx 加「首次免費」提示 (~10 行)

Step 4: 自己用一個新帳號走一次完整流程
        → 註冊 → 看到 banner → 點預設 KOL → 跑完 → 看到勝率
        → 如果哪裡卡住，那就是你朋友也會卡住的地方

Step 5: 私訊你那個最愛聊股票的朋友
```

---

## 你私訊朋友時的話術（搭配使用）

> 欸，你之前不是常看 [具體 KOL 名字] 的影片？
> 我最近做了一個工具可以回測他推薦的股票到底準不準，
> 結果還蠻意外的。
>
> 你要不要試試看？我幫你開了帳號，首次免費。
> 連結：[你的 URL]
> 進去之後直接點「[KOL 名字]」就可以了。
>
> 跑完大概 5 分鐘，你看看結果覺得合理嗎？

**關鍵：**
- 用「具體 KOL 名字」開頭，不是「我做了一個產品」
- 告訴他要做什麼（點那個按鈕）
- 給他一個任務（看看結果合理嗎）
- 不要解釋 credit system、不要解釋技術架構

---

## 成功指標

這輪改動的唯一衡量標準：

**你的朋友能不能在沒有你即時指導的情況下，
從收到連結到看見第一個 KOL 的勝率結果？**

如果可以 → 你就準備好找下一個人了。
如果不行 → 他卡在哪裡，就是你下一個要修的地方。

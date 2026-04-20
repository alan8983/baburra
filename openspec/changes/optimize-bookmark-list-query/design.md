## Context

Supabase PostgREST 支援透過 FK 關係做 nested select：
```ts
supabase.from('bookmarks').select(`
  *,
  post:posts!inner (
    id, title, content, sentiment, posted_at,
    kol:kols (id, name, avatar_url),
    post_stocks (stocks (id, ticker, name))
  )
`)
```
這會在 DB 端用 JOIN 一次拿齊所有資料，回傳巢狀 JSON。目前 `listBookmarksByUserId` 沒用這個能力。

Stakeholder：效能（延遲降低）、成本（Supabase request 配額）。

## Goals / Non-Goals

**Goals:**
- 從 5 次 round trip 縮為 1 次
- 回傳 shape 與呼叫端契約完全一致（zero caller change）
- 保留已刪 post 的孤兒 bookmark 過濾邏輯

**Non-Goals:**
- 不追求把所有 repository 都改用 embedding（別的 repo 各自評估）
- 不加 Supabase view 或 stored procedure
- 不改分頁語義

## Decisions

### D1. Embedding 語法採用 `!inner` join

**Chosen**：`post:posts!inner (...)` — inner join 確保回傳列必有對應 post；沒 post 的孤兒 bookmark 會在 DB 端被過濾掉。

**理由**：
- 原本的 `filter(b => postMap[b.postId])` 正是在做孤兒過濾，用 `!inner` 把這個邏輯下推到 DB 更高效
- 省掉 JS 端的 map / filter / hydrate 邏輯

**Alternative considered**：left join（`post:posts`）+ JS 過濾。拒絕理由：回傳更多無用資料、總行數計數會失準。

### D2. 保持 `BookmarkWithPost` 型別

Mapping function 從 flat 結構變成 nested，但最終 camelCase 型別 `BookmarkWithPost` 不變。caller（hooks、UI）無需任何調整。

### D3. Count 查詢

原本用 `{ count: 'exact', head: false }` 拿總數。embedding + inner join 後，count 仍可用但會計入孤兒過濾後的 row 數。這**符合**使用者期待（UI 分頁數不該包含已刪 post 的 bookmarks）。

### D4. 欄位白名單

目前 code 只取 post 的 `id, kol_id, title, content, sentiment, posted_at`；KOL 取 `id, name, avatar_url`；stock 取 `id, ticker, name`。新版保持同樣欄位清單（避免意外洩漏其他欄位到 client）。

## Risks / Trade-offs

- **[R1] PostgREST embedding 對 JSON 結構敏感** → Mitigation：加單元測試驗證回傳結構逐欄比對原實作的結果
- **[R2] 巢狀 JSON 比原本的 5 次 flat 查詢 payload 大一些**（重複 KOL 資料會 inline 多次） → 實務上 50 筆 bookmarks × 每筆一個 KOL ≈ 10KB，可接受；整體仍淨省延遲
- **[R3] `post_stocks` 多對多關係透過兩層 embedding** → 需驗證 PostgREST 能正確 resolve `post_stocks (stocks (...))` 的兩層巢狀；若不行，退回「post_stocks(stock_id), stocks(...)` + JS join」但仍是 2 次查詢（比原本 5 次好）
- **[R4] Count 行為微變**（排除孤兒 bookmark） → 不算 breaking：UI 原本也不會顯示孤兒

## Migration Plan

1. 在本地用 Supabase CLI 或 dashboard 試 query，確認 PostgREST 接受語法與回傳結構
2. 改寫 `listBookmarksByUserId`；保留舊 function body 的 comment 一份供 PR review 比對
3. 加測試驗證 shape / count / 孤兒過濾
4. 本地 benchmark：`console.time` 舊 vs 新，記錄 round trip 數
5. 部署到 preview，抽查 bookmarks 列表頁
6. 若 preview 沒問題，merge 到 main

**Rollback**：revert commit；無 DB 變更所以純 code rollback

## Open Questions

- 是否需要同步修正 `listBookmarksByUserId` 以外的類似 N+1？→ 不，scope 限於 bookmark；其他 repo 未來評估

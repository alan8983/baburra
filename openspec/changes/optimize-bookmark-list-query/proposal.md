## Why

`listBookmarksByUserId` (`src/infrastructure/repositories/bookmark.repository.ts:22-134`) 採用循序分段查詢 pattern：先撈 bookmarks → 再用 id 撈 posts → 再撈 KOL + post_stocks → 再撈 stocks。一次列表共 4-5 個 round trip（bookmarks, posts, kols, post_stocks, stocks），每次約 50-200ms。

架構審查（`/root/.claude/plans/ancient-imagining-papert.md` H2 條目）將此標記為高風險，主因：
1. 淨延遲放大 4-5 倍（200ms-1s）
2. Supabase API request 配額放大 4-5 倍（Pro 方案月 5M 限制）
3. 查詢分散在 JS 邏輯中，DB query planner 無法優化
4. 多次查詢之間有資料不一致風險（中途其他 transaction 修改）
5. 一旦 bookmarks 列表被放上高流量頁面（dashboard widget），會成為 DB CPU 瓶頸

## What Changes

- 把 `listBookmarksByUserId` 改用 PostgREST 的 **nested select (FK embedding)**，一次查詢拿齊 bookmark + post + kol + post_stocks + stocks
- 保留現有的 `BookmarkWithPost` 回傳型別（camelCase 映射）
- 保留現有的 `filter(b => postMap[b.postId])` 邏輯（擋已刪 post 的孤兒 bookmark）
- 保留分頁行為（page / limit）
- 不動其他 bookmark 函式（`isBookmarked` / `addBookmark` / `removeBookmark` 維持原樣）

**非目標**：
- 不改 `BookmarkWithPost` 型別結構（避免 caller 連動改動）
- 不改 bookmarks schema 或加 view / materialized view
- 不動授權邏輯（仍用 `user_id = userId` filter）

## Capabilities

### Modified Capabilities
- `data-access`: `listBookmarksByUserId` 內部查詢實作從 5 次循序查詢改為 1 次 nested select；回傳型別與語義不變

## Impact

- **Code**: 僅 `src/infrastructure/repositories/bookmark.repository.ts`
- **Tests**: 擴充 `src/infrastructure/repositories/__tests__/bookmark.repository.test.ts`（若無則建立），驗證回傳 shape 與原本一致 + 計時 benchmark
- **DB**: 無 schema 變更；但**需確認** `post_stocks(post_id, stock_id)` FK 已設，否則 embedding 會失敗（應該本就存在）
- **User-visible**: bookmarks 列表頁載入時間應縮短；功能行為不變
- **Dependencies**: 無
- **Independence**: **完全獨立**，只改一個 repository 函式，可與其他 architecture-review change 並行

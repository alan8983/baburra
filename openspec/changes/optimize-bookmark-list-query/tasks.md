## 1. 前置驗證

- [ ] 1.1 確認 `post_stocks` 有 FK 到 `posts(id)` 與 `stocks(id)`（查 migrations 或 `supabase inspect db-table-sizes`）
- [ ] 1.2 在 Supabase dashboard SQL editor 或本地，用 PostgREST REST API 試一次 nested select 確認回傳結構（可貼在此 task 的 checkbox 附近供 PR review 參考）

## 2. 重構實作

- [ ] 2.1 在 `src/infrastructure/repositories/bookmark.repository.ts` 改寫 `listBookmarksByUserId`：
  - 使用單一 `.select('*, post:posts!inner(...)')` 查詢
  - 欄位對齊原版：post 取 `id, title, content, sentiment, posted_at`；kol 取 `id, name, avatar_url`；stock 取 `id, ticker, name`
  - 保留 `count: 'exact'` 計數
  - 保留 `.eq('user_id', userId)` 與分頁 `.range(from, to)`
- [ ] 2.2 更新 `mapDbToBookmarkWithPost`（或類似 helper）處理 nested 結構，輸出原本的 `BookmarkWithPost` 型別
- [ ] 2.3 刪除原本分階段撈 posts/kols/stocks 的 code
- [ ] 2.4 保留 `isBookmarked`, `addBookmark`, `removeBookmark` 完全不動

## 3. 測試

- [ ] 3.1 在 `src/infrastructure/repositories/__tests__/bookmark.repository.test.ts` 新增（或擴充）測試：
  - 回傳 shape 符合 `BookmarkWithPost` 型別
  - 使用者 A 看不到使用者 B 的 bookmarks（授權）
  - 已刪 post 的 bookmark 不會出現在列表中
  - 分頁 `page=2, limit=10` 正確跳過前 10 筆
- [ ] 3.2 加一個 console.time benchmark 或 inline doc comment 記錄改前改後的查詢數（1 vs 5）

## 4. 驗證

- [ ] 4.1 `npm run type-check` clean
- [ ] 4.2 `npm run lint` clean
- [ ] 4.3 `npm test src/infrastructure/repositories` 全綠
- [ ] 4.4 啟動 dev server，訪問 `/bookmarks` 頁面，確認列表正確顯示
- [ ] 4.5 開 DevTools Network tab，確認只有一次 `/rest/v1/bookmarks?...` 請求（不再有 posts/kols/stocks 的後續請求）

## 5. Archive

- [ ] 5.1 PR merge 後執行 `/opsx:archive optimize-bookmark-list-query`

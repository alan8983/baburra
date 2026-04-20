## 1. 實作

- [ ] 1.1 在 `src/app/api/posts/[id]/route.ts` 的 GET handler 頂端新增可見性政策註解（見 design.md D3）
- [ ] 1.2 在 GET handler 內加 `const userId = await getCurrentUserId();` + `if (!userId) return unauthorizedError();`
- [ ] 1.3 保留原本的 `getPostById(id)` 呼叫（不傳 userId，因為是 authenticated-public）
- [ ] 1.4 確認 `unauthorizedError` 已從 `@/lib/api/error` import

## 2. 測試

- [ ] 2.1 在 `src/app/api/posts/[id]/` 下建立或擴充測試檔（若無測試檔則建立 `route.test.ts`）
- [ ] 2.2 測試 case：未登入呼叫 GET 應回 401
- [ ] 2.3 測試 case：登入呼叫 GET 應回 200 + post 內容
- [ ] 2.4 測試 case：登入但 post 不存在應回 404

## 3. 審閱其他端點（僅審閱，不改動）

- [ ] 3.1 檢查 `src/app/api/kols/[id]/route.ts` GET 是否有 auth 註解；若無，記錄到 follow-up issue（不在此 change 範圍內修）
- [ ] 3.2 檢查 `src/app/api/stocks/[ticker]/route.ts` GET 是否有 auth 註解；若無，記錄到 follow-up issue

## 4. 驗證

- [ ] 4.1 `npm run type-check` clean
- [ ] 4.2 `npm run lint` clean
- [ ] 4.3 `npm test src/app/api/posts` 全綠
- [ ] 4.4 手動：`curl -i http://localhost:3000/api/posts/<real-id>` 未登入情境回 401
- [ ] 4.5 手動：登入後同樣 curl 回 200

## 5. Archive

- [ ] 5.1 PR merge 後執行 `/opsx:archive secure-post-detail-get`

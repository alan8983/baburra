## 1. 建立常數

- [x] 1.1 新增 `src/lib/constants/dashboard.ts`
- [x] 1.2 匯出 `DASHBOARD_RECENT_POSTS_LIMIT = 5`（含 JSDoc 說明用途）

## 2. 替換 API route 的硬編碼

- [x] 2.1 在 `src/app/api/dashboard/route.ts` import 常數
- [x] 2.2 將 line 92（或對應位置）的 `limit: 5` 改為 `limit: DASHBOARD_RECENT_POSTS_LIMIT`
- [x] 2.3 `grep -n "\blimit: 5\b" src/app/api/dashboard/route.ts` 確認無其他硬編碼遺漏

## 3. 審閱前端是否同步

- [x] 3.1 `grep -rn "\b5\b" src/app/\(app\)/dashboard/` 與 `src/components/dashboard*/` 找可疑硬編碼
- [x] 3.2 若前端有硬編 5（如 `slice(0, 5)`、`.slice(-5)`、`take(5)` 等）用來渲染「最近 post」，改為 import 常數
- [x] 3.3 若前端完全靠 API 回傳的資料量（不再裁切），記錄在 PR 描述中說明「前端無硬編碼」

## 4. 測試

- [x] 4.1 若 `dashboard/route.test.ts` 存在，確認測試斷言用常數而非 `5`
- [x] 4.2 若無測試，不強制新增（此 change 是 refactor，非新功能）

## 5. 驗證

- [x] 5.1 `npm run type-check` clean
- [x] 5.2 `npm run lint` clean
- [x] 5.3 `npm test` 全綠
- [x] 5.4 `npm run dev`，打開 `/dashboard`，確認「最近動態」仍顯示 5 筆

## 6. Archive

- [ ] 6.1 PR merge 後執行 `/opsx:archive extract-dashboard-recent-posts-limit`
